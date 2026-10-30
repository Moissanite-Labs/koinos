import { generateIdentity, digestBytes } from "./protocol.mjs";
import {
  createOpenRecord,
  createOpenBundle,
  mergeOpenBundles,
} from "./open-protocol.mjs";
export function createOpenDemo() {
  const creator = generateIdentity(),
    builder = generateIdentity(),
    reviewer = generateIdentity();
  let records = [];
  const time = "2026-10-29T12:00:00.000Z";
  const add = (identity, kind, body) => {
    const r = createOpenRecord({ records, identity, kind, body, time });
    records.push(r);
    return r.id;
  };
  const terms = {
    uri: "https://example.invalid/open-terms",
    digest: digestBytes(
      "Fictional sandbox criteria. No actual economic or legal rights.",
    ),
  };
  const originator = add(creator, "profile.published", {
    name: "Mira · fictional creator",
    skills: ["product design", "community"],
    needs: ["software engineering"],
    role: "creator",
    statement: "Sandbox profile; seeking a seed catalogue collaboration.",
  });
  add(builder, "profile.published", {
    name: "Seed builder · fictional agent",
    skills: ["software engineering", "JSON Schema"],
    needs: ["product design"],
    role: "agent builder",
    statement:
      "Declared capabilities only; no verified personhood or performance.",
  });
  const opportunity = add(creator, "opportunity.published", {
    title: "Portable seed catalogue",
    problem: "Small seed libraries need a shared catalogue format.",
    seeks: ["software engineering", "JSON Schema"],
    offers: ["product design", "community"],
    criteria:
      "Publish a bounded JSON Schema with origin fields; independent review remains a signed opinion.",
    terms,
  });
  const source = add(creator, "project.created", {
    title: "Common catalogue infrastructure",
    opportunity,
    originator,
    policy:
      "Permissionless claims. Signed reviews are evidence only. Ownership requires separate immutable on-chain rules.",
    terms,
    source: null,
  });
  const branch = add(creator, "project.created", {
    title: "Regional seed marketplace",
    opportunity,
    originator,
    policy:
      "Separate branch credit. Source revenue fee is a disclosed separate contract policy; this DAG executes no payment.",
    terms,
    source,
  });
  const contribution = add(builder, "contribution.claimed", {
    project: source,
    title: "Proposed seed catalogue schema",
    evidence: {
      uri: "https://example.invalid/private-draft/schema",
      digest: digestBytes("fictional schema"),
    },
    references: [],
    credit: [{ actor: builder.id, weight: 10000 }],
  });
  const base = createOpenBundle(records);
  const a = createOpenRecord({
    records,
    identity: reviewer,
    kind: "contribution.reviewed",
    time,
    body: {
      project: source,
      contribution,
      criteriaDigest: terms.digest,
      decision: "approve",
      rationale: "Fictional review: fields meet the declared example criteria.",
      reviewerType: "human",
      model: null,
    },
  });
  const b = createOpenRecord({
    records,
    identity: creator,
    kind: "contribution.reviewed",
    time,
    body: {
      project: source,
      contribution,
      criteriaDigest: terms.digest,
      decision: "request_changes",
      rationale: "Fictional disagreement: origin semantics need clarification.",
      reviewerType: "human",
      model: null,
    },
  });
  records = mergeOpenBundles(
    createOpenBundle([...base.records, a]),
    createOpenBundle([...base.records, b]),
  ).records;
  add(builder, "contribution.claimed", {
    project: branch,
    title: "Regional vocabulary adaptation",
    evidence: {
      uri: "urn:koinos:fictional:regional-vocabulary",
      digest: digestBytes("fictional branch work"),
    },
    references: [],
    credit: [{ actor: builder.id, weight: 10000 }],
  });
  add(builder, "feedback.consented", {
    contribution,
    purposes: ["evaluation"],
    action: "grant",
  });
  return createOpenBundle(records);
}
