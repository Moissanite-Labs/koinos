# Security and trust

The 0.1 and 0.2 references are for evaluation with test data. The Solidity contracts execute locally with test assets and have not had an external security audit. Do not use this reference with production funds or to settle legal rights.

## Open collaboration and contract boundaries

The open graph has no membership gate. Anyone can publish a claim or conflicting judgment, including spam, fabricated work and fabricated settlement locators. Signatures preserve authorship by key; they do not award value. The graph cannot prove that it contains every contribution, revocation, dispute or relevant fact. Merge preserves observed signed records; it is not global consensus or an availability guarantee.

Self-signed wallet bindings authorize a destination for a recorded identity. They do not prove legal identity or wallet control. A settlement intent pins exact bindings and beneficiary weights. Contract transactions separately establish control of the EVM principal or its scoped delegate. A signed transaction hash in a graph remains unverified until independently checked against the intended chain, contract, policy and logs.

Standard factories accept known, non-upgradeable reference verifier families. An objective proof verifies only its stated predicate. Reviewer and appeal quorums are trusted and can collude or censor. A challenge bond limits cost-free abuse but does not prove the challenge's truth; an unresolved claim can time out without an award. Later off-chain disputes cannot claw back settled transferable tokens. [Exact contract rules](docs/economics/contracts.md) state these boundaries.

Minting and transfers preserve prior revenue accrual. Revenue and challenge-bond liabilities are separate. Deposits and payouts check exact asset deltas, but malicious, rebasing or dishonest assets still require separate assessment. The public faucet asset is a local test fixture. No live RPC, production keys or funds are used by the test harness.

Consent-based feedback export is distinct from sharing a complete graph. Its hashes are linkable metadata, not anonymous data. A contributor cannot grant rights to third-party material by signing an opt-in. Revocation prevents future export from an updated graph; it cannot recall previous copies or trained models.

## Ordered 0.1 history: what verification establishes

Every record has a content hash, an Ed25519 signature, and a link to the preceding record. Verification checks the complete history and the authority rules at each step. Accepted work must refer to a specific artifact digest, an agreement with recorded consent, and an independent approving review.

These ordered-history rules apply to version 0.1. The open 0.2 graph accepts permissionless signed claims without a steward or prior agreement; graph verification does not accept work or award tokens. Contract settlement follows its separately pinned policy.

## Ordered 0.1 history: what verification cannot establish

- Public keys do not prove a person's name, human status, uniqueness, or qualifications. Verify keys through a channel you trust before using them.
- Signatures do not prove that artifact contents match a URI, that a review is correct, or that terms have a particular legal effect. Artifact and terms digests are commitments to bytes. External retrieval and comparison are separate work.
- A signed timestamp is the signer's assertion. It is not a trusted clock. Expiry is evaluated in the recorded history; this implementation cannot prove when an offline event really happened.
- A valid exported history can omit a later revocation or dispute. Retain a trusted project and latest head, and compare them with peers. A fresh recipient without that checkpoint cannot detect a withheld suffix.
- Fork detection does not provide consensus. Two valid successors can conflict. The store preserves the local history and refuses conflicting imports. People must reconcile branches through a separately agreed procedure.
- The steward controls project creation, agreement proposals, and acceptance. Other participants control their own consent and grants. This is one explicit experimental governance model, not a claim of distributed governance.

## Data boundaries

Bundles contain the entire project history, including names, references, and review notes. They are not encrypted. Export only information that every recipient may read. Redaction changes signed records and is not supported as a valid complete history. An artifact marked private is not made private by this protocol.

Private keys stay outside bundles. The CLI creates private key files with restricted permissions where supported and refuses to overwrite them. Back them up securely. Key rotation, recovery, hardware signing, and encrypted key storage are future work. A compromised key can sign records as that participant.

The workbench binds to loopback. Its built-in example uses fictional participants and temporary demo keys. Acting as a sample participant is a simulation, not that participant's real consent. Imported bundles are untrusted input. The server does not fetch their links or run their contents.

## Reporting a problem

Use GitHub's private vulnerability reporting if it is available. Otherwise, contact the maintainers through an established private channel before sharing exploit details. Do not include private keys or personal project data in a public issue.
