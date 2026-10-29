import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, open, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemo } from '../src/demo.mjs';
import { createBundle } from '../src/protocol.mjs';
import { importBundle, loadBundle } from '../src/store.mjs';

test('store imports idempotently, extends, preserves history on shortening and forks, and honors lock', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'koinos-store-'));
  try {
    const path = join(dir, 'project.json'), { bundle } = createDemo();
    await importBundle(path, createBundle(bundle.records.slice(0, 2)));
    await importBundle(path, bundle); await importBundle(path, bundle);
    const before = await readFile(path, 'utf8');
    await assert.rejects(importBundle(path, createBundle(bundle.records.slice(0, 1))), /shorten/);
    await assert.rejects(importBundle(path, createDemo().bundle), /conflict/);
    assert.equal(await readFile(path, 'utf8'), before);
    const lock = await open(`${path}.lock`, 'wx');
    await assert.rejects(importBundle(path, bundle), /locked/); await lock.close();
    assert.deepEqual(await loadBundle(path), bundle);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('concurrent store writers cannot silently replace one another', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'koinos-race-'));
  try {
    const path = join(dir, 'project.json');
    const candidates = [createDemo().bundle, createDemo().bundle];
    const outcomes = await Promise.allSettled(candidates.map(bundle => importBundle(path, bundle)));
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
    const persisted = await loadBundle(path);
    const winner = outcomes.findIndex(result => result.status === 'fulfilled');
    assert.deepEqual(persisted, candidates[winner]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
