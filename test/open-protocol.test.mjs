import test from "node:test";
import assert from "node:assert/strict";
import {
  generateIdentity,
  digestBytes,
  canonicalize,
} from "../src/protocol.mjs";
import {
  createOpenRecord,
  createOpenBundle,
  mergeOpenBundles,
  verifyOpenBundle,
  matchOpportunities,
  exportConsentedFeedback,
} from "../src/open-protocol.mjs";
import { createOpenDemo } from "../src/open-demo.mjs";
const time = "2026-10-29T12:00:00.000Z";
const identity = generateIdentity();
const profile = (records = [], actor = identity) =>
  createOpenRecord({
    records,
    identity: actor,
    kind: "profile.published",
    time,
    body: {
      name: "Human claim",
      skills: ["Engineering"],
      needs: ["Design"],
      role: "builder",
      statement: "Private statement",
    },
  });
function setup() {
  const b = createOpenDemo(),
    s = verifyOpenBundle(b);
  return { b, s, c: s.contributions[0], p: s.projects[0] };
}
test("permissionless roots, deterministic permutation, commutative associative idempotent merge", () => {
  const a = createOpenBundle([profile()]),
    b = createOpenBundle([profile([], generateIdentity())]),
    c = createOpenBundle([profile([], generateIdentity())]);
  const merged = mergeOpenBundles(a, b, c);
  assert.equal(verifyOpenBundle(merged).profiles.length, 3);
  assert.equal(canonicalize(merged), canonicalize(mergeOpenBundles(c, b, a)));
  assert.equal(
    canonicalize(merged),
    canonicalize(mergeOpenBundles(mergeOpenBundles(a, b), c)),
  );
  assert.equal(
    canonicalize(merged),
    canonicalize(mergeOpenBundles(merged, merged)),
  );
  assert.equal(
    canonicalize(createOpenBundle([...merged.records].reverse())),
    canonicalize(merged),
  );
});
test("demo preserves competing reviews, attribution, branch separation and no automatic earned credit", () => {
  const { s, c } = setup();
  assert.equal(c.reviews.length, 2);
  assert.deepEqual(c.reviews.map((x) => x.decision).sort(), [
    "approve",
    "request_changes",
  ]);
  assert.equal(c.creditStatus, "attested");
  assert.equal(s.projects.length, 2);
  assert.equal(s.projects.filter((p) => p.source !== null).length, 1);
  assert.notEqual(s.contributions[0].project, s.contributions[1].project);
  assert.equal("accepted" in c, false);
  assert.equal("earnedCredit" in c, false);
});
test("altered signatures, unknown fields, missing parents, unsupported version, identity spoofing fail", () => {
  const { b } = setup();
  for (const mutate of [
    (b) => (b.records[0].body.name = "tamper"),
    (b) => (b.records[0].signature = "A".repeat(86)),
    (b) => (b.records[0].extra = 1),
    (b) => (b.format = "koinos-open/0.3"),
    (b) => (b.records[0].actor = generateIdentity().id),
  ]) {
    const x = structuredClone(b);
    mutate(x);
    assert.throws(() => verifyOpenBundle(x));
  }
  const x = structuredClone(b);
  const parent = x.records.find((r) => r.parents.length).parents[0];
  x.records = x.records.filter((r) => r.id !== parent);
  assert.throws(() => verifyOpenBundle(x), /Missing parent/);
  assert.throws(
    () => createOpenBundle([...b.records, b.records[0]]),
    /Duplicate/,
  );
});
test("all semantic references must be actual ancestors and project scoped", () => {
  const { b, c, s } = setup();
  const actor = generateIdentity();
  const body = {
    project: c.project,
    contribution: c.id,
    criteriaDigest: digestBytes("criteria"),
    decision: "approve",
    rationale: "Claim",
    reviewerType: "human",
    model: null,
  };
  assert.throws(
    () =>
      createOpenRecord({
        records: b.records,
        identity: actor,
        kind: "contribution.reviewed",
        body,
        parents: [],
        time,
      }),
    /reference/,
  );
  assert.throws(
    () =>
      createOpenRecord({
        records: b.records,
        identity: actor,
        kind: "contribution.reviewed",
        body: {
          ...body,
          project: s.projects.find((p) => p.id !== c.project).id,
        },
        time,
      }),
    /Cross-project/,
  );
  assert.throws(
    () =>
      createOpenRecord({
        records: b.records,
        identity: actor,
        kind: "project.created",
        time,
        body: {
          title: "Stolen profile",
          opportunity: null,
          originator: s.profiles[0].id,
          policy: "Policy",
          terms: s.projects[0].terms,
          source: null,
        },
      }),
    /belong/,
  );
});
test("self and beneficiary reviews recorded honestly; disputes permanent without erase authority", () => {
  let records = [];
  const add = (kind, body) => {
    const r = createOpenRecord({ records, identity, kind, body, time });
    records.push(r);
    return r.id;
  };
  const originator = add("profile.published", {
    name: "X",
    skills: [],
    needs: [],
    role: "creator",
    statement: "x",
  });
  const project = add("project.created", {
    title: "X",
    opportunity: null,
    originator,
    policy: "Immutable declared policy",
    terms: { uri: "urn:terms", digest: digestBytes("x") },
    source: null,
  });
  const contribution = add("contribution.claimed", {
    project,
    title: "X",
    evidence: { uri: "urn:work", digest: digestBytes("x") },
    references: [],
    credit: [{ actor: identity.id, weight: 10000 }],
  });
  add("contribution.reviewed", {
    project,
    contribution,
    criteriaDigest: digestBytes("x"),
    decision: "approve",
    rationale: "self",
    reviewerType: "human",
    model: null,
  });
  let s = verifyOpenBundle(createOpenBundle(records));
  assert.equal(s.contributions[0].independentReviewCount, 0);
  assert.equal(s.reviews[0].independent, false);
  const outsider = generateIdentity();
  const d = createOpenRecord({
    records,
    identity: outsider,
    time,
    kind: "contribution.disputed",
    body: { project, target: contribution, reason: "Disagreement" },
  });
  records.push(d);
  s = verifyOpenBundle(createOpenBundle(records));
  assert.equal(s.contributions[0].creditStatus, "disputed");
  assert.equal(s.disputes[0].actor, outsider.id);
  assert.throws(() =>
    createOpenRecord({
      records,
      identity,
      kind: "contribution.erased",
      body: { contribution },
      time,
    }),
  );
});
function consentFixture() {
  let records = [];
  const add = (kind, body, parents) => {
    const r = createOpenRecord({
      records,
      identity,
      kind,
      body,
      parents,
      time,
    });
    records.push(r);
    return r.id;
  };
  const originator = add("profile.published", {
    name: "Private name",
    skills: [],
    needs: [],
    role: "builder",
    statement: "Sensitive prose",
  });
  const project = add("project.created", {
    title: "Sensitive project",
    opportunity: null,
    originator,
    policy: "Secret policy",
    terms: {
      uri: "https://private.invalid/terms?secret=1",
      digest: digestBytes("secret"),
    },
    source: null,
  });
  const contribution = add("contribution.claimed", {
    project,
    title: "Private work title",
    evidence: {
      uri: "https://private.invalid/work?token=secret",
      digest: digestBytes("secret"),
    },
    references: [],
    credit: [{ actor: identity.id, weight: 10000 }],
  });
  return { records, add, contribution };
}
test("feedback default denies, exports minimal fields, revocation applies to future export", () => {
  const f = consentFixture();
  assert.equal(
    exportConsentedFeedback(createOpenBundle(f.records), "training").feedback
      .length,
    0,
  );
  f.add("feedback.consented", {
    contribution: f.contribution,
    purposes: ["evaluation"],
    action: "grant",
  });
  assert.equal(
    exportConsentedFeedback(createOpenBundle(f.records), "training").feedback
      .length,
    0,
  );
  const e = exportConsentedFeedback(createOpenBundle(f.records), "evaluation");
  assert.equal(e.feedback.length, 1);
  assert.doesNotMatch(
    JSON.stringify(e),
    /private.invalid|Sensitive|Secret|Private work|koinos:ed25519/,
  );
  f.add("feedback.consented", {
    contribution: f.contribution,
    purposes: ["evaluation"],
    action: "revoke",
  });
  assert.equal(
    exportConsentedFeedback(createOpenBundle(f.records), "evaluation").feedback
      .length,
    0,
  );
  assert.equal(e.feedback.length, 1);
});
test("concurrent consent conflicts deny; causally later explicit grant restores; outsiders cannot grant", () => {
  const f = consentFixture(),
    base = createOpenBundle(f.records);
  const body = {
    contribution: f.contribution,
    purposes: ["training"],
    action: "grant",
  };
  const grant = createOpenRecord({
    records: base.records,
    identity,
    kind: "feedback.consented",
    body,
    time,
  });
  const revoke = createOpenRecord({
    records: base.records,
    identity,
    kind: "feedback.consented",
    body: { ...body, action: "revoke" },
    time,
  });
  const merged = mergeOpenBundles(
    createOpenBundle([...base.records, grant]),
    createOpenBundle([...base.records, revoke]),
  );
  assert.equal(exportConsentedFeedback(merged, "training").feedback.length, 0);
  const regrant = createOpenRecord({
    records: merged.records,
    identity,
    kind: "feedback.consented",
    body,
    time,
  });
  assert.equal(
    exportConsentedFeedback(
      createOpenBundle([...merged.records, regrant]),
      "training",
    ).feedback.length,
    1,
  );
  assert.throws(
    () =>
      createOpenRecord({
        records: base.records,
        identity: generateIdentity(),
        kind: "feedback.consented",
        body,
        time,
      }),
    /Only contribution actor/,
  );
});
test("settlement locator remains explicitly unverified regardless of signatures or receipt-like fields", () => {
  const { b, c } = setup();
  const body = {
    project: c.project,
    contribution: c.id,
    chainId: 31337,
    contract: "0x" + "1".repeat(40),
    transaction: "0x" + "2".repeat(64),
  };
  const r = createOpenRecord({
    records: b.records,
    identity,
    kind: "settlement.referenced",
    body,
    time,
  });
  const s = verifyOpenBundle(createOpenBundle([...b.records, r]));
  assert.equal(s.settlements[0].status, "unverified");
  assert.equal(
    s.contributions.find((x) => x.id === c.id).settlementVerified,
    false,
  );
  assert.throws(() =>
    createOpenRecord({
      records: b.records,
      identity,
      kind: "settlement.referenced",
      body: { ...body, verified: true },
      time,
    }),
  );
});
test("matching explains declared overlap only and is permutation deterministic", () => {
  const { b, s } = setup();
  const p = s.profiles.find((x) => x.skills.includes("JSON Schema"));
  const matches = matchOpportunities(b, p.id);
  assert.equal(matches[0].matchedSkills.length, 2);
  assert.match(matches[0].explanation, /Declared tags only/);
  assert.deepEqual(
    matches,
    matchOpportunities({ ...b, records: [...b.records].reverse() }, p.id),
  );
});
test("invalid credit plans/model metadata, malformed unicode and backwards parent times rejected", () => {
  const { b, c } = setup();
  const body = {
    project: c.project,
    title: "x",
    evidence: c.evidence,
    references: [],
    credit: [{ actor: identity.id, weight: 9999 }],
  };
  assert.throws(
    () =>
      createOpenRecord({
        records: b.records,
        identity,
        kind: "contribution.claimed",
        body,
        time,
      }),
    /sum/,
  );
  assert.throws(
    () =>
      createOpenRecord({
        records: b.records,
        identity,
        kind: "profile.published",
        body: {
          name: "\ud800",
          skills: [],
          needs: [],
          role: "x",
          statement: "x",
        },
        time,
      }),
    /Unicode/,
  );
  assert.throws(
    () =>
      createOpenRecord({
        records: b.records,
        identity,
        kind: "profile.published",
        body: { name: "x", skills: [], needs: [], role: "x", statement: "x" },
        time: "2026-10-28T00:00:00.000Z",
      }),
    /Backwards/,
  );
});

