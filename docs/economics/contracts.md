# Enforceable local settlement reference

Koinos can issue transferable project tokens and distribute funded receipts according to fixed on-chain rules. The implementation runs in an isolated local EVM. A token controls a contract balance and its associated revenue entitlement. It does not establish legal equity, employment, incorporation, intellectual-property rights, or an entitlement to off-chain income. A real agreement and legal structure would need to establish those separately.

## What executes

`contracts/src/Project.sol` contains an ERC20 project and a permissionless `ProjectFactory`. `Acceptance.sol` contains two verifier families and a permissionless `VerifierFactory`. `TestAssets.sol` supplies local test assets and hostile asset fixtures. The project has no administrator, arbitrary mint, confiscation, pause, upgrade or terms-rewrite function. Any account can create a project or submit a claim. Changing a policy requires a new project that participants choose to join.

The standard project factory creates its own verifier registry. It accepts only verifier instances created by that registry. A registered verifier is either the concrete hash-preimage predicate or the fixed reviewer-quorum contract. Registry creation is permissionless and has no administrator. Direct deployment of the `Project` constructor is possible but bypasses this factory provenance check. Such a contract is not certified by the factory and its verifier code needs separate inspection. A self-reported verifier kind is not proof that arbitrary code is objective.

Initial allocations are positive, explicitly supplied and emitted as events. Addresses must be sorted, unique and nonzero. Initial allocation is not earned contribution credit. Payment asset, source project, fee, terms and criteria hashes, acceptance verifier, award limits and appeal policy are immutable. A source project must be a root from the same standard factory and use the same payment asset. A branch cannot silently add another source-fee hop.

## Claims, authority and proof

A claim contains principal, actor, exact evidence digest, work identifier and credit-plan hash. The principal may submit directly. An agent must have a grant created by that principal, on that project, for the exact actor, work and credit-plan hash. A grant expires, can be revoked, cannot be regranted for the same scope after revocation, and gives no ERC20 spending allowance. Authority is checked when revealing and again when finalizing delayed settlement. Accepted events preserve both actor and principal.

Anyone may commit a claim hash. It binds chain, project, submitting actor, principal, evidence, work, credit plan, proof hash and salt. Reveal must occur after the commit block. Only the bound actor may reveal. Copying a commitment or transaction cannot change its recipient plan. Successful reveal consumes the commitment. A fixed work nullifier prevents repeat awards; cancellations also permanently close that work in the project. Public on-chain commitments cost gas and have no cleanup mechanism in this prototype.

The educational objective verifier checks one immutable work identifier, one target hash, and the supplied preimage. The claim evidence must equal that target hash. Its nullifier is the immutable work identifier, not a caller-chosen replacement. This proves knowledge of bytes matching a hash. It does not establish software quality, authorship, novelty, usefulness or an exhaustive list of contributors. The first valid claimant can settle the task; publishing a solution outside the commit/reveal workflow can allow others to solve it independently. Commit/reveal cannot eliminate censorship or a block builder's power to delay inclusion.

The alternative verifier requires a configured threshold of EIP-712 signatures from a fixed, sorted reviewer set. Signatures bind chain, verifier address, project address, principal, actor, exact evidence, work identifier, credit-plan hash, terms hash, criteria hash and reward-policy hash. Unknown and duplicate signers, malformed signatures, wrong domains and altered claims fail. Reviewers attest that work is unique; the contract cannot infer that two differently named work items contain the same external contribution. Reviewers may be humans, models or services outside the contract, but model output alone is never authority to transfer assets. The explicit configured signer policy provides that authority.

Quorum review is trusted. A threshold can collude, censor, make an unfair judgment, or sign a fabricated contribution. Distinct addresses are not proof of distinct people. Registering another key earns nothing by itself. The objective predicate is narrow; the quorum is broader and introduces judgment. Neither eliminates all trust.

## Pending settlement, challenges and finality

Quorum projects must set a nonzero delay, a bounded appeal timeout, a nonzero bond in the same pinned payment asset, and a distinct registered appeal verifier. The standard factory requires primary and appeal reviewer address sets to be disjoint. This is separation of keys, not independently verified personhood or institutional independence. Objective projects have zero delay, timeout and bond and settle directly after a valid reveal.

A valid quorum reveal emits a pending settlement and mints no tokens. During the delay, anyone can lodge one challenge for that work, supply its evidence digest, and fund the exact bond. Zero evidence, late challenges and duplicate challenges fail. A challenge blocks finalization until the immutable appeal quorum approves it. Appeal signatures bind the original claim, challenge digest and accept/reject decision through a domain-separated evidence digest. The appeal process cannot rewrite the original credit plan or award policy.

