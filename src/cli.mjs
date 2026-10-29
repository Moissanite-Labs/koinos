#!/usr/bin/env node
import { readFile, open } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { generateIdentity, verifyBundle, summarize } from './protocol.mjs';
import { loadBundle, importBundle, appendEvent } from './store.mjs';
import { createDemo } from './demo.mjs';

const help = `Koinos experimental local reference (Node.js 22+)\nUsage:\n  koinos keygen KEY.pem\n  koinos create STORE KEY.pem BODY.json\n  koinos append STORE KEY.pem KIND BODY.json\n  koinos inspect STORE\n  koinos verify STORE [EXPECTED_HEAD] [EXPECTED_PROJECT]\n  koinos pin STORE\n  koinos import STORE BUNDLE.json\n  koinos export STORE OUTPUT.json\n  koinos demo OUTPUT.json\nPrivate keys are written exclusively with mode 600. Body files are JSON.\nExports expose every record. Preserve the pin separately to detect replacement.\n`;
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function exclusive(path, contents) {
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(contents); await file.sync(); } finally { await file.close(); }
}
export async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  const output = value => process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
  const arity = (min, max = min) => { if (rest.length < min || rest.length > max) throw new Error(`Invalid arguments for ${command}. Use --help.`); };
  if (!command || command === '--help' || command === 'help') { output(help); return; }
  if (command === 'keygen') { arity(1); const identity = generateIdentity(); await exclusive(rest[0], identity.privateKey); output({ id: identity.id, keyFile: rest[0] }); return; }
  if (command === 'create' || command === 'append') {
    arity(command === 'create' ? 3 : 4);
    const [store, keyFile] = rest;
    // Derive public identity from the PEM rather than storing private material in JSON.
    const { createPrivateKey, createPublicKey } = await import('node:crypto');
    const privateKey = await readFile(keyFile, 'utf8');
    const publicBytes = createPublicKey(createPrivateKey(privateKey)).export({ type: 'spki', format: 'der' }).subarray(-32);
    const identity = { id: `koinos:ed25519:${publicBytes.toString('base64url')}`, privateKey };
    if (command === 'create') {
      const { access } = await import('node:fs/promises');
      try { await access(store); throw new Error('Store already exists; use append'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const bundle = await appendEvent(store, { identity, kind: command === 'create' ? 'project.created' : rest[2], body: await json(rest[command === 'create' ? 2 : 3]) });
    output({ project: bundle.records[0].project, head: bundle.records.at(-1).id, count: bundle.records.length }); return;
  }
  if (command === 'inspect') { arity(1); output(summarize(await loadBundle(rest[0]))); return; }
  if (command === 'verify') { arity(1, 3); const state = verifyBundle(await loadBundle(rest[0]), { expectedHead: rest[1], expectedProject: rest[2] }); output({ valid: true, head: state.head, count: state.count }); return; }
  if (command === 'pin') { arity(1); const bundle = await loadBundle(rest[0]); output({ project: bundle.records[0].project, head: bundle.records.at(-1).id }); return; }
  if (command === 'import') { arity(2); const bundle = await importBundle(rest[0], await json(rest[1])); output({ head: bundle.records.at(-1).id, count: bundle.records.length }); return; }
  if (command === 'export') { arity(2); const bundle = await loadBundle(rest[0]); await exclusive(rest[1], `${JSON.stringify(bundle, null, 2)}\n`); output({ exported: rest[1], count: bundle.records.length }); return; }
  if (command === 'demo') { arity(1); const { bundle } = createDemo(); await exclusive(rest[0], `${JSON.stringify(bundle, null, 2)}\n`); output({ exported: rest[0], count: bundle.records.length }); return; }
  throw new Error(`Unknown command: ${command}. Use --help.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { process.stderr.write(`Error: ${error.message}\n`); process.exitCode = 1; });
