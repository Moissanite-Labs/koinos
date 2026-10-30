import { readFileSync } from "node:fs";
import {
  generateIdentity,
  createRecord,
  createBundle,
  digestBytes,
} from "./protocol.mjs";

// Fictional sandbox only. Keys stay in memory and are never included in the bundle.
export function createDemo({ stage = "accepted" } = {}) {
  const stages = {
    genesis: 1,
    agreement: 2,
    consent: 4,
    delegation: 5,
    submission: 6,
    review: 7,
    accepted: 8,
  };
  const ordered = Object.hasOwn(stages, stage);
  if (!ordered && !["disputed", "revoked"].includes(stage))
    throw new Error("Unknown demo stage");
  const steward = generateIdentity(),
    reviewer = generateIdentity(),
    agent = generateIdentity();
  const identities = { steward, reviewer, agent };
  const records = [];
  let tick = 0;
  const add = (identity, kind, body) => {
    const record = createRecord({
      records,
      identity,
      kind,
      body,
      time: new Date(Date.UTC(2026, 0, 1, 12, 0, tick++)).toISOString(),
    });
    records.push(record);
    return record;
  };
  add(steward, "project.created", {
    title: "Community seed catalogue",
    description:
      "Fictional Exofab-style proposal for a portable seed catalogue; no live integration.",
    participants: [
      { id: steward.id, name: "Mira", kind: "human" },
      {
        id: reviewer.id,
        name: "Jon",
        kind: "human",
      },
      {
        id: agent.id,
        name: "Seed builder",
        kind: "agent",
      },
    ],
  });
  const agreement = add(steward, "agreement.proposed", {
    title: "Sandbox collaboration terms",
    uri: "https://example.invalid/seed-catalogue/terms.txt",
    digest: digestBytes(
      readFileSync(new URL("../examples/terms.txt", import.meta.url)),
    ),
    parties: [steward.id, reviewer.id],
  });
  add(steward, "agreement.consented", { agreement: agreement.id });
  add(reviewer, "agreement.consented", { agreement: agreement.id });
  const delegation = add(steward, "delegation.granted", {
    agent: agent.id,
    agreement: agreement.id,
    scope: ["contribution.submit"],
    expires: "2027-01-01T00:00:00.000Z",
  });
  const contribution = add(agent, "contribution.submitted", {
    title: "Searchable seed catalogue schema",
    summary:
      "Fictional agent submission, independently reviewed before acceptance.",
    artifact: {
      uri: "https://example.invalid/seed-catalogue/schema.json",
      digest: digestBytes(
        readFileSync(
          new URL("../examples/seed-catalogue.schema.json", import.meta.url),
        ),
      ),
    },
    agreement: agreement.id,
    delegation: delegation.id,
  });
  const review = add(reviewer, "contribution.reviewed", {
    contribution: contribution.id,
    decision: "approve",
    note: "Sandbox review: supplied schema requires id, commonName, scientificName and origin with region/source, rejects unknown fields and permits harvestYear/notes. Conformance checks the supplied evidence bytes; no URI was fetched.",
  });
  add(steward, "contribution.accepted", {
    contribution: contribution.id,
    review: review.id,
  });
  if (stage === "disputed")
    add(reviewer, "contribution.disputed", {
      contribution: contribution.id,
      reason: "Fictional follow-up dispute about catalogue coverage.",
    });
  if (stage === "revoked") {
    records.splice(6);
    add(steward, "delegation.revoked", {
      delegation: delegation.id,
      reason: "Fictional principal revoked further agent authority.",
    });
  }
  return {
    bundle: createBundle(ordered ? records.slice(0, stages[stage]) : records),
    identities,
  };
}
