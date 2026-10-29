# Koinos

Protocol to let distinct people, agents and projects cooperate without becoming one centralized organization.

> **Founding direction, open for design.** This repository is the home for the proposed protocol. The capabilities below are goals, not a claim of an implemented network, economic system, or legal framework.

## Vision and mission

Koinos aims to provide common ground for people and agents to turn shared work into projects, products, and, when their participants choose, real economic entities. Its mission is to make collaboration, contributions, agreements, and value-related information portable across tools while keeping participants and their projects independent.

The founder's **KoinOS** wordplay imagines a real-world or hybrid human-agent operating system concerned with transacting and storing value. See the shared [naming record](https://github.com/Moissanite-Labs/constitution/blob/main/NAMING.md) for the name's meanings and the distinction between Greek roots and founder wordplay.

## Who it serves

Project founders and contributors need a way to understand who did what and which agreements apply. Agents need scoped, verifiable ways to participate on a person's behalf. Tool builders need contracts they can adopt without depending on one hub, forge, or database.

## Goals and boundaries

- Represent projects, participants, contributions, evidence, and references to human agreements in interoperable forms.
- Preserve provenance, consent, and appropriately scoped delegation; a preference learned by an agent is never permission to act.
- Support the path from collaboration to real-world outcomes and economic arrangements chosen by participants, without prescribing a particular ownership or distribution model.
- Make the protocol useful outside the Exo ecosystem. Exofab is a prospective human-first collaboration hub; Synbios is a prospective agent-first software forge. Both can implement Koinos without being its only possible users. Ethos is a separate preference protocol.

Koinos does not by itself incorporate entities, establish ownership, execute payments, create a currency or token, or determine legal rights. Any such capabilities, networks, and terms would require separate decisions, explicit agreements, and appropriate review.

## First vertical slice

1. Write an example of a project, a scoped agent task, a reviewed artifact, an accepted contribution, and a reference to a human agreement. Define what each participant can inspect and consent to.
2. Propose minimal versioned records and exchange contracts, using the example to expose open questions about identity, authority, privacy, and provenance.
3. Demonstrate an implementation in an Exofab-to-Synbios workflow and a second independent consumer. Export and re-import the records without silently changing ownership, consent, or attribution.

The slice is ready for review when a reader can trace an accepted contribution to its evidence, inspect the recorded scope and agreement references, and run the documented conformance examples. The design should identify unresolved privacy and authorization behavior rather than silently filling gaps.

## Working together

Start with an issue or pull request that states the problem and intended behavior. Include examples, tests appropriate to the change, and notes about compatibility, consent, and provenance for protocol changes. Reviewers should be able to reproduce the checks and distinguish implemented behavior from proposals. Contribution conventions and maintainership are still being established.

## Open decisions

Identity and trust, delegation and revocation, public/private data boundaries, synchronization, protocol transport and versioning, agreement and rights representation, conformance, licensing, and governance all need design. Decisions about payments, ownership, smart contracts, or other economic mechanisms are separate and require participant consent and appropriate legal review.