An approving appeal makes the bond withdrawable by the original principal. A rejecting appeal cancels the work and makes the bond withdrawable by the challenger. If no resolution arrives before `readyAt + appealTimeout`, anyone can cancel the pending work. An unresolved challenge then refunds the challenger. Pending work without a challenge can also expire if nobody finalizes it within that fixed window. Finalization is permissionless after the delay and before expiry, rechecks delegation, and enforces current issuance caps. Approval of an appeal disposes of the challenge bond even if later revocation or a supply cap prevents token settlement. This bond is a challenge disposition, not a payment for accepted work.

Bond claims use separate pull-payment accounting. They never become holder revenue or source fees. Withdrawals are non-reentrant, check exact asset deltas, clear the claim and reduce escrow before interacting with the asset. Aggregate escrow is capped separately from funded revenue. A holder can withdraw revenue while bonds remain reserved, and a challenger cannot withdraw the same refund twice.

A bond adds a cost to an unsuccessful challenge. It does not eliminate grief: a well-funded challenger can delay claims, and a censored appeal may time out and cancel valid work. The timeout chooses bounded cancellation over locking a pending claim forever. There is no arbitrary administrative override. Settled tokens and payouts are final in this prototype. A later DAG dispute records disagreement but does not claw back transferred tokens or reverse a settled payout.

## Issuance, dilution and permanent credit

For current supply `S`, award rate `r` in basis points and base `B = 10000`, the next award is:

```text
minted = ceil(S × r / (B − r))
```

At `S = 9900` and `r = 100`, the award is `100` units and the recipient plan receives exactly one percent of the new supply. At `S = 1`, it is one unit and the resulting share is fifty percent. Integer rounding is visible; the formula is not an exact percentage at every supply. Units are the smallest ERC20 units, not whole tokens or currency prices. ERC20 decimals are 18; the small integer demonstration makes rounding easy to inspect.

The rate is positive and capped at 1000 basis points. A project fixes a maximum supply, a maximum single award, and a maximum number of awards, with no more than 10000 awards. Reaching any limit rejects further settlement; the contract does not silently change the agreed rate or reduce a reward. Several pending contributions may compete for remaining capacity. Award amount is calculated at finalization using then-current supply, so finalization order affects amounts within the immutable policy. Review signatures bind that policy, not a promised absolute future amount.

Credit plans have at most 32 unique sorted nonzero addresses and positive integer weights summing to 10000. All but the last sorted recipient receive their floored weighted amount; the last receives the exact remaining units. No units disappear. This deterministic remainder favors the last address by a small rounding amount and must not be described as a perfectly exact percentage split.

`earnedCredit[recipient]` only increases when that recipient earns minted units. Transferring an ERC20 balance does not transfer or erase earned credit. Credit measures the units awarded under this project policy, not an objective measure of effort or social value. Source and branch projects each have their own balances, permanent credits, acceptance policies and terms. One participant can earn both.

## Funded revenue and history protection

Anyone may deposit a positive funded amount of the pinned ERC20 asset. A branch computes the source's cumulative entitlement as `floor(cumulativeGrossReceipts × sourceFeeBps / 10000)` and forwards only the increase over source fees already paid. It assigns the current deposit's remainder to branch holders. Fractional source entitlement carries across deposits: dividing the same funded gross amount into tiny payments cannot reduce the total source fee. A deposit that crosses a rounding boundary can therefore forward a larger fraction than its individual nominal rate. Holder per-share and per-account rounding still follows the separate rules below; it is not claimed to be invariant to deposit timing or fragmentation. The source distributes its receipt to source holders using its own balances. This is a split of funded receipts, not net profits: the contracts cannot discover external income, audit expenses, determine tax obligations, or force a business to deposit all revenue. A zero or 10000 basis-point source fee is allowed if explicitly selected at creation.

The project keeps magnified revenue per share and signed per-account corrections. Every mint and transfer adjusts corrections, so future owners cannot acquire already-accrued revenue by receiving old tokens, and a late mint cannot claim old deposits. Former holders retain both prior integer accrual and prior fractions. Pull withdrawals pay only the caller's accrued amount. No function loops over every holder.

