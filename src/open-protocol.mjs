import { createPublicKey, createPrivateKey, sign, verify } from "node:crypto";
import { canonicalize, digestBytes } from "./protocol.mjs";
const FORMAT = "koinos-open/0.2",
  MAX = 10000;
const fail = (m) => {
  throw Error(m);
};
const fields = (v, ks) => {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join("|") !== ks.sort().join("|")
  )
    fail("Unexpected or missing open fields");
};
const text = (v, label, max = 8192) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    fail("Invalid " + label);
};
const hash = (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const timestamp = (v) => {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    fail("Invalid canonical timestamp");
};
function bytes(v, n) {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]+$/.test(v))
    fail("Invalid base64url");
  const b = Buffer.from(v, "base64url");
  if (b.length !== n || b.toString("base64url") !== v)
    fail("Noncanonical base64url");
  return b;
}
function pub(actor) {
  if (typeof actor !== "string" || !actor.startsWith("koinos:ed25519:"))
    fail("Invalid actor");
  return createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      bytes(actor.slice(15), 32),
    ]),
    type: "spki",
    format: "der",
  });
}
function list(v, label, max = 100) {
  if (!Array.isArray(v) || v.length > max || new Set(v).size !== v.length)
    fail("Invalid " + label);
  for (const x of v) text(x, label, 256);
}
function artifact(v) {
  fields(v, ["uri", "digest"]);
  text(v.uri, "URI", 4096);
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:[^\s]+$/.test(v.uri) || !hash(v.digest))
    fail("Invalid evidence or terms");
}
function sortedIds(ids) {
  if (
    !Array.isArray(ids) ||
    ids.length > MAX ||
    ids.some((x) => !hash(x)) ||
    ids.some((x, i) => i && ids[i - 1] >= x)
  )
    fail("Expected sorted unique record ids");
}
function topo(records) {
  if (!Array.isArray(records) || !records.length || records.length > MAX)
    fail("Open history must have 1..10000 records");
  const map = new Map();
  for (const r of records) {
    fields(r, [
      "protocol",
      "actor",
      "kind",
      "body",
      "time",
      "parents",
      "id",
      "signature",
    ]);
    if (r.protocol !== FORMAT || !hash(r.id))
      fail("Unsupported open protocol or id");
    if (map.has(r.id)) fail("Duplicate open record id");
    map.set(r.id, r);
    sortedIds(r.parents);
    timestamp(r.time);
    const { id, signature, ...unsigned } = r;
    if (digestBytes(canonicalize(unsigned)) !== id)
      fail("Open record digest mismatch");
    if (
      !verify(
        null,
        Buffer.from(FORMAT + "\n" + id),
        pub(r.actor),
        bytes(signature, 64),
      )
    )
      fail("Invalid open signature");
  }
  const children = new Map(),
    degree = new Map();
  for (const r of records) {
    degree.set(r.id, r.parents.length);
    for (const p of r.parents) {
      const parent = map.get(p);
      if (!parent) fail("Missing parent");
      if (parent.time > r.time) fail("Backwards parent time");
      if (!children.has(p)) children.set(p, []);
      children.get(p).push(r.id);
    }
  }
  const ready = [...map.keys()].filter((id) => !degree.get(id)).sort(),
    order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(map.get(id));
    for (const c of children.get(id) || []) {
      degree.set(c, degree.get(c) - 1);
      if (!degree.get(c)) {
        ready.push(c);
        ready.sort();
      }
    }
  }
  if (order.length !== records.length) fail("Cyclic open graph");
  return { order, map };
}
export function verifyOpenBundle(bundle) {
  canonicalize(bundle);
  fields(bundle, ["format", "records"]);
  if (bundle.format !== FORMAT) fail("Unsupported open bundle format");
  const { order, map } = topo(bundle.records);
  const state = {
    format: FORMAT,
    profiles: [],
    opportunities: [],
    projects: [],
    contributions: [],
    reviews: [],
    disputes: [],
    consents: [],
    settlements: [],
    walletBindings: [],
    intents: [],
    heads: [],
    count: order.length,
  };
  const ancestors = new Map(),
    projects = new Map(),
    claims = new Map(),
    reviews = new Map(),
    all = new Map();
  let ancestryEntries = 0;
  for (const r of order) {
    const seen = new Set();
    for (const p of r.parents) {
      seen.add(p);
      for (const a of ancestors.get(p)) seen.add(a);
    }
    ancestryEntries += seen.size;
    if (ancestryEntries > 500000)
      fail("Open ancestry complexity limit exceeded");
    ancestors.set(r.id, seen);
    const ref = (id, kind) => {
      const target = all.get(id);
      if (!target || !seen.has(id) || (kind && !kind.includes(target.kind)))
        fail("Missing, foreign or non-ancestral reference");
      return target;
    };
    const project = (id) => {
      ref(id, ["project.created"]);
      return projects.get(id);
    };
    const claim = (id, p) => {
      ref(id, ["contribution.claimed"]);
      const c = claims.get(id);
      if (c.project !== p) fail("Cross-project contribution reference");
      return c;
    };
    const b = r.body,
      entry = { id: r.id, actor: r.actor, time: r.time, ...b };
    switch (r.kind) {
      case "profile.published":
        fields(b, ["name", "skills", "needs", "role", "statement"]);
        text(b.name, "name", 256);
        list(b.skills, "skills");
        list(b.needs, "needs");
        text(b.role, "role", 256);
        text(b.statement, "statement");
        state.profiles.push(entry);
        break;
      case "opportunity.published":
        fields(b, ["title", "problem", "seeks", "offers", "criteria", "terms"]);
        text(b.title, "title", 256);
        text(b.problem, "problem");
        list(b.seeks, "seeks");
        list(b.offers, "offers");
        text(b.criteria, "criteria");
        artifact(b.terms);
        state.opportunities.push(entry);
        break;
      case "project.created":
        fields(b, [
          "title",
          "opportunity",
          "originator",
          "policy",
          "terms",
          "source",
        ]);
        text(b.title, "title", 256);
        text(b.policy, "policy");
        artifact(b.terms);
        if (b.opportunity !== null)
          ref(b.opportunity, ["opportunity.published"]);
        if (ref(b.originator, ["profile.published"]).actor !== r.actor)
          fail("Originator profile must belong to signer");
        if (b.source !== null) project(b.source);
        projects.set(r.id, entry);
        state.projects.push(entry);
        break;
      case "contribution.claimed": {
        fields(b, ["project", "title", "evidence", "references", "credit"]);
        project(b.project);
        text(b.title, "title", 256);
        artifact(b.evidence);
        sortedIds(b.references);
        for (const id of b.references) claim(id, b.project);
        if (
          !Array.isArray(b.credit) ||
          !b.credit.length ||
          b.credit.length > 100
        )
          fail("Invalid proposed credit");
        let total = 0;
        for (const [i, c] of b.credit.entries()) {
          fields(c, ["actor", "weight"]);
          pub(c.actor);
          if (
            !Number.isSafeInteger(c.weight) ||
            c.weight < 1 ||
            c.weight > 10000 ||
            (i && b.credit[i - 1].actor >= c.actor)
          )
            fail("Invalid sorted unique credit plan");
          total += c.weight;
        }
        if (total !== 10000) fail("Proposed credit must sum to 10000");
        Object.assign(entry, {
          reviews: [],
          disputes: [],
          settlements: [],
          creditStatus: "proposed",
          independentReviewCount: 0,
          settlementVerified: false,
        });
        claims.set(r.id, entry);
        state.contributions.push(entry);
        break;
      }
      case "contribution.reviewed": {
        fields(b, [
          "project",
          "contribution",
          "criteriaDigest",
          "decision",
          "rationale",
          "reviewerType",
          "model",
        ]);
        project(b.project);
        const c = claim(b.contribution, b.project);
        if (
          !hash(b.criteriaDigest) ||
          !["approve", "request_changes", "reject"].includes(b.decision)
        )
          fail("Invalid review criteria or decision");
        text(b.rationale, "rationale");
        if (!["human", "model"].includes(b.reviewerType))
          fail("Invalid reviewer type");
        if (b.reviewerType === "model") {
          fields(b.model, ["name", "version"]);
          text(b.model.name, "model name", 256);
          text(b.model.version, "model version", 256);
        } else if (b.model !== null)
          fail("Human review cannot claim model metadata");
        entry.independent =
          r.actor !== c.actor && !c.credit.some((x) => x.actor === r.actor);
        entry.trust = "signed claim; reviewer identity/type unverified";
        reviews.set(r.id, entry);
        c.reviews.push(entry);
        state.reviews.push(entry);
        break;
      }
      case "contribution.disputed": {
        fields(b, ["project", "target", "reason"]);
        project(b.project);
        text(b.reason, "reason");
        const target = ref(b.target, [
          "contribution.claimed",
          "contribution.reviewed",
        ]);
        if (target.body.project !== b.project) fail("Cross-project dispute");
        const c =
          target.kind === "contribution.claimed"
            ? claims.get(target.id)
            : claims.get(target.body.contribution);
        entry.contribution = c.id;
        c.disputes.push(entry);
        state.disputes.push(entry);
        break;
      }
      case "feedback.consented":
        fields(b, ["contribution", "purposes", "action"]);
        {
          const target = ref(b.contribution, ["contribution.claimed"]);
          if (target.actor !== r.actor)
            fail("Only contribution actor may consent");
          list(b.purposes, "purposes", 2);
          if (
            !b.purposes.length ||
            b.purposes.some((p) => !["evaluation", "training"].includes(p)) ||
            !["grant", "revoke"].includes(b.action)
          )
            fail("Invalid feedback consent");
          state.consents.push(entry);
        }
        break;
      case "wallet.bound":
        fields(b, ["project", "chainId", "address"]);
        project(b.project);
        if (
          !Number.isSafeInteger(b.chainId) ||
          b.chainId < 1 ||
          !evmAddress(b.address)
        )
          fail("Invalid wallet binding");
        state.walletBindings.push(entry);
        break;
      case "settlement.intent": {
        fields(b, [
          "project",
          "contribution",
          "chainId",
          "contract",
          "bindings",
        ]);
        project(b.project);
        const c = claim(b.contribution, b.project);
        if (r.actor !== c.actor)
          fail("Only contribution signer may authorize settlement intent");
        if (
          !Number.isSafeInteger(b.chainId) ||
          b.chainId < 1 ||
          !evmAddress(b.contract)
        )
          fail("Invalid settlement intent locator");
        sortedIds(b.bindings);
        if (b.bindings.length > 101) fail("Too many settlement bindings");
        const bound = b.bindings.map((id) => {
          const target = ref(id, ["wallet.bound"]);
          return { id: target.id, actor: target.actor, ...target.body };
        });
        validateBindings(c, b, bound);
        state.intents.push(entry);
        break;
      }
      case "settlement.referenced":
        fields(b, [
          "project",
          "contribution",
          "chainId",
          "contract",
          "transaction",
        ]);
        project(b.project);
        {
          const c = claim(b.contribution, b.project);
          if (
            !Number.isSafeInteger(b.chainId) ||
            b.chainId < 1 ||
            typeof b.contract !== "string" ||
            !/^0x[0-9a-fA-F]{40}$/.test(b.contract) ||
            typeof b.transaction !== "string" ||
            !/^0x[0-9a-fA-F]{64}$/.test(b.transaction)
          )
            fail("Invalid settlement locator");
          entry.status = "unverified";
          entry.settlementVerified = false;
          c.settlements.push(entry);
          state.settlements.push(entry);
        }
        break;
      default:
        fail("Unsupported open event kind");
    }
    all.set(r.id, r);
  }
  for (const c of state.contributions) {
    c.independentReviewCount = c.reviews.filter((r) => r.independent).length;
    c.creditStatus = c.disputes.length
      ? "disputed"
      : c.settlements.length
        ? "settlement-reference"
        : c.reviews.length
          ? "attested"
          : "proposed";
  }
  const parents = new Set(order.flatMap((r) => r.parents));
  state.heads = order
    .filter((r) => !parents.has(r.id))
    .map((r) => r.id)
    .sort();
  return JSON.parse(canonicalize(state));
}
export function createOpenBundle(records) {
  const bundle = { format: FORMAT, records };
  verifyOpenBundle(bundle);
  const { order } = topo(records);
  return JSON.parse(canonicalize({ format: FORMAT, records: order }));
}
export function mergeOpenBundles(...bundles) {
  if (!bundles.length) fail("At least one bundle required");
  const records = new Map();
  for (const b of bundles) {
    verifyOpenBundle(b);
    for (const r of b.records) {
      if (
        records.has(r.id) &&
        canonicalize(records.get(r.id)) !== canonicalize(r)
      )
        fail("Duplicate id has altered content");
      records.set(r.id, r);
    }
  }
  return createOpenBundle([...records.values()]);
}
export function createOpenRecord({
  records,
  identity,
  kind,
  body,
  parents,
  time = new Date().toISOString(),
}) {
  if (!Array.isArray(records)) fail("Records required");
  const state = records.length
    ? verifyOpenBundle({ format: FORMAT, records })
    : null;
  const key = createPrivateKey(identity.privateKey);
  if (key.asymmetricKeyType !== "ed25519") fail("Ed25519 key required");
  const derived =
    "koinos:ed25519:" +
    createPublicKey(key)
      .export({ type: "spki", format: "der" })
      .subarray(-32)
      .toString("base64url");
  if (derived !== identity.id) fail("Signing identity mismatch");
  const unsigned = {
    protocol: FORMAT,
    actor: identity.id,
    kind,
    body,
    time,
    parents: parents ?? state?.heads ?? [],
  };
  const id = digestBytes(canonicalize(unsigned));
  const record = {
    ...unsigned,
    id,
    signature: sign(null, Buffer.from(FORMAT + "\n" + id), key).toString(
      "base64url",
    ),
  };
  verifyOpenBundle({ format: FORMAT, records: [...records, record] });
  return JSON.parse(canonicalize(record));
}
const normalized = (xs) =>
  [
    ...new Set(
      xs.map((x) => x.normalize("NFKC").trim().toLocaleLowerCase("en-US")),
    ),
  ].sort();
