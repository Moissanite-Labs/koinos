# Koinos

Koinos is a protocol and workbench for independent people and agents to find collaborators, build projects, preserve contribution credit, and agree how ownership and revenue are shared. The open reference admits contributions without a membership gate and includes executable local contracts for token issuance and funded revenue distribution.

**Version 0.2 is a local reference, not an operating financial network.** The [founder's original direction and notes](docs/founder-direction-20261029.md) describe the broader goal. This implementation makes its collaboration and economic rules inspectable and testable.

## Explore the workbench

Use Node.js 22 or newer. The collaboration protocol and browser workbench have no package dependencies.

```sh
git clone https://github.com/Moissanite-Labs/koinos.git
cd koinos
npm start
```

Open **http://127.0.0.1:4173/open**. Discover opportunities through explainable skill and need matching, inspect source and branch projects, publish a browser-signed sandbox contribution, merge concurrent work, and follow credit references and conflicting reviews. The ownership lab shows exact-integer dilution, separate source and branch cap tables, and revenue sharing. Simulation inputs do not execute payments.

The original ordered 0.1 workbench remains at `/`. Both examples use fictional participants. Session signing keys stay in the browser and are not included in exports. A full exported bundle reveals all its records.

## Run real contract execution locally

The isolated Solidity toolchain compiles and deploys to an in-process EVM with test assets. It uses no live RPC, wallet, private account, or real funds.

```sh
npm ci --prefix contracts --ignore-scripts
npm run test:contracts
npm run demo:contracts
```

The demo records actual local transactions: scoped agent delegation, an objective proof, a signed reviewer quorum, a bonded challenge and separate appeal, token issuance, source/branch revenue, ownership transfers, and withdrawals. Its signed collaboration graph supplies the branch award's exact evidence, agreed policy, recipient bindings and credit plan. Inspect the generated report in the ownership lab or in `contracts/reports/local-demo.json`.

A copied JSON report is historical test evidence, not a live balance or independently verified blockchain receipt. [Contract design and reproduction](docs/economics/contracts.md) describe the exact rules and limits.

## Implemented capabilities

| Layer | What it does |
| --- | --- |
| Open participation | Anyone with a signing key can publish a profile, opportunity, project, work claim, review or dispute. |
| Portable credit graph | Signed records merge across concurrent work without deleting claims, conflicting judgments or attribution. |
| Formation and discovery | Declared skills and needs match opportunities with visible reasons. There is no hidden identity or popularity score. |
| Exact settlement intent | Self-signed wallet bindings and an author-signed intent bind contribution evidence, terms, criteria and beneficiary weights to a specific chain and contract. |
| Automated ownership | A valid configured proof can mint transferable ERC20 project units under immutable issuance bounds. Cumulative earned credit survives transfers. |
| Continuous dilution | A configurable award fraction uses post-mint supply, with explicit integer rounding, award caps and supply caps. The one-percent scenario is implemented. |
| Source and branch economics | Shared infrastructure and specialized marketplaces have separate ownership. A disclosed branch fee routes funded revenue to source holders. |
| Revenue history | Transfers and later mints cannot acquire already-accrued revenue. Holders withdraw their own accrued amounts; rounding and reserves remain visible. |
| Contestable judgment | Quorum awards wait before settlement. Bonded challenges use separate appeal keys and a bounded timeout. Objective proof and trusted judgment are different policies. |
| Consented learning | Explicit evaluation/training opt-in enables a minimal metadata export. Revocation blocks future export from the updated graph. |

## Use the CLI

```sh
node src/cli.mjs open demo /tmp/open-project.json
node src/cli.mjs open verify /tmp/open-project.json
node src/cli.mjs open inspect /tmp/open-project.json
node src/cli.mjs open merge /tmp/local-store.json /tmp/open-project.json
node src/cli.mjs open feedback /tmp/open-project.json evaluation /tmp/feedback.json
node src/cli.mjs open --help
```

Use new filenames when repeating exclusive exports. `open append` signs a record using a protected local key; `open plan` derives a settlement payload from an exact signed intent. It does not send a transaction. The original 0.1 commands remain available. [Open protocol](docs/open-protocol.md) and [ordered examples](examples/README.md) document the formats.

```sh
npm run check
npm test
npm run conformance
```

Contract dependencies and checks remain isolated under `contracts/`. Hosted CI checks both the dependency-free reference and the local EVM suite.

## What trustless means here

The objective example verifies a narrow on-chain predicate without discretionary approval. Subjective work uses explicitly trusted reviewer and appeal quorums. Neither signatures nor tokens establish unique personhood, prevent collusion, detect every omitted contributor, or prove software quality. The contract cannot see undeclared business income or expenses. It distributes funded receipts, which are not automatically net profits.

Tokens enforce the defined on-chain balances and withdrawal rights. Legal business equity, intellectual-property ownership and claims against external assets require an actual legal arrangement. The reference does not choose one. No live deployment, trained payout model, x402 payment integration, Exo runtime integration or data sale is claimed.

Read the [security model](SECURITY.md), [economic design](docs/economics/design.md), [Roblox research](docs/economics/roblox-research.md), [ecosystem adapter boundaries](docs/ecosystem-adapters.md), and [remaining roadmap](docs/roadmap.md). Licensing and protocol-wide governance remain open decisions.
