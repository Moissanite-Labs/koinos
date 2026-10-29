import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const cli = new URL('../src/cli.mjs', import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
test('CLI creates protected non-overwriting keys and portable verified demo exports', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'koinos-cli-'));
 try {
   const key = join(dir, 'identity.pem'), bundle = join(dir, 'demo.json'), store = join(dir, 'store.json');
   const generated = run('keygen', key); assert.equal(generated.status, 0, generated.stderr);
   assert.equal((await stat(key)).mode & 0o777, 0o600);
   assert.doesNotMatch(generated.stdout, /PRIVATE KEY/);
   const id = JSON.parse(generated.stdout).id;
   const authored = join(dir, 'authored.json'), body = join(dir, 'body.json');
   await writeFile(body, JSON.stringify({ title: 'CLI trial', description: 'Authored from body files', participants: [{ id, name: 'Author', kind: 'human' }] }));
   const created = run('create', authored, key, body); assert.equal(created.status, 0, created.stderr);
   assert.equal(run('create', authored, key, body).status, 1);
   await writeFile(body, JSON.stringify({ title: 'Terms', uri: 'https://example.invalid/terms', digest: 'a'.repeat(64), parties: [id] }));
   const appended = run('append', authored, key, 'agreement.proposed', body); assert.equal(appended.status, 0, appended.stderr);
   assert.equal(JSON.parse(appended.stdout).count, 2);
   assert.equal(JSON.parse(run('inspect', authored).stdout).agreements.length, 1);
   const before = await readFile(key, 'utf8'); assert.equal(run('keygen', key).status, 1); assert.equal(await readFile(key, 'utf8'), before);
   assert.equal(run('demo', bundle).status, 0);
   assert.equal(run('import', store, bundle).status, 0);
   const pin = JSON.parse(run('pin', store).stdout);
   assert.equal(run('verify', store, pin.head, pin.project).status, 0);
   assert.equal(run('verify', store, '0'.repeat(64)).status, 1);
   assert.doesNotMatch(await readFile(bundle, 'utf8'), /PRIVATE KEY/);
   assert.equal(run('export', store, bundle).status, 1);
 } finally { await rm(dir, { recursive: true, force: true }); }
});