export function matchOpportunities(bundle, profileId) {
  const s = verifyOpenBundle(bundle),
    p = s.profiles.find((p) => p.id === profileId);
  if (!p) fail("Unknown profile");
  const skills = normalized(p.skills),
    needs = normalized(p.needs);
  return s.opportunities
    .map((o) => {
      const matchedSkills = normalized(o.seeks).filter((x) =>
          skills.includes(x),
        ),
        matchedNeeds = normalized(o.offers).filter((x) => needs.includes(x));
      return {
        opportunity: o.id,
        score: matchedSkills.length + matchedNeeds.length,
        matchedSkills,
        matchedNeeds,
        explanation: `${matchedSkills.length} skill overlaps; ${matchedNeeds.length} need overlaps. Declared tags only; no identity or quality ranking.`,
      };
    })
    .sort(
      (a, b) => b.score - a.score || a.opportunity.localeCompare(b.opportunity),
    );
}
export function exportConsentedFeedback(bundle, purpose) {
  if (!["evaluation", "training"].includes(purpose))
    fail("Unsupported feedback purpose");
  const s = verifyOpenBundle(bundle),
    { order } = topo(bundle.records),
    ancestors = new Map();
  for (const r of order) {
    const a = new Set(r.parents);
    for (const p of r.parents) for (const id of ancestors.get(p)) a.add(id);
    ancestors.set(r.id, a);
  }
  const feedback = [];
  for (const c of s.contributions) {
    const events = s.consents.filter(
      (x) => x.contribution === c.id && x.purposes.includes(purpose),
    );
    const maximal = events.filter(
      (x) => !events.some((y) => ancestors.get(y.id).has(x.id)),
    );
    if (!maximal.length || maximal.some((x) => x.action !== "grant")) continue;
    feedback.push({
      contribution: c.id,
      project: c.project,
      purpose,
      reviewCount: c.reviews.length,
      independentReviewCount: c.independentReviewCount,
      decisions: c.reviews.map((r) => r.decision).sort(),
      disputed: c.disputes.length > 0,
      consentRecords: maximal.map((x) => x.id).sort(),
    });
  }
  return {
    format: "koinos-feedback/0.2",
    purpose,
    notice:
      "Current explicit opt-in only; revocation cannot recall past exports. No work text, URLs, names or terms exported.",
    feedback,
  };
}

