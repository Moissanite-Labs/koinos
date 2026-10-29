# Fictional cooperation example

`accepted.bundle.json` is a complete signed sandbox history, not actual people, consent, work, or a live Exofab/Synbios integration. Generated keys were discarded. Every record is visible in the export. Its artifact/terms addresses use `example.invalid`; neither is fetched. Digests identify the fictional bytes passed by the demo, not independently verified content.

The eight records show a fictional Exofab-style human proposal, an explicit agreement with two human parties, both signatures of consent, one scoped delegation, a fictional Synbios-style agent submission, a human review independent of both agent and principal, and steward acceptance. Acceptance preserves agent attribution and the human principal.

Run the independently implemented cryptographic consumer and rejection checks:

```sh
node scripts/conformance.mjs
node src/cli.mjs inspect examples/accepted.bundle.json
node src/cli.mjs pin examples/accepted.bundle.json
```

Keep the project and head pin separately. A valid shorter history is cryptographically valid on its own; a known head pin detects that rollback. The local store also rejects shorter or divergent imports and preserves its existing history. It does not merge forks.

## SDK use (Node.js 22+, ESM)

```js
import { readFile } from 'node:fs/promises';
import { verifyBundle, summarize } from '../src/protocol.mjs';
import { importBundle, loadBundle } from '../src/store.mjs';

const incoming = JSON.parse(await readFile('examples/accepted.bundle.json', 'utf8'));
const verified = verifyBundle(incoming);
await importBundle('/tmp/koinos-project.json', incoming);
const restored = await loadBundle('/tmp/koinos-project.json');
console.log(summarize(restored).contributions);
// Persist verified.head in a separately trusted place to pin future reads.
```

`src/demo.mjs` exports `createDemo({stage = 'accepted'} = {})`, returning `{bundle, identities}`. `identities` contains ephemeral private keys for sandbox interaction; never send, log, or export it. Stages are `genesis`, `agreement`, `consent`, `delegation`, `submission`, `review`, `accepted`, `disputed`, and `revoked`. The browser workbench and CLI expose bundles only.

## CLI authoring

```sh
node src/cli.mjs keygen /tmp/proposer.pem
# Save the printed public id in body.json's participants array with kind "human".
# body.json: {"title":"Example","description":"Local trial","participants":[{"id":"PRINTED_ID","name":"Proposer","kind":"human"}]}
node src/cli.mjs create /tmp/project.json /tmp/proposer.pem body.json
node src/cli.mjs append /tmp/project.json /tmp/proposer.pem agreement.proposed agreement-body.json
node src/cli.mjs export /tmp/project.json /tmp/portable-bundle.json
node src/cli.mjs import /tmp/second-consumer.json /tmp/portable-bundle.json
node src/cli.mjs verify /tmp/second-consumer.json EXPECTED_HEAD EXPECTED_PROJECT
```

Body files contain exact event body objects described in `docs/protocol.md`. Key generation and export refuse to overwrite existing files. Key files are PKCS8 PEM with mode 600; keep them outside version control. A cooperating writer holds `STORE.lock` through validation and atomic rename. Contending writers fail explicitly and can retry. A crashed writer can leave a stale lock: inspect the writer and store before manually removing it. This local lock is not a distributed synchronization mechanism. Back up your store and keys separately.
