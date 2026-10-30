import { readFileSync } from "node:fs";
import {
  generateIdentity,
  digestBytes,
  canonicalize,
} from "../../src/protocol.mjs";
import {
  createOpenRecord,
  createOpenBundle,
  deriveSettlementPlan,
  verifyOpenBundle,
} from "../../src/open-protocol.mjs";

// The only private material is ephemeral Ed25519 signing state in this closure.
// The exported result contains public signed records and a deterministic EVM plan.
export function bridgeContext({
  principalAddress,
  agentAddress,
  primaryVerifier,
  appealVerifier,
}) {
  const principal = generateIdentity(),
    agent = generateIdentity();
  const records = [];
  const add = (identity, kind, body) => {
    const record = createOpenRecord({
      records,
      identity,
      kind,
      body,
      time: "2026-10-29T12:00:00.000Z",
    });
    records.push(record);
    return record;
  };
  const originator = add(principal, "profile.published", {
    name: "Mira (local sandbox)",
    skills: ["catalogue design"],
    needs: ["schema engineering"],
    role: "creator",
    statement:
      "Fictional local execution; no real people, consent or legal equity.",
  });
  add(agent, "profile.published", {
    name: "Seed builder (local sandbox)",
    skills: ["schema engineering"],
    needs: ["catalogue design"],
    role: "agent builder",
    statement:
      "Fictional agent key; explicit EVM delegation is separate from this profile.",
  });
  const termsBytes = readFileSync(
    new URL("../../examples/terms.txt", import.meta.url),
  );
  const artifactBytes = readFileSync(
    new URL("../../examples/seed-catalogue.schema.json", import.meta.url),
  );
  const terms = {
    uri: "https://example.invalid/seed-catalogue/terms.txt",
    digest: digestBytes(termsBytes),
  };
  const source = add(principal, "project.created", {
    title: "Common catalogue infrastructure",
    opportunity: null,
    originator: originator.id,
    policy:
      "Local educational one-task hash-preimage predicate. One percent post-mint award rounded up; fixed caps; no source fee; no human-quality claim.",
    terms,
    source: null,
  });
  const policy = `Fictional local branch. Primary quorum ${primaryVerifier}; disjoint appeal quorum ${appealVerifier}. Two approvals from each configured quorum; 60-second settlement delay; 120-second timeout; 50 smallest-unit challenge bond. One percent post-mint mint with ceiling; maximum supply 1000000; single award cap 100000; award count cap 100. Twenty percent of funded receipts to the source project, eighty percent to branch holders. No net-profit, real payment, personhood or legal-equity claim.`;
  const project = add(principal, "project.created", {
    title: "Regional seed marketplace",
    opportunity: null,
    originator: originator.id,
    policy,
    terms,
    source: source.id,
  });
  const credit = [
    { actor: principal.id, weight: 5000 },
    { actor: agent.id, weight: 5000 },
  ].sort((a, b) => (a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0));
  const contribution = add(principal, "contribution.claimed", {
    project: project.id,
    title: "Schema for regional seed catalogue entries",
    evidence: {
      uri: "https://example.invalid/seed-catalogue/schema.json",
      digest: digestBytes(artifactBytes),
    },
    references: [],
    credit,
  });
  const bindingPrincipal = add(principal, "wallet.bound", {
    project: project.id,
    chainId: 31337,
    address: principalAddress,
  });
  const bindingAgent = add(agent, "wallet.bound", {
    project: project.id,
    chainId: 31337,
    address: agentAddress,
  });
  return {
    sourcePolicy: {
      termsHash: "0x" + source.body.terms.digest,
      criteriaHash: "0x" + digestBytes(source.body.policy),
    },
    branchPolicy: {
      termsHash: "0x" + project.body.terms.digest,
      criteriaHash: "0x" + digestBytes(policy),
    },
    finish(contract) {
      const intent = add(principal, "settlement.intent", {
        project: project.id,
        contribution: contribution.id,
        chainId: 31337,
        contract,
        bindings: [bindingPrincipal.id, bindingAgent.id].sort(),
      });
      const bundle = createOpenBundle(records);
      verifyOpenBundle(bundle);
      const payload = deriveSettlementPlan(bundle, intent.id);
      return {
        bundle,
        payload,
        intent: intent.id,
        contribution: contribution.id,
        project: project.id,
        bundleSha256: digestBytes(canonicalize(bundle)),
        recordSettlement(transaction) {
          add(principal, "settlement.referenced", {
            project: project.id,
            contribution: contribution.id,
            chainId: 31337,
            contract,
            transaction,
          });
          const finalBundle = createOpenBundle(records);
          return {
            bundle: finalBundle,
            bundleSha256: digestBytes(canonicalize(finalBundle)),
          };
        },
      };
    },
  };
}
