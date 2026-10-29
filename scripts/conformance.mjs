#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { verifyBundle } from '../src/protocol.mjs';

const bundle = JSON.parse(await readFile(new URL('../examples/accepted.bundle.json', import.meta.url), 'utf8'));
const state = verifyBundle(bundle);
assert.equal(state.contributions[0].status, 'accepted');
// Independent consumer: local canonicalization and direct Node crypto verification.
function canonical(value) {
 if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
 return JSON.stringify(value);
}
for (const record of bundle.records) {
 const { id, signature, ...unsigned } = record;
 assert.equal(createHash('sha256').update(canonical(unsigned)).digest('hex'), id);
 const raw = Buffer.from(record.actor.split(':').at(-1), 'base64url');
 const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
 assert.ok(verify(null, Buffer.from(`koinos/0.1\n${id}`), publicKey, Buffer.from(signature, 'base64url')));
}
const mutations = {
 'changed signed body': b => { b.records[0].body.title = 'tampered'; },
 'bad signature': b => { b.records[1].signature = 'A'.repeat(86); },
 'reordered history': b => { [b.records[1], b.records[2]] = [b.records[2], b.records[1]]; },
 'unsupported format': b => { b.format = 'koinos-bundle/999'; },
 'unknown field': b => { b.records[0].hidden = true; }
};
for (const [name, mutate] of Object.entries(mutations)) {
 const copy = structuredClone(bundle); mutate(copy);
 assert.throws(() => verifyBundle(copy), undefined, name);
}
assert.throws(() => verifyBundle({ ...bundle, records: bundle.records.slice(0, -1) }, { expectedHead: state.head }));
console.log(`Conformance passed: ${bundle.records.length} independent hash/signature checks; ${Object.keys(mutations).length + 1} rejection checks. Experimental fixture, no live integrations.`);