import { deriveSettlementPlan } from "../src/open-protocol.mjs";
function bridgeFixture() {
  const author = generateIdentity(),
    beneficiary = generateIdentity(),
    outsider = generateIdentity();
  let records = [];
  const add = (identity, kind, body, parents) => {
    const r = createOpenRecord({
      records,
      identity,
      kind,
      body,
      parents,
      time,
    });
    records.push(r);
    return r.id;
  };
  const originator = add(author, "profile.published", {
    name: "Author",
    skills: [],
    needs: [],
    role: "creator",
    statement: "Test",
  });
  const project = add(author, "project.created", {
    title: "Bridge",
    opportunity: null,
    originator,
    policy: "Exact pre-agreed criteria",
    terms: { uri: "urn:terms", digest: digestBytes("terms bytes") },
    source: null,
  });
  const contribution = add(author, "contribution.claimed", {
    project,
    title: "Evidence",
    evidence: {
      uri: "urn:artifact",
      digest: digestBytes("exact artifact bytes"),
    },
    references: [],
    credit: [{ actor: beneficiary.id, weight: 10000 }],
  });
  const chainId = 31337,
    contract = "0x" + "c".repeat(40);
  const principal = add(author, "wallet.bound", {
      project,
      chainId,
      address: "0x" + "2".repeat(40),
    }),
    recipient = add(beneficiary, "wallet.bound", {
      project,
      chainId,
      address: "0x" + "1".repeat(40),
    });
  const intentBody = {
    project,
    contribution,
    chainId,
    contract,
    bindings: [principal, recipient].sort(),
  };
  return {
    author,
    beneficiary,
    outsider,
    records,
    add,
    project,
    contribution,
    principal,
    recipient,
    intentBody,
  };
}
test("settlement plan pins exact graph, evidence, terms, criteria and independent principal binding", () => {
  const f = bridgeFixture(),
    intent = f.add(f.author, "settlement.intent", f.intentBody);
  const b = createOpenBundle(f.records),
    p = deriveSettlementPlan(b, intent);
  assert.equal(p.principal, "0x" + "2".repeat(40));
  assert.deepEqual(p.recipients, ["0x" + "1".repeat(40)]);
  assert.deepEqual(p.weights, [10000]);
  assert.equal(p.workId, "0x" + f.contribution);
  assert.equal(p.evidenceHash, "0x" + digestBytes("exact artifact bytes"));
  assert.equal(p.termsHash, "0x" + digestBytes("terms bytes"));
  assert.equal(p.criteriaHash, "0x" + digestBytes("Exact pre-agreed criteria"));
  assert.equal(verifyOpenBundle(b).contributions[0].settlementVerified, false);
  f.add(f.beneficiary, "wallet.bound", {
    project: f.project,
    chainId: 31337,
    address: "0x" + "9".repeat(40),
  });
  assert.deepEqual(
    deriveSettlementPlan(createOpenBundle(f.records), intent),
    p,
  );
  assert.throws(
    () => deriveSettlementPlan(b, "0".repeat(64)),
    /Unknown settlement intent/,
  );
});
test("forged wallet destinations, signer impersonation, extras and nonancestor bindings rejected", () => {
  const f = bridgeFixture();
  assert.throws(
    () =>
      f.add(f.outsider, "wallet.bound", {
        project: f.project,
        chainId: 31337,
        address: "0x" + "0".repeat(40),
      }),
    /wallet binding/,
  );
  assert.throws(
    () => f.add(f.outsider, "settlement.intent", f.intentBody),
    /Only contribution signer/,
  );
  const forged = f.add(f.outsider, "wallet.bound", {
    project: f.project,
    chainId: 31337,
    address: "0x" + "3".repeat(40),
  });
  assert.throws(
    () =>
      f.add(f.author, "settlement.intent", {
        ...f.intentBody,
        bindings: [f.principal, forged].sort(),
      }),
    /beneficiary/,
  );
  assert.throws(
    () =>
      f.add(f.author, "settlement.intent", {
        ...f.intentBody,
        bindings: [f.principal, f.recipient, forged].sort(),
      }),
    /Exact beneficiary/,
  );
  assert.throws(
    () => f.add(f.author, "settlement.intent", f.intentBody, []),
    /reference/,
  );
  assert.throws(
    () =>
      f.add(f.author, "settlement.intent", {
        ...f.intentBody,
        bindings: [f.recipient],
      }),
    /principal bindings/,
  );
});
test("bindings cannot cross chain/project or alias two beneficiaries to one wallet", () => {
  const f = bridgeFixture();
  const wrongChain = f.add(f.beneficiary, "wallet.bound", {
    project: f.project,
    chainId: 1,
    address: "0x" + "4".repeat(40),
  });
  assert.throws(
    () =>
      f.add(f.author, "settlement.intent", {
        ...f.intentBody,
        bindings: [f.principal, wrongChain].sort(),
      }),
    /Wrong project or chain/,
  );
  const secondProject = f.add(f.author, "project.created", {
    title: "Other",
    opportunity: null,
    originator: f.records.find((r) => r.kind === "profile.published").id,
    policy: "Other",
    terms: { uri: "urn:other", digest: digestBytes("other") },
    source: null,
  });
  const wrongProject = f.add(f.beneficiary, "wallet.bound", {
    project: secondProject,
    chainId: 31337,
    address: "0x" + "5".repeat(40),
  });
  assert.throws(
    () =>
      f.add(f.author, "settlement.intent", {
        ...f.intentBody,
        bindings: [f.principal, wrongProject].sort(),
      }),
    /Wrong project or chain/,
  );
  const alias = f.add(f.beneficiary, "wallet.bound", {
    project: f.project,
    chainId: 31337,
    address: "0x" + "2".repeat(40),
  });
  assert.throws(
    () =>
      f.add(f.author, "settlement.intent", {
        ...f.intentBody,
        bindings: [f.principal, alias].sort(),
      }),
    /Distinct destination/,
  );
});

