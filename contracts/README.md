# Local ownership and funded-revenue contracts

This package executes an experimental collaboration settlement policy in a fresh in-process EVM. It uses test accounts and a faucet payment token. It never connects to a live network, deploys real assets, or moves real funds.

From the repository root:

```sh
npm --prefix contracts ci --ignore-scripts
npm --prefix contracts test
npm --prefix contracts run demo
npm --prefix contracts run compile
```

Dependencies and the lockfile stay inside `contracts/`. Node 22.13+ is required by Hardhat. The harness compiles locally with pinned solc, so it does not download a compiler or start a listener. Hardhat EDR simulates transactions in process. The compiler targets Cancun and rejects contracts over the EIP-170 runtime code-size limit. Generated artifacts are ignored.

`runLocalDemo()` from `contracts/scripts/demo.mjs` returns public report fields plus `publicGraph`, its signed collaboration graph. Running the script writes `contracts/reports/local-demo.json` and `contracts/reports/open-demo.json`. The report contains actual local transaction receipts, assertion results and final balances in smallest integer units. It contains no private keys. It is historical test evidence, not a trusted live-chain balance service. The workbench reads only this specific report file.

The details, formulas, API and trust boundaries are in [the contract specification](../docs/economics/contracts.md). These are unaudited prototype contracts, not a production or legal-equity system. Our Solidity uses `SPDX-License-Identifier: UNLICENSED`; dependencies retain their own licences.
