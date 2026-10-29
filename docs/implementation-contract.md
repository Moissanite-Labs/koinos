# Implementation contract for the 0.1 reference

This is an experimental, local-first protocol implementation, not adopted network governance. Node.js 22+, ESM, no runtime dependencies. One ordered history per project. Forks are detected, not automatically resolved. Signatures establish control of a key, not legal identity or truth.

## Wire format

Bundle: `{format: "koinos-bundle/0.1", records: [...]}`. A nonempty complete history starts at sequence 0.

Envelope fields: `protocol` = `koinos/0.1`, `project` (UUID), `sequence` (nonnegative safe integer), `previous` (prior record id, null at genesis), `time` (canonical UTC ISO timestamp), `actor` (`koinos:ed25519:<base64url raw 32-byte public key>`), `kind`, `body`, `id`, `signature`.

Canonical JSON recursively sorts object keys lexicographically using ECMAScript UTF-16 order, preserves array order, uses JSON string escaping and no whitespace. Only null, booleans, strings, safe integers, arrays and plain objects are allowed. Reject unsupported fields, unsafe numbers, malformed Unicode, and unsupported versions. `id` is lowercase SHA-256 hex of canonical unsigned envelope (all fields except id/signature); Ed25519 signs UTF-8 `koinos/0.1\n` + id. Signatures are unpadded canonical base64url. Times are nondecreasing. Historical timestamps are signed assertions, not trusted wall-clock evidence.

## Events and authority

- `project.created`: `{title, description, participants:[{id,name,kind:"human"|"agent"}]}`. Actor must be a listed human; becomes steward. Unique participant keys. Human/agent are declarations, not verified personhood.
- `agreement.proposed`: `{title, uri, digest, parties:[human participant ids]}`; steward only. Digest is lowercase SHA-256 of external terms bytes. No terms fetched by software. Agreement id is event id.
- `agreement.consented`: `{agreement}`; listed human party only. Explicit signature on exact agreement record.
- `agreement.withdrawn`: `{agreement, reason}`; listed party who currently consents only. Blocks new dependent work; cannot erase history or determine legal effect. Later explicit consent is allowed.
- `delegation.granted`: `{agent, agreement, scope:["contribution.submit"], expires}`; consenting human party to consenting agent participant, all agreement parties must have consented. Agent itself does not consent. Grantor is principal. Expiry strictly after grant time. One scope initially; no subdelegation.
- `delegation.revoked`: `{delegation, reason}`; grantor only; irreversible.
- `contribution.submitted`: `{title, summary, artifact:{uri,digest}, agreement, delegation}`. Human party with null delegation, or named agent under active, unexpired grant. All parties currently consent. Attribution records actor and principal. Artifact references immutable digest, not verified artifact contents.
- `contribution.reviewed`: `{contribution, decision:"approve"|"request_changes", note}`; human agreement party, distinct from submission actor and principal. Submitted/pending contribution only. Latest review controls acceptance.
- `contribution.accepted`: `{contribution, review}`; steward only, all parties currently consent, exact latest approving independent review. Active grant still required for agent contribution at acceptance. No duplicate acceptance.
- `contribution.disputed`: `{contribution, reason}`; human agreement party, accepted contribution only. Disputed is visible and terminal in 0.1. No financial/legal adjudication.

All references resolve to preceding records in the same project. Protocol does not execute artifact URIs, payments, or agents. No claims of encryption or access control: an exported bundle exposes every included record. Partial/redacted histories are not valid bundles.

## Core module API (src/protocol.mjs)

- `generateIdentity()` -> `{id, privateKey}` where privateKey is PKCS8 PEM string. Never put it in bundles.
- `canonicalize(value)` -> string; `digestBytes(string|Buffer)` -> lowercase hex.
- `createRecord({records, identity, kind, body, time?, project?})` -> signed record; validates new history. Genesis needs project UUID (or generated internally). Default time = now.
- `verifyBundle(bundle, {expectedHead?, expectedProject?} = {})` -> state. Throws descriptive Error for any invalidity. expectedHead pins the last record, not ancestry.
- `createBundle(records)` -> verified bundle.
- `summarize(bundle)` -> JSON state as below.

State is JSON: `{project:{id,title,description,steward}, participants:[...], agreements:[{id,title,uri,digest,parties,consents:[ids]}], delegations:[{id,agent,principal,agreement,scope,expires,revoked}], contributions:[{id,title,summary,artifact,agreement,delegation,actor,principal,status:"submitted"|"changes_requested"|"reviewed"|"accepted"|"disputed",reviews:[{id,actor,decision,note}],acceptance:null|{id,actor,review},dispute:null|{id,actor,reason}}], head, count}`.

## Ownership

Core agent: src/protocol.mjs, test/protocol.test.mjs, schemas/ and protocol specification docs/protocol.md.
Tools agent: src/cli.mjs, src/store.mjs, src/demo.mjs, test/cli.test.mjs, test/store.test.mjs, examples/, scripts/conformance.mjs.
Workbench agent: web/, src/server.mjs, test/server.test.mjs. Explorer reads verified bundles; sandbox workflow may use generated demonstration keys only in memory. Must clearly label sandbox and avoid treating demo signatures as real consent. Prefer browser-only import/export and WebCrypto verification as independent consumer.
Lead: package.json, README.md, CI, architecture/security/contributor docs, integration and review.
