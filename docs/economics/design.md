# Ownership, credit and funded revenue

Koinos needs three separate accounts: who contributed, who owns the project now, and who is owed revenue already received. Combining them would erase attribution when someone sells tokens, reward new owners for past income, or treat an unverified claim as earned equity.

## Permissionless entry, explicit acceptance

Anyone can publish a signed contribution. There is no admission list or universal identity provider. This preserves proposals, partial work, citations, reviews and disagreements. A signature establishes the key behind a statement, not its truth or commercial value.

A project fixes its acceptance policy and economic rules before rewards are claimed. An objective verifier can check a narrow mathematical condition without an approver. The supplied hash-preimage verifier demonstrates that mechanism; it is not a verifier of software quality. A reviewer or model quorum checks subjective work under a different, disclosed trust model. No amount of tokenization turns an unmeasured judgment into an objective fact.

## The one-percent scenario

If existing supply is `S`, and an accepted award should receive fraction `f` of supply after minting, then `new = S × f / (1 − f)`. Simply minting one percent of the old supply gives less than one percent of the new total. The contract uses whole units and a stated rounding rule, so small supplies can deviate from the requested percentage.

For one percent per sequential award, ignoring whole-unit rounding, an unchanged original holding retains `0.99^n` of its original percentage after `n` awards:

| Awards | Original holding's remaining fraction |
| ---: | ---: |
| 10 | 90.44% |
| 50 | 60.50% |
| 100 | 36.60% |

Earlier contributors dilute too. One percent is an initial award, not a permanent percentage. Each project must disclose its starting allocation, reward fraction, maximum supply, maximum awards, verifier, source fee and terms. Initial ownership and earned contribution credit are separate.

Awarding value per account invites people to create more accounts. Awarding value per submission invites people to split one task into many claims. The useful unit is a pre-agreed work item with a unique nullifier, explicit evidence, and a budget. Exact replay protection cannot detect plagiarism or colluding reviewers. A deterministic formula is predictable, not necessarily fair.

## Shared infrastructure and specialized branches

Common infrastructure has its own project token. Each specialized marketplace has another. A contributor can earn credit and ownership in both, and the two records remain distinct. A branch's immutable source-fee rule routes a disclosed fraction of funded revenue to the source project; the rest accrues to branch holders.

The source project must actually provide the shared capability it charges for. A mandatory fee with no accountable service would recreate platform rent extraction. A permissionless ecosystem must make the fee visible and allow communities to choose or fork their infrastructure. The reference does not assert one global canonical originator for every possible deployment.

## Revenue is not automatically profit

The contracts allocate ERC20 funds actually deposited into them. They cannot see undeclared sales, bank balances, salaries, taxes, refunds or operating costs. A project wanting net-profit distributions needs a separately agreed expense and reporting policy. Deposited revenue must not be labelled net profit merely because a contract distributes it.

Accrual belongs to holders at the time funds are received. Transferring tokens changes future entitlements; it does not move already accrued withdrawals. New issuance cannot claim old revenue. Fractional rounding and retained balances must be visible. Source fees, revenue claims and challenge bonds are separate liabilities.

## Model decisions and appeals

A decision record identifies exact evidence, criteria digest, model/version where applicable, rationale and outcome. The model has only the authority named in the project policy. A preference learned elsewhere is not payout permission. The reference records model evidence but does not claim to have trained or validated a payout model.

For subjective awards, a challenge window and separate appeal authority expose contestability before finalization. A bond makes challenges costly; it does not prove a challenge is correct. A quorum can collude or withhold a decision, and a timeout can cancel an otherwise valid award. Those are explicit trust and liveness limits. Later off-chain disputes do not claw back already transferred tokens.

Before using model-assisted decisions for material funds, evaluate disagreement, calibration, adversarial evidence, criteria ambiguity, appeal reversals, concentration and false acceptance. Freeze the model and criteria for a policy version. A new version requires a new agreement; silently retraining the judge changes the deal.

## Legal ownership boundary

ERC20 balances can enforce token transfers and the contract's specified withdrawal rights. They do not, by themselves, create shares in an incorporated business, ownership of its intellectual property, or rights against assets outside the contract. Those rights require an issuer, agreements and applicable legal structure. The SEC's January 2026 staff statement likewise distinguishes tokenization models by their underlying instruments and holder rights. This reference chooses no jurisdiction or legal wrapper. [SEC statement](https://www.sec.gov/newsroom/speeches-statements/corp-fin-statement-tokenized-securities-012826-statement-tokenized-securities).
