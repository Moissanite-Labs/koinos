import { verifyOpenCrypto, signOpen, hash, encode64 } from "./open-crypto.mjs";
import { simulate } from "./open-economics.mjs";
const $ = (id) => document.getElementById(id);
let bundle,
  state,
  generation = 0,
  sessionKey;
const MAX = 2 * 1024 * 1024;
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function add(parent, tag, text, cls) {
  const n = el(tag, text, cls);
  parent.append(n);
  return n;
}
function card(parent, title, tag) {
  const n = add(parent, "article", undefined, "card");
  if (tag) add(n, "span", tag, "tag " + tag);
  add(n, "h4", title);
  return n;
}
function name(actor) {
  return (
    state.profiles.find((p) => p.actor === actor)?.name ||
    actor.slice(0, 25) + "…"
  );
}
function ref(parent, value, label = "Record") {
  add(parent, "p", label + " / " + value, "mono");
}
function link(parent, reference) {
  const p = add(parent, "p");
  try {
    const u = new URL(reference.uri);
    if (["https:", "http:"].includes(u.protocol)) {
      const a = add(p, "a", u.href);
      a.href = u.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } else p.textContent = reference.uri;
  } catch {
    p.textContent = reference.uri;
  }
  ref(parent, reference.digest, "SHA-256");
}
function begin() {
  const token = ++generation;
  $("verified").hidden = true;
  $("export").disabled = true;
  $("error").hidden = true;
  $("status").textContent = "Checking signed graph…";
  return token;
}
function fail(e, token) {
  if (token !== generation) return;
  $("error").textContent = e.message;
  $("error").hidden = false;
  $("status").textContent = "Operation rejected. No graph displayed.";
}
async function post(path, input) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result;
}
async function load(candidate, token, message = "") {
  if (token !== generation) return;
  await verifyOpenCrypto(candidate);
  const result = await post("/api/open/verify", candidate);
  if (token !== generation) return;
  bundle = candidate;
  state = result.state;
  render();
  $("status").textContent =
    `✓ Browser signatures, hashes & DAG. ✓ Server record/reference rules. ${message} Claims are not settlement.`;
}
async function demo() {
  const token = begin();
  try {
    const response = await fetch("/api/open/demo");
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    await load(data, token);
  } catch (e) {
    fail(e, token);
  }
}
for (const action of ["import", "merge"])
  $(action).addEventListener("change", async () => {
    const file = $(action).files[0];
    if (!file) return;
    const prior = bundle;
    const token = begin();
    try {
      if (file.size > MAX) throw Error("Bundle exceeds 2 MiB limit");
      const candidate = JSON.parse(await file.text());
      if (token !== generation) return;
      if (action === "merge") {
        if (!prior) throw Error("Load a graph before merging");
        await verifyOpenCrypto(candidate);
        const result = await post("/api/open/merge", {
          bundles: [prior, candidate],
        });
        await load(
          result.bundle,
          token,
          `Merged ${prior.records.length} + ${candidate.records.length} records into ${result.bundle.records.length} unique records.`,
        );
      } else await load(candidate, token);
    } catch (e) {
      fail(e, token);
    } finally {
      $(action).value = "";
    }
  });
