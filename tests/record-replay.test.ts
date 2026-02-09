import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startRecordingServer } from '../src/record.js';
import { startReplayServer } from '../src/replay.js';

async function startTargetServer() {
  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/ping')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/echo')) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString('utf8');
      res.setHeader('content-type', 'application/json');
      res.end(body || '{}');
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}

test('record and replay traffic', async () => {
  const target = await startTargetServer();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-gen-'));
  const recordingFile = path.join(tmpDir, 'session.json');

  const recorder = await startRecordingServer({
    target: target.baseUrl,
    output: recordingFile,
    host: '127.0.0.1',
    port: 0
  });

  try {
    const pingRes = await fetch(`${recorder.baseUrl}/ping`);
    assert.equal(pingRes.status, 200);
    const pingBody = await pingRes.json();
    assert.deepEqual(pingBody, { ok: true });

    const echoRes = await fetch(`${recorder.baseUrl}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello' })
    });
    assert.equal(echoRes.status, 200);
    const echoBody = await echoRes.json();
    assert.deepEqual(echoBody, { message: 'hello' });
  } finally {
    await recorder.close();
    await target.close();
  }

  const raw = await fs.readFile(recordingFile, 'utf8');
  const session = JSON.parse(raw);
  assert.equal(session.entries.length, 2);

  const replay = await startReplayServer({
    recording: recordingFile,
    host: '127.0.0.1',
    port: 0,
    loop: true,
    useLatency: false
  });

  try {
    const replayPing = await fetch(`${replay.baseUrl}/ping`);
    assert.equal(replayPing.status, 200);
    const replayPingBody = await replayPing.json();
    assert.deepEqual(replayPingBody, { ok: true });

    const replayEcho = await fetch(`${replay.baseUrl}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello' })
    });
    assert.equal(replayEcho.status, 200);
    const replayEchoBody = await replayEcho.json();
    assert.deepEqual(replayEchoBody, { message: 'hello' });
  } finally {
    await replay.close();
  }
});
