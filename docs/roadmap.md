# From reference protocol to independent collaboration

The [founding vision](vision.md) remains broader than this implementation. These are engineering milestones and open decisions, not promised operating or financial services.

| Stage | Outcome | Evidence required |
| --- | --- | --- |
| 0.1 reference | Sign and inspect a project, consent, delegated work, review, acceptance, and dispute; move the complete history between tools. | Conformance tests, negative cases, portable example, local workbench. |
| Interoperability | Two independently implemented full state machines agree on records and decisions. | Shared fixtures, cross-language differential tests, version negotiation, published compatibility report. |
| Personal authority | People retain control across devices and lost or compromised keys. | Recovery and rotation design, encrypted or hardware signing, explicit identity and key verification flow, external security review. |
| Private cooperation | Participants can share only what a recipient may inspect. | Threat model, encrypted storage and transport, selective disclosure design, consent and metadata-leakage tests. |
| Federation | Independent communities exchange updates and handle concurrent work. | Authenticated transport, checkpoints, fork recovery, revocation freshness policy, offline and partition tests. |
| Real tools | A human collaboration hub and an agent forge exchange the same evidence and authority. | Actual adapter contracts and live acceptance tests; no change to attribution or agreement meaning. |
| Agreed economics | Participants can inspect and simulate the exact rules they chose. | Explicit agreement model, correction and dispute process, legal and economic review, integer accounting and reproducible allocation tests. |
| Settlement adapters | Separately authorized services carry out agreed transfers. | Human approval binding, limits, reconciliation, cancellation behavior, external audit. No default currency or payment rail. |
| Shared infrastructure | Projects can cooperate around compute, skills, services, and physical work. | Domain-specific evidence, rights, safety and feasibility assessment; measured pilot outcomes. |

## Decisions that remain open

Protocol licensing and governance; the meaning and verification of identity; key recovery; steward replacement and shared decision rules; agreement amendment; resolving disputed contributions; private data exchange; concurrent history reconciliation; economic rules and settlement providers.

The reference chooses a narrow authority model to make testing possible. Those implementation choices do not settle the open decisions for every future Koinos community.