function evmAddress(v) {
  return (
    typeof v === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(v) &&
    !/^0x0{40}$/i.test(v)
  );
}
function validateBindings(contribution, intent, bindings) {
  const required = new Set([
      contribution.actor,
      ...contribution.credit.map((c) => c.actor),
    ]),
    byActor = new Map(),
    addresses = new Set();
  if (bindings.length !== required.size)
    fail("Exact beneficiary and principal bindings required");
  for (const b of bindings) {
    if (b.project !== intent.project || b.chainId !== intent.chainId)
      fail("Wrong project or chain wallet binding");
    if (!required.has(b.actor) || byActor.has(b.actor))
      fail("Extra or duplicate beneficiary binding");
    const address = b.address.toLowerCase();
    if (addresses.has(address)) fail("Distinct destination addresses required");
    addresses.add(address);
    byActor.set(b.actor, address);
  }
  if ([...required].some((actor) => !byActor.has(actor)))
    fail("Missing beneficiary or principal binding");
  return byActor;
}
export function deriveSettlementPlan(bundle, intentId) {
  const state = verifyOpenBundle(bundle),
    intent = state.intents.find((i) => i.id === intentId);
  if (!intent) fail("Unknown settlement intent");
  const contribution = state.contributions.find(
      (c) => c.id === intent.contribution,
    ),
    project = state.projects.find((p) => p.id === intent.project);
  const bindings = intent.bindings.map((id) =>
    state.walletBindings.find((b) => b.id === id),
  );
  const byActor = validateBindings(contribution, intent, bindings);
  const credit = contribution.credit
    .map((c) => ({ address: byActor.get(c.actor), weight: c.weight }))
    .sort((a, b) =>
      a.address < b.address ? -1 : a.address > b.address ? 1 : 0,
    );
  return {
    project: intent.project,
    contribution: intent.contribution,
    chainId: intent.chainId,
    contract: intent.contract.toLowerCase(),
    principal: byActor.get(contribution.actor),
    evidenceHash: "0x" + contribution.evidence.digest,
    workId: "0x" + contribution.id,
    termsHash: "0x" + project.terms.digest,
    criteriaHash: "0x" + digestBytes(project.policy),
    recipients: credit.map((c) => c.address),
    weights: credit.map((c) => c.weight),
  };
}