For each deposit the per-share increment is floored at magnitude `2^64`. The discarded magnified numerator is tracked. Account payouts also floor to whole payment-asset units while fractional account accrual remains in the contract. Dust is retained and is not redistributed to later token holders or swept by an administrator. `totalRevenue - totalPaid` is the retained funded-revenue reserve, including unclaimed entitlements, account fractions and rounding. The public demo reconciles this reserve against the asset balance; bonds are a separate reserve. Source fees, actual payouts and retained reserves are reported separately.

Supply, cumulative gross funded receipts and outstanding bond escrow are each bounded by `2^80 - 1` smallest units. Together with the `2^64` magnitude this keeps worst-case per-share correction products below `2^224`, including large later supply changes. These conservative limits are prototype parameters, not a claim of unlimited scale.

The implementation uses SafeERC20 and non-reentrant funded deposits, revenue withdrawals, bond transfers and settlement calls. Inbound and outbound balance deltas must match exactly. Fee-on-transfer assets are rejected. Rebasing, malicious or otherwise dishonest assets can break token economics outside these checks; token ownership does not make a payment asset safe. The local public-mint faucet and hostile callback assets are test fixtures only.

## Reproduce and inspect

```sh
npm --prefix contracts ci --ignore-scripts
npm --prefix contracts test
npm --prefix contracts run demo
npm --prefix contracts run compile
```

Pinned tools are OpenZeppelin Contracts 5.6.1, solc 0.8.38, ethers 6.17.0 and Hardhat 3.21.1. The lockfile also pins patched `tmp` and `zod` overrides for tooling advisories. The harness creates an in-process Hardhat EDR network, compiles locally for Cancun, rejects oversized runtime bytecode, and never uses a live RPC or wallet. The dependency tree stays in `contracts/node_modules`. Use no production keys or funds with this reference.

`runLocalDemo()` in `contracts/scripts/demo.mjs` returns report fields plus a public signed graph and closes the local EVM. The CLI form writes `contracts/reports/local-demo.json`. Report fields distinguish `execution: "local-evm"`, `liveNetwork: false`, chain ID, deployed contract addresses, actual successful transaction hashes/block numbers/gas, passed assertions, balances in decimal integer strings, source/branch receipt totals, reserves, policy hashes and trust limits. The fixture is historical local evidence, not a live chain oracle. A signed open-protocol settlement reference remains unverified until a consumer checks a transaction against the intended chain and contract.

There is no x402 transport integration. An adapter can fund `depositRevenue(amount)` after receiving and validating a payment according to its own transport rules. A stable receipt should include chain ID, project and payment-asset addresses, transaction hash, block hash/number, event log index, payer, gross funded amount, source fee and holder amount. The adapter must verify finality and exact logs; a URL, model answer or JSON report does not authorize an ownership mint or establish a live payment.

The tests execute rejection, replay, copying, evidence binding, split conservation, rounding, caps, delegation/revocation/expiry, reviewer domains and quorum, pending finalization, challenge outcomes/timeouts, bond solvency, historical accrual, source/branch splits, fee-on-transfer rejection and hostile asset callbacks. These tests are evidence for this local reference, not an external security audit.

References: [OpenZeppelin ERC20](https://docs.openzeppelin.com/contracts/5.x/erc20), [OpenZeppelin cryptography](https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography), [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [Hardhat network manager](https://hardhat.org/docs/reference/network-manager).

## Signed graph to contract example

The local demo also writes `contracts/reports/open-demo.json`. Fresh ephemeral Ed25519 keys sign a branch project, a contribution containing the supplied schema's SHA-256 digest, each credited actor's own project/chain wallet binding, and the contribution author's settlement intent. The intent names exact immutable binding records. `deriveSettlementPlan()` deterministically derives the principal, sorted recipients and weights, work hash, evidence hash, terms hash and criteria hash. Those exact values configure the branch project and its claim; the principal's EVM account separately grants the agent permission for that exact plan.

The reviewer quorum signs the resulting contract message. After challenge, appeal and finalization, the demo reads the actual `Accepted` event and compares its work, evidence and credit-plan hash with the signed graph's derived payload. The public report names that transaction and log index. A signed settlement reference is then added to the graph. The graph alone continues to label settlement unverified. The separate receipt report records successful local execution, and a fresh local integration test checks both paths agree. This is a concrete adapter example, not automatic Ed25519 verification by the Solidity contract or a claim that an exported JSON report proves a live-chain balance.

The educational source preimage task remains distinct from the SHA-256 artifact acceptance in the branch's trusted-quorum path. The same participant can earn source credit and branch credit under their separate policies. Private keys are discarded and never included in either public fixture.
