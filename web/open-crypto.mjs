// Independent WebCrypto consumer. Does not import the Node protocol implementation.
const enc = new TextEncoder();
function canonical(value) {
  if (value === null || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "string") {
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const n = value.charCodeAt(++i);
        if (!(n >= 0xdc00 && n <= 0xdfff)) throw Error("Malformed Unicode");
      } else if (c >= 0xdc00 && c <= 0xdfff) throw Error("Malformed Unicode");
    }
    return JSON.stringify(value);
  }
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0)
  )
    return String(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => canonical(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  throw Error("Unsupported canonical value");
}
function bytes(s) {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw Error("Invalid base64url");
  const b = Uint8Array.from(
    atob(s.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  if (
    btoa(String.fromCharCode(...b))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_") !== s
  )
    throw Error("Noncanonical base64url");
  return b;
}

export { canonical };
export function encode64(raw) {
  return btoa(String.fromCharCode(...raw))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
export async function hash(value) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", enc.encode(canonical(value))),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
export async function verifyOpenCrypto(bundle) {
  if (
    bundle?.format !== "koinos-open/0.2" ||
    !Array.isArray(bundle.records) ||
    !bundle.records.length ||
    bundle.records.length > 10000
  )
    throw Error("Expected complete bounded open 0.2 bundle");
  const byId = new Map();
  for (const r of bundle.records) {
    if (
      Object.keys(r).sort().join(",") !==
      "actor,body,id,kind,parents,protocol,signature,time"
    )
      throw Error("Unexpected envelope fields");
    if (
      r.protocol !== "koinos-open/0.2" ||
      !Array.isArray(r.parents) ||
      r.parents.some(
        (p, i) => !/^[a-f0-9]{64}$/.test(p) || (i && p <= r.parents[i - 1]),
      )
    )
      throw Error("Invalid graph parents");
    if (typeof r.time !== "string" || new Date(r.time).toISOString() !== r.time)
      throw Error("Invalid timestamp");
    const { id, signature, ...unsigned } = r;
    if (id !== (await hash(unsigned))) throw Error("Hash mismatch");
    if (byId.has(id)) throw Error("Duplicate record");
    if (typeof r.actor !== "string" || !r.actor.startsWith("koinos:ed25519:"))
      throw Error("Unknown key type");
    const raw = bytes(r.actor.slice(15));
    const sig = bytes(signature);
    if (raw.length !== 32 || sig.length !== 64)
      throw Error("Invalid signature encoding");
    const key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    if (
      !(await crypto.subtle.verify(
        "Ed25519",
        key,
        sig,
        enc.encode("koinos-open/0.2\n" + id),
      ))
    )
      throw Error("Invalid signature");
    byId.set(id, r);
  }
  const seen = new Set(),
    active = new Set();
  function visit(id) {
    if (active.has(id)) throw Error("Graph cycle");
    if (seen.has(id)) return;
    const r = byId.get(id);
    if (!r) throw Error("Missing graph parent");
    active.add(id);
    for (const p of r.parents) {
      visit(p);
      if (byId.get(p).time > r.time) throw Error("Time precedes parent");
    }
    active.delete(id);
    seen.add(id);
  }
  for (const id of byId.keys()) visit(id);
  return { count: seen.size };
}
export async function signOpen(records, keyPair, kind, body) {
  const publicBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  const actor = "koinos:ed25519:" + encode64(publicBytes);
  const referenced = new Set(records.flatMap((r) => r.parents));
  const parents = records
    .filter((r) => !referenced.has(r.id))
    .map((r) => r.id)
    .sort();
  const latest = records.reduce((s, r) => (r.time > s ? r.time : s), "");
  const time = new Date(
    Math.max(Date.now(), Date.parse(latest) || 0),
  ).toISOString();
  const unsigned = {
    protocol: "koinos-open/0.2",
    actor,
    kind,
    body,
    time,
    parents,
  };
  const id = await hash(unsigned);
  const signature = encode64(
    new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        keyPair.privateKey,
        enc.encode("koinos-open/0.2\n" + id),
      ),
    ),
  );
  return { ...unsigned, id, signature };
}