test("future-dated heads do not prevent default append; explicit backwards time still fails", () => {
  const a = profile([], generateIdentity());
  const future = createOpenRecord({
    records: [a],
    identity,
    kind: "profile.published",
    body: {
      name: "Future assertion",
      skills: [],
      needs: [],
      role: "builder",
      statement: "Untrusted signed timestamp",
    },
    time: "9999-12-31T23:59:59.999Z",
  });
  const records = mergeOpenBundles(
    createOpenBundle([a]),
    createOpenBundle([a, future]),
  ).records;
  const body = {
    name: "New work",
    skills: [],
    needs: [],
    role: "builder",
    statement: "Must remain appendable",
  };
  const next = createOpenRecord({
    records,
    identity,
    kind: "profile.published",
    body,
  });
  assert.equal(next.time, future.time);
  assert.deepEqual(next.parents, [future.id]);
  assert.throws(
    () =>
      createOpenRecord({
        records,
        identity,
        kind: "profile.published",
        body,
        time,
      }),
    /Backwards parent time/,
  );
  const separate = createOpenRecord({
    records,
    identity,
    kind: "profile.published",
    body,
    parents: [a.id],
  });
  assert.ok(separate.time < future.time);
});

test("graph retains 33 beneficiaries while settlement enforces the 32-recipient contract boundary", () => {
  const owner = generateIdentity(),
    actors = Array.from({ length: 100 }, () => generateIdentity());
  let records = [];
  const add = (identity, kind, body) => {
    const r = createOpenRecord({ records, identity, kind, body, time });
    records.push(r);
    return r.id;
  };
  const originator = add(owner, "profile.published", {
    name: "Owner",
    skills: [],
    needs: [],
    role: "creator",
    statement: "Boundary",
  });
  const project = add(owner, "project.created", {
    title: "Boundary",
    opportunity: null,
    originator,
    policy: "Policy",
    terms: { uri: "urn:terms", digest: digestBytes("terms") },
    source: null,
  });
  const creditFor = (n) =>
    actors
      .slice(0, n)
      .map((a, i) => ({
        actor: a.id,
        weight:
          i === n - 1
            ? 10000 - (n - 1) * Math.floor(10000 / n)
            : Math.floor(10000 / n),
      }))
      .sort((a, b) => (a.actor < b.actor ? -1 : 1));
  const claim = (n) =>
    add(owner, "contribution.claimed", {
      project,
      title: `${n} beneficiaries`,
      evidence: { uri: "urn:evidence", digest: digestBytes("evidence") },
      references: [],
      credit: creditFor(n),
    });
  const c33 = claim(33),
    c32 = claim(32),
    c100 = claim(100);
  const principal = add(owner, "wallet.bound", {
    project,
    chainId: 31337,
    address: "0x" + "f".repeat(40),
  });
  const bindings = actors
    .slice(0, 33)
    .map((a, i) =>
      add(a, "wallet.bound", {
        project,
        chainId: 31337,
        address: "0x" + (i + 1).toString(16).padStart(40, "0"),
      }),
    );
  const body = {
    project,
    contribution: c33,
    chainId: 31337,
    contract: "0x" + "e".repeat(40),
    bindings: [principal, ...bindings].sort(),
  };
  assert.equal(
    verifyOpenBundle(createOpenBundle(records)).contributions.find(
      (c) => c.id === c33,
    ).credit.length,
    33,
  );
  assert.equal(
    verifyOpenBundle(createOpenBundle(records)).contributions.find(
      (c) => c.id === c100,
    ).credit.length,
    100,
  );
  assert.throws(
    () => add(owner, "settlement.intent", body),
    /at most 32 credit recipients/,
  );
  const intent = add(owner, "settlement.intent", {
    ...body,
    contribution: c32,
    bindings: [principal, ...bindings.slice(0, 32)].sort(),
  });
  const plan = deriveSettlementPlan(createOpenBundle(records), intent);
  assert.equal(plan.recipients.length, 32);
  assert.equal(
    plan.weights.reduce((a, b) => a + b),
    10000,
  );
});
