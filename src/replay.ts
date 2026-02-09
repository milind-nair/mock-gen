import express from 'express';
import cors from 'cors';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs/promises';
import { decodeBody, RecordingSession } from './recording.js';

export interface ReplayOptions {
  recording: string;
  host: string;
  port: number;
  loop: boolean;
  useLatency: boolean;
}

export interface StartedServer {
  server: http.Server | https.Server;
  baseUrl: string;
  close: () => Promise<void>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface EntryBucket {
  entries: RecordingSession['entries'];
  index: number;
}

export async function startReplayServer(options: ReplayOptions): Promise<StartedServer> {
  const filePath = options.recording;
  const raw = await fs.readFile(filePath, 'utf8');
  const session = JSON.parse(raw) as RecordingSession;

  const buckets = new Map<string, EntryBucket>();
  for (const entry of session.entries) {
    const key = `${entry.request.method.toUpperCase()} ${entry.request.url}`;
    const bucket = buckets.get(key) ?? { entries: [], index: 0 };
    bucket.entries.push(entry);
    buckets.set(key, bucket);
  }

  const app = express();
  app.use(cors());

  app.all('*', async (req, res) => {
    const key = `${req.method.toUpperCase()} ${req.originalUrl}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.entries.length === 0) {
      res.status(404).json({ error: 'No recording for this request', key });
      return;
    }

    const entry = bucket.entries[bucket.index];
    if (options.loop) {
      bucket.index = (bucket.index + 1) % bucket.entries.length;
    } else {
      bucket.index = Math.min(bucket.index + 1, bucket.entries.length - 1);
    }

    if (options.useLatency && entry.response.latency > 0) {
      await sleep(entry.response.latency);
    }

    for (const [header, value] of Object.entries(entry.response.headers)) {
      const lower = header.toLowerCase();
      if (['content-length', 'connection'].includes(lower)) continue;
      res.setHeader(header, value);
    }

    const body = decodeBody(entry.response.body);
    res.status(entry.response.status);
    if (!body || body.length === 0 || req.method.toUpperCase() === 'HEAD') {
      res.end();
      return;
    }
    res.send(body);
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(options.port, options.host, () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  const baseUrl = `http://${options.host}:${port}`;

  console.log('\nMock Gen Replay');
  console.log(`Recording: ${filePath}`);
  console.log(`Server:    ${baseUrl}`);
  console.log('');

  return {
    server,
    baseUrl,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}
