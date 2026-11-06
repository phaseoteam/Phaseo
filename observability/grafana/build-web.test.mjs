import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, open, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sourceMapFiles, validateSourceMaps } from './build-web.mjs';

test('source map preflight finds nested chunks and rejects partial uploads caused by oversized maps', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'phaseo-maps-'));
  try {
    await assert.rejects(validateSourceMaps(root), /no browser source maps/);
    const chunks = path.join(root, 'chunks');
    await mkdir(chunks);
    const file = path.join(chunks, 'page.js.map');
    await writeFile(file, '{}');
    assert.deepEqual(await sourceMapFiles(root), [file]);
    await validateSourceMaps(root);
    const handle = await open(file, 'r+');
    try { await handle.truncate(30_000_001); } finally { await handle.close(); }
    await assert.rejects(validateSourceMaps(root), /30 MB upload limit/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
