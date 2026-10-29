import { verifyCryptography } from "./verify.mjs";
const $ = (id) => document.getElementById(id);
let bundle, state;
let generation = 0;
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
const name = (id) => state.participants.find((p) => p.id === id)?.name || id;
function key(parent, label, id) {
  add(parent, "p", label);
  add(parent, "div", id || "None", "key");
}
function card(parent, title, status) {
  const n = add(parent, "article", undefined, "card");
  if (status) add(n, "span", status, "tag");
  add(n, "h4", title);
  return n;
}
function reference(parent, artifact) {
  const p = add(parent, "p");
  try {
    const u = new URL(artifact.uri);
    if (["https:", "http:"].includes(u.protocol)) {
      const a = add(p, "a", artifact.uri);
      a.href = u.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } else p.textContent = artifact.uri;
  } catch {
    p.textContent = artifact.uri;
  }
  add(parent, "p", "SHA-256 · " + artifact.digest, "key");
}
function begin() {
  const token = ++generation;
  $("error").hidden = true;
  $("workspace").hidden = true;
  $("export").disabled = true;
  return token;
}
async function load(candidate, token) {
  if (token !== generation) return;
  $("error").hidden = true;
  $("workspace").hidden = true;
  $("export").disabled = true;
  $("verification").textContent = "Checking signatures and project rules…";
  try {
    const cryptoResult = await verifyCryptography(candidate);
    const response = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error);
    if (token !== generation) return;
    bundle = candidate;
    state = result.state;
    $("verification").textContent =
      `✓ Browser: ${cryptoResult.count} hashes, signatures & chain verified. ✓ Server: authority, consent & lifecycle rules verified. No trusted identity or current-head guarantee.`;
    render();
  } catch (e) {
    if (token !== generation) return;
    $("error").textContent = "Bundle rejected: " + e.message;
    $("error").hidden = false;
    $("verification").textContent =
      "Verification failed. No project state displayed.";
  }
}
function render() {
  $("workspace").hidden = false;
  $("export").disabled = false;
  $("title").textContent = state.project.title;
  $("project-id").textContent = state.project.id;
  $("description").textContent = state.project.description;
  $("count").textContent = state.count;
  for (const id of [
    "participants",
    "agreements-list",
    "delegations",
    "contribution-list",
  ])
    $(id).replaceChildren();
  for (const p of state.participants) {
    const c = card($("participants"), p.name, p.kind);
    add(
      c,
      "p",
      p.id === state.project.steward
        ? "Project steward"
        : p.kind === "agent"
          ? "Acts only within an explicit grant"
          : "Independent participant",
    );
    add(c, "div", p.id, "key");
  }
  for (const a of state.agreements) {
    const c = card(
      $("agreements-list"),
      a.title,
      `${a.consents.length}/${a.parties.length} parties consent`,
    );
    reference(c, a);
    for (const p of a.parties)
      add(
        c,
        "p",
        `${a.consents.includes(p) ? "✓ Consented" : "○ No current consent"} · ${name(p)}`,
      );
    key(c, "Exact agreement record", a.id);
  }
  for (const d of state.delegations) {
    const c = card(
      $("delegations"),
      `${name(d.principal)} → ${name(d.agent)}`,
      d.revoked ? "Revoked" : "Granted",
    );
    add(c, "p", "Scope: " + d.scope.join(", "));
    add(c, "p", "Expires: " + d.expires);
    key(c, "Grant record", d.id);
    key(c, "Agreement", d.agreement);
  }
  for (const c of state.contributions) {
    const n = card(
      $("contribution-list"),
      c.title,
      c.status.replaceAll("_", " "),
    );
    add(n, "p", c.summary);
    add(
      n,
      "p",
      `Submitted by ${name(c.actor)} · Principal: ${name(c.principal)}`,
    );
    reference(n, c.artifact);
    key(n, "Agreement", c.agreement);
    key(n, "Delegation", c.delegation);
    for (const r of c.reviews) {
      add(n, "p", `${name(r.actor)} · ${r.decision.replaceAll("_", " ")}`);
      add(n, "p", r.note);
    }
    if (c.acceptance)
      key(
        n,
        `Accepted by ${name(c.acceptance.actor)} using review`,
        c.acceptance.review,
      );
    if (c.dispute)
      add(n, "p", `Disputed by ${name(c.dispute.actor)}: ${c.dispute.reason}`);
  }
  for (const id of ["agreements-list", "delegations", "contribution-list"])
    if (!$(id).children.length) add($(id), "p", "No records at this stage.");
  const old = $("filter").value;
  $("filter").replaceChildren(el("option", "All records"));
  $("filter").firstChild.value = "";
  for (const kind of new Set(bundle.records.map((r) => r.kind))) {
    const o = el("option", kind);
    o.value = kind;
    $("filter").append(o);
  }
  $("filter").value = old;
  ledger();
}
function ledger() {
  $("ledger").replaceChildren();
  for (const r of bundle.records.filter(
    (r) => !$("filter").value || r.kind === $("filter").value,
  )) {
    const d = add($("ledger"), "details");
    add(
      d,
      "summary",
      `${String(r.sequence).padStart(2, "0")} / ${r.kind} · ${name(r.actor)} · ${r.time}`,
    );
    add(d, "pre", JSON.stringify(r, null, 2));
  }
}
async function demo() {
  const token = begin();
  $("verification").textContent = "Loading demonstration…";
  try {
    const response = await fetch(
      "/api/demo?stage=" + encodeURIComponent($("stage").value),
    );
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    await load(data, token);
  } catch (e) {
    if (token !== generation) return;
    $("verification").textContent = "Demonstration unavailable.";
    $("error").hidden = false;
    $("error").textContent = e.message;
  }
}
$("demo").addEventListener("click", demo);
$("filter").addEventListener("change", ledger);
$("file").addEventListener("change", async () => {
  const file = $("file").files[0];
  if (!file) return;
  const token = begin();
  if (file.size > 2 * 1024 * 1024) {
    $("workspace").hidden = true;
    $("export").disabled = true;
    $("verification").textContent = "Import rejected.";
    $("error").hidden = false;
    $("error").textContent = "Import exceeds 2 MiB.";
    return;
  }
  try {
    await load(JSON.parse(await file.text()), token);
  } catch (e) {
    if (token !== generation) return;
    $("workspace").hidden = true;
    $("export").disabled = true;
    $("verification").textContent = "Import rejected.";
    $("error").hidden = false;
    $("error").textContent = "Invalid JSON: " + e.message;
  }
});
$("export").addEventListener("click", () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const a = el("a");
  a.href = url;
  a.download = "koinos-" + state.project.id + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
for (const button of document.querySelectorAll("[data-tab]"))
  button.addEventListener("click", () => {
    for (const b of document.querySelectorAll("[data-tab]")) {
      const active = b === button;
      b.setAttribute("aria-selected", String(active));
      $(b.dataset.tab).hidden = !active;
    }
  });
demo();
