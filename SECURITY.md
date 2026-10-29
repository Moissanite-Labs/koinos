# Security and trust

The 0.1 reference is for evaluation with test data. It has not had an external security audit. Do not use it to authorize payments or settle legal rights.

## What verification establishes

Every record has a content hash, an Ed25519 signature, and a link to the preceding record. Verification checks the complete history and the authority rules at each step. Accepted work must refer to a specific artifact digest, an agreement with recorded consent, and an independent approving review.

## What verification cannot establish

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
