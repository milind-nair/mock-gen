import express from 'express';
import cors from 'cors';
import http from 'node:http';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { encodeBody, normalizeHeaders, RecordingEntry, RecordingSession, createPathMatcher } from './recording.js';

export interface RecordOptions {
  target: string;
  output: string;
  host: string;
  port: number;
  include?: string;
  statusFilter?: number[];
}

export interface StartedServer {
  server: http.Server | https.Server;
  baseUrl: string;
  close: () => Promise<void>;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function buildTargetUrl(base: string, originalUrl: string): string {
  const baseUrl = new URL(ensureTrailingSlash(base));
  const relative = originalUrl.startsWith('/') ? originalUrl.slice(1) : originalUrl;
  const combined = new URL(relative, baseUrl);
  return combined.toString();
}

async function resolveOutputPath(output: string): Promise<string> {
  const resolved = path.resolve(output);
  if (resolved.endsWith('.json')) {
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    return resolved;
  }
  await fs.mkdir(resolved, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(resolved, `recording-${stamp}.json`);
}

async function writeSession(pathname: string, session: RecordingSession) {
  const data = JSON.stringify(session, null, 2);
  await fs.writeFile(pathname, data, 'utf8');
}

export async function startRecordingServer(options: RecordOptions): Promise<StartedServer> {
  const outputPath = await resolveOutputPath(options.output);
  const matcher = createPathMatcher(options.include);
  const session: RecordingSession = {
    version: 1,
    target: options.target,
    createdAt: new Date().toISOString(),
    entries: []
  };

  let writeQueue = Promise.resolve();
  const queueWrite = () => {
    writeQueue = writeQueue.then(() => writeSession(outputPath, session));
    return writeQueue;
  };

  const app = express();
  app.use(cors());
  app.use(express.raw({ type: '*/*', limit: '20mb' }));

  app.all('*', async (req, res) => {
    const start = Date.now();
    try {
      const targetUrl = buildTargetUrl(options.target, req.originalUrl);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (!value) continue;
        const lower = key.toLowerCase();
        if (['host', 'content-length', 'connection'].includes(lower)) continue;
        if (Array.isArray(value)) {
          value.forEach((item) => headers.append(key, item));
        } else {
          headers.set(key, value);
        }
      }

      const method = req.method.toUpperCase();
      const hasBody = !['GET', 'HEAD'].includes(method);
      const bodyBuffer = req.body instanceof Buffer ? req.body : Buffer.from('');

      const response = await fetch(targetUrl, {
        method,
        headers,
        body: hasBody ? bodyBuffer : undefined
      });

      const responseBuffer = Buffer.from(await response.arrayBuffer());
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'content-length') return;
        res.setHeader(key, value);
      });

      res.status(response.status).send(responseBuffer);

      const latency = Date.now() - start;
      const shouldRecord = matcher(req.path) && (!options.statusFilter || options.statusFilter.includes(response.status));
      if (shouldRecord) {
        const entry: RecordingEntry = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          request: {
            method,
            url: req.originalUrl,
            headers: normalizeHeaders(req.headers),
            body: encodeBody(bodyBuffer)
          },
          response: {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: encodeBody(responseBuffer),
            latency
          }
        };
        session.entries.push(entry);
        await queueWrite();
      }
    } catch (error) {
      res.status(502).json({ error: 'Proxy request failed', message: (error as Error).message });
    }
  });

  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(options.port, options.host, () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  const baseUrl = `http://${options.host}:${port}`;

  console.log('\nMock Gen Recorder');
  console.log(`Target: ${options.target}`);
  console.log(`Proxy:  ${baseUrl}`);
  console.log(`Output: ${outputPath}`);
  console.log('');

  return {
    server,
    baseUrl,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}