$("reset").addEventListener("click", demo);
$("export").addEventListener("click", () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const a = el("a");
  a.href = url;
  a.download = "koinos-open-graph.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
for (const b of document.querySelectorAll("[data-view]"))
  b.addEventListener("click", () => {
    for (const n of document.querySelectorAll("[data-view]")) {
      const active = n === b;
      n.setAttribute("aria-pressed", String(active));
      $(n.dataset.view).hidden = !active;
    }
  });
function fill(select, items, label, empty) {
  const old = select.value;
  select.replaceChildren();
  if (empty) {
    const o = add(select, "option", empty);
    o.value = "";
  }
  for (const item of items) {
    const o = add(select, "option", label(item));
    o.value = item.id;
  }
  if ([...select.options].some((o) => o.value === old)) select.value = old;
}
function render() {
  $("verified").hidden = false;
  $("export").disabled = false;
  $("record-count").textContent = state.count;
  fill($("profile"), state.profiles, (p) => p.name, "All opportunities");
  for (const id of ["credit-project", "claim-project"])
    fill(
      $(id),
      state.projects,
      (p) => p.title,
      id === "credit-project" ? "All projects" : null,
    );
  fill(
    $("receipt-kind"),
    [...new Set(bundle.records.map((r) => r.kind))].map((id) => ({ id })),
    (p) => p.id,
    "All kinds",
  );
  $("profiles").replaceChildren();
  for (const p of state.profiles) {
    const c = card($("profiles"), p.name, p.role);
    add(c, "p", p.statement);
    add(c, "p", "Skills · " + p.skills.join(", "));
    add(c, "p", "Needs · " + p.needs.join(", "));
    ref(c, p.actor, "Self-declared key");
  }
  $("project-list").replaceChildren();
  for (const p of state.projects) {
    const c = card(
      $("project-list"),
      p.title,
      p.source ? "specialized branch" : "source / independent",
    );
    if (p.source)
      add(
        c,
        "p",
        "Builds on " +
          (state.projects.find((x) => x.id === p.source)?.title || p.source),
      );
    add(c, "p", p.policy);
    link(c, p.terms);
    ref(c, p.id, "Project");
    const team = add(c, "div", undefined, "team");
    const actors = new Set([
      p.actor,
      ...state.contributions
        .filter((x) => x.project === p.id)
        .flatMap((x) => [x.actor, ...x.credit.map((c) => c.actor)]),
      ...state.reviews.filter((x) => x.project === p.id).map((x) => x.actor),
    ]);
    for (const actor of actors) add(team, "span", name(actor));
    add(
      c,
      "p",
      "Team shown from recorded activity, not a membership gate.",
      "muted",
    );
  }
  references();
  opportunities();
  claims();
  receipts();
}
let matchGeneration = 0;
async function opportunities() {
  const token = ++matchGeneration;
  $("opportunities").replaceChildren();
  let matches = [];
  try {
    if ($("profile").value)
      matches = (
        await post("/api/open/match", { bundle, profile: $("profile").value })
      ).matches;
    if (token !== matchGeneration) return;
    for (const o of state.opportunities) {
      const c = card($("opportunities"), o.title, "open opportunity");
      add(c, "p", o.problem);
      add(c, "p", "Seeking · " + o.seeks.join(", "));
      add(c, "p", "Offering · " + o.offers.join(", "));
      add(c, "p", "Criteria · " + o.criteria);
      const m = matches.find((x) => x.opportunity === o.id);
      if (m) {
        add(c, "p", m.explanation, "rule");
        add(
          c,
          "p",
          "Skills: " +
            (m.matchedSkills.join(", ") || "no overlap") +
            " · Needs: " +
            (m.matchedNeeds.join(", ") || "no overlap"),
          "muted",
        );
      }
      link(c, o.terms);
    }
  } catch (e) {
    if (token === matchGeneration)
      add($("opportunities"), "p", "Match unavailable: " + e.message);
  }
}
$("profile").addEventListener("change", opportunities);
function claims() {
  const project = $("credit-project").value;
  const list = state.contributions.filter(
    (c) => !project || c.project === project,
  );
  $("claims").replaceChildren();
  for (const c of list) {
    const n = card($("claims"), c.title, c.creditStatus);
    add(n, "p", "Claimed by " + name(c.actor));
    link(n, c.evidence);
    ref(n, c.id);
    add(
      n,
      "p",
      "Proposed credit allocation (not minted ownership): " +
        c.credit.map((x) => `${name(x.actor)} ${x.weight / 100}%`).join(" · "),
    );
    add(
      n,
      "p",
      `${c.independentReviewCount} independent review(s). No automatic acceptance.`,
      "muted",
    );
    for (const r of c.reviews) {
      const box = add(n, "div", undefined, "rule");
      add(box, "span", r.decision, "tag " + r.decision);
      add(
        box,
        "p",
        `${name(r.actor)} · ${r.reviewerType === "model" ? `model ${r.model?.name} / ${r.model?.version}` : "human judgment"}${r.actor === c.actor ? " · SELF REVIEW" : ""}`,
      );
      add(box, "p", r.rationale);
      ref(box, r.criteriaDigest, "Criteria digest");
    }
    for (const d of c.disputes) add(n, "p", "Dispute · " + d.reason, "rule");
    if (
      c.settlementVerified === false &&
      c.creditStatus === "settlement-reference"
    )
      add(
        n,
        "p",
        "Settlement reference only — not checked against a chain.",
        "rule",
      );
  }
  if (!list.length) add($("claims"), "p", "No claims in this project yet.");
  graph(list);
}
$("credit-project").addEventListener("change", claims);
function references() {
  fill(
    $("claim-reference"),
    state.contributions.filter((c) => c.project === $("claim-project").value),
    (c) => c.title,
    "No cited prior claim",
  );
}
$("claim-project").addEventListener("change", references);
function graph(list) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute(
    "viewBox",
    `0 0 1000 ${Math.max(110, list.length * 76 + 24)}`,
  );
  svg.setAttribute("width", "1000");
  svg.setAttribute("height", String(Math.max(110, list.length * 76 + 24)));
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    "Contribution references: " +
      list
        .map(
          (c) => c.title + " cites " + c.references.length + " earlier claims",
        )
        .join("; "),
  );
  const defs = document.createElementNS(ns, "defs");
  const marker = document.createElementNS(ns, "marker");
  for (const [k, v] of Object.entries({
    id: "credit-arrow",
    viewBox: "0 0 10 10",
    refX: 9,
    refY: 5,
    markerWidth: 6,
    markerHeight: 6,
    orient: "auto-start-reverse",
  }))
    marker.setAttribute(k, v);
  const arrow = document.createElementNS(ns, "path");
  arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  arrow.setAttribute("fill", "#77906d");
  marker.append(arrow);
  defs.append(marker);
  svg.append(defs);
  const positions = new Map(
    list.map((c, i) => [c.id, { x: 30 + (i % 2) * 420, y: 25 + i * 76 }]),
  );
  for (const c of list) {
    const p = positions.get(c.id);
    for (const id of c.references) {
      const target = positions.get(id);
      if (target) {
        const line = document.createElementNS(ns, "path");
        line.setAttribute(
          "d",
          `M${p.x + 175},${p.y} L${target.x + 175},${target.y + 40}`,
        );
        line.setAttribute("class", "link");
        line.setAttribute("marker-end", "url(#credit-arrow)");
        svg.append(line);
      }
    }
  }
  for (const c of list) {
    const p = positions.get(c.id);
    const rect = document.createElementNS(ns, "rect");
    for (const [k, v] of Object.entries({
      x: p.x,
      y: p.y,
      width: 350,
      height: 44,
      rx: 0,
      class: "graph-node",
    }))
      rect.setAttribute(k, v);
    svg.append(rect);
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", p.x + 12);
    text.setAttribute("y", p.y + 27);
    text.setAttribute("class", "graph-label");
    text.textContent =
      c.title.length > 43 ? c.title.slice(0, 40) + "…" : c.title;
    svg.append(text);
  }
  $("graph").replaceChildren(svg);
}
function receipts() {
  $("receipt-list").replaceChildren();
  $("heads").textContent = "Graph heads / " + state.heads.join(" · ");
  for (const r of bundle.records.filter(
    (r) => !$("receipt-kind").value || r.kind === $("receipt-kind").value,
  )) {
    const d = add($("receipt-list"), "details");
    add(d, "summary", `${r.kind} · ${name(r.actor)} · ${r.id.slice(0, 12)}`);
    add(d, "pre", JSON.stringify(r, null, 2));
  }
}
$("receipt-kind").addEventListener("change", receipts);
$("claim-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!bundle) return;
  const current = bundle;
  const project = $("claim-project").value;
  const title = $("claim-title").value;
  const displayName = $("claim-name").value;
  const evidence = $("claim-evidence").value;
  const cited = $("claim-reference").value;
  const uri = $("claim-uri").value;
  const token = begin();
  try {
    const u = new URL(uri);
    if (!["https:", "http:"].includes(u.protocol))
      throw Error("Use an HTTP(S) evidence reference");
    sessionKey ??= await crypto.subtle.generateKey("Ed25519", false, [
      "sign",
      "verify",
    ]);
    let records = [...current.records];
    const actor =
      "koinos:ed25519:" +
      encode64(
        new Uint8Array(
          await crypto.subtle.exportKey("raw", sessionKey.publicKey),
        ),
      );
    if (
      !records.some((r) => r.kind === "profile.published" && r.actor === actor)
    ) {
      const profile = await signOpen(records, sessionKey, "profile.published", {
        name: displayName + " (sandbox)",
        skills: ["accessibility"],
        needs: ["collaboration"],
        role: "builder",
        statement:
          "Fictional browser-session participant. No verified identity or real consent.",
      });
      records.push(profile);
    }
    const raw = new TextEncoder().encode(evidence);
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", raw)),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
    records.push(
      await signOpen(records, sessionKey, "contribution.claimed", {
        project,
        title,
        evidence: { uri, digest },
        references: cited ? [cited] : [],
        credit: [{ actor, weight: 10000 }],
      }),
    );
    await load(
      { format: "koinos-open/0.2", records },
      token,
      "Signed fictional claim added.",
    );
    if (token === generation)
      $("claim-status").textContent =
        "Signed with your ephemeral session key. Proposed credit only.";
  } catch (e) {
    fail(e, token);
  }
});
function economics() {
  try {
    const result = simulate(
      Object.fromEntries(
        ["supply", "rate", "awards", "revenue", "fee"].map((id) => [
          id,
          $(id).value,
        ]),
      ),
    );
    const sourceResult = simulate({
      supply: $("source-supply").value,
      rate: $("rate").value,
      awards: $("source-awards").value,
      revenue: String(result.source),
      fee: "0",
    });
    const n = $("simulation");
    n.replaceChildren();
    const stats = add(n, "div", undefined, "stat-grid");
    for (const [label, value] of [
      ["Final supply", result.total],
      ["Cumulative new earned units", result.minted],
      ["Fee to source holders", result.source],
      ["Branch distributable units", result.branch],
      [
        "Original holders share",
        `${result.originalBps / 100n}.${String(result.originalBps % 100n).padStart(2, "0")}%`,
      ],
      ["Retained rounding units", result.remainder],
    ]) {
      const s = add(stats, "div", undefined, "stat");
      add(s, "strong", String(value));
      add(s, "span", label);
    }
    const bar = add(n, "div", undefined, "bar");
    const portion = add(bar, "div");
    portion.style.width = String(result.originalBps / 100n) + "%";
    add(
      n,
      "p",
      "Original holders dilute with every award. All percentages shown are truncated to two decimals. Source-holder distribution is a separate ledger.",
      "muted",
    );
    add(n, "h3", "Projected branch cap table");
    const cap = add(n, "table");
    const caphead = add(cap, "tr");
    for (const t of ["Cohort", "Token units", "Earned credit"])
      add(caphead, "th", t);
    for (const row of [
      [
        "Original holders",
        String(result.initial),
        "Initial allocation; not inferred earned credit",
      ],
      [
        "New award recipients",
        String(result.minted),
        String(result.minted) + " cumulative units",
      ],
    ]) {
      const tr = add(cap, "tr");
      for (const v of row) add(tr, "td", v);
    }
    add(
      n,
      "p",
      "Transfers are not simulated: the same units remain with each cohort. Real earned credit would stay attributed after an ownership transfer.",
      "muted",
    );
    add(n, "h3", "Separate source cap table");
    const sourceTable = add(n, "table");
    const sourceHead = add(sourceTable, "tr");
    for (const t of ["Source cohort", "Token units", "Source revenue units"])
      add(sourceHead, "th", t);
    for (const row of [
      [
        "Original source holders",
        String(sourceResult.initial),
        String(sourceResult.originalPayout),
      ],
      [
        "New source contributors",
        String(sourceResult.minted),
        String(sourceResult.newPayout),
      ],
    ]) {
      const tr = add(sourceTable, "tr");
      for (const v of row) add(tr, "td", v);
    }
    add(
      n,
      "p",
      `Source token supply after its own awards: ${sourceResult.total}. Source cumulative newly earned units: ${sourceResult.minted}. Retained source rounding units: ${sourceResult.remainder}. Separate from branch ownership; the same person can hold both. The source fee floors to whole units; its fractional remainder stays with the branch.`,
      "muted",
    );
    add(n, "h3", "Branch award-by-award dilution");
    const wrap = add(n, "div", undefined, "table-wrap");
    const table = add(wrap, "table");
    const head = add(table, "thead");
    const tr = add(head, "tr");
    for (const t of ["Award", "New earned / minted", "Total supply"])
      add(tr, "th", t);
    const body = add(table, "tbody");
    for (const row of result.rows) {
      const r = add(body, "tr");
      for (const v of [row.award, row.mint, row.total]) add(r, "td", String(v));
    }
    add(
      n,
      "p",
      `Branch revenue projection: original holders ${result.originalPayout}; new award recipients ${result.newPayout}; retained integer remainder ${result.remainder}. Each award is ceil(S × rate / (10000 − rate)); rounding can exceed the target fraction. This is aggregate arithmetic, not per-holder accrual or contract execution.`,
      "muted",
    );
  } catch (e) {
    $("simulation").replaceChildren(el("p", e.message));
  }
}
$("simulator").addEventListener("submit", (e) => {
  e.preventDefault();
  economics();
});
economics();
$("report-load").addEventListener("click", async () => {
  $("report").textContent = "Loading local execution report…";
  try {
    const response = await fetch("/api/open/evm-report");
    const r = await response.json();
    if (!response.ok) throw Error(r.error);
    if (r.execution !== "local-evm" || r.liveNetwork !== false)
      throw Error("Unexpected report provenance");
    $("report").replaceChildren();
    const c = card($("report"), "Executed on a local EVM", "local execution");
    add(
      c,
      "p",
      `Chain ${r.chainId} · ${r.transactions.length} recorded transactions · not live funds`,
    );
    for (const check of r.checks)
      add(c, "p", `${check.passed ? "✓" : "✕"} ${check.name}`);
    for (const limitation of r.limitations) add(c, "p", limitation, "muted");
    if (r.openGraph?.payload) {
      const bridge = card(
        c,
        "Exact graph → local execution binding",
        "historical local evidence",
      );
      const payload = r.openGraph.payload;
      for (const [label, value] of [
        ["Signed intent", r.openGraph.intent],
        ["Work / contribution", payload.workId],
        ["Evidence", payload.evidenceHash],
        ["Criteria", payload.criteriaHash],
        ["Immutable terms", payload.termsHash],
        ["Principal", payload.principal],
        ["Project contract", payload.contract],
      ])
        ref(bridge, value, label);
      for (const [i, address] of payload.recipients.entries())
        add(
          bridge,
          "p",
          `Recipient ${address} · ${payload.weights[i]} basis points`,
        );
      add(
        bridge,
        "p",
        "These are bindings in a historical locally executed report. Graph references alone are not live-chain verification.",
        "muted",
      );
      const button = add(bridge, "button", "Inspect executed graph →");
      button.addEventListener("click", async () => {
        const token = begin();
        try {
          const response = await fetch("/api/open/evm-graph");
          const graph = await response.json();
          if (!response.ok) throw Error(graph.error);
          const intent = graph.records.find((x) => x.id === r.openGraph.intent);
          const contribution = graph.records.find(
            (x) => x.id === r.openGraph.contribution,
          );
          if (
            !intent ||
            intent.kind !== "settlement.intent" ||
            !contribution ||
            intent.body.contribution !== contribution.id ||
            "0x" + contribution.body.evidence.digest !== payload.evidenceHash ||
            "0x" + contribution.id !== payload.workId
          )
            throw Error("Report and signed graph bindings differ");
          await load(
            graph,
            token,
            "Historical graph linked to local EVM report; settlement references remain unverified against live chains.",
          );
          if (token === generation)
            document.querySelector('[data-view="credit"]').click();
        } catch (error) {
          fail(error, token);
        }
      });
    }
    const d = add(c, "details");
    add(
      d,
      "summary",
      "Inspect public transaction receipts, balances and policy",
    );
    add(d, "pre", JSON.stringify(r, null, 2));
  } catch (e) {
    $("report").textContent = e.message;
  }
});
demo();
