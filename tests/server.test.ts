import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { startServer } from '../src/server.js';

test('stateful CRUD flow works', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-gen-config-'));
  const configPath = path.join(tmpDir, 'mock-gen.config.js');
  const configPayload = {
    spec: 'examples/openapi.yaml',
    port: 0,
    host: '127.0.0.1',
    watch: false,
    stateful: true,
    logging: { maxEntries: 50 },
    inspector: { enabled: false }
  };

  await fs.writeFile(configPath, `export default ${JSON.stringify(configPayload, null, 2)};`, 'utf8');
  const config = await loadConfig(configPath);

  const { baseUrl, close } = await startServer(config);

  try {
    const createRes = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', email: 'ada@example.com' })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.ok(created.id);

    const listRes = await fetch(`${baseUrl}/users`);
    assert.equal(listRes.status, 200);
    const list = await listRes.json();
    assert.ok(Array.isArray(list));
    assert.equal(list.length, 1);

    const getRes = await fetch(`${baseUrl}/users/${created.id}`);
    assert.equal(getRes.status, 200);
    const fetched = await getRes.json();
    assert.equal(fetched.id, created.id);

    const deleteRes = await fetch(`${baseUrl}/users/${created.id}`, { method: 'DELETE' });
    assert.equal(deleteRes.status, 204);

    const missingRes = await fetch(`${baseUrl}/users/${created.id}`);
    assert.equal(missingRes.status, 404);
  } finally {
    await close();
  }
});
