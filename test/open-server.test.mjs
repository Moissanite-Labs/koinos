import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/server.mjs";
import { createOpenDemo } from "../src/open-demo.mjs";
import { verifyOpenCrypto, signOpen } from "../web/open-crypto.mjs";
import { simulate } from "../web/open-economics.mjs";
async function run(fn) {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
test("open endpoints preserve old UI, validate signed graphs, merge idempotently and reject tampering", () =>
  run(async (url) => {
    assert.equal((await fetch(url)).status, 200);
    const page = await fetch(url + "/open");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Find your part/);
    const demo = await (await fetch(url + "/api/open/demo")).json();
    assert.doesNotMatch(JSON.stringify(demo), /PRIVATE KEY|privateKey/);
    await verifyOpenCrypto(demo);
    const post = (route, input) =>
      fetch(url + route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    assert.equal((await post("/api/open/verify", demo)).status, 200);
    const merged = await (
      await post("/api/open/merge", { bundles: [demo, demo] })
    ).json();
    assert.equal(merged.bundle.records.length, demo.records.length);
    demo.records[0].body.name = "tampered";
    assert.equal((await post("/api/open/verify", demo)).status, 400);
    assert.equal(
      (
        await fetch(url + "/api/open/demo", {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(url + "/contracts/reports/local-demo.json")).status,
      404,
    );
  }));
test("browser signer independently produces valid permissionless contribution and rejects malformed graph", () =>
  run(async (url) => {
    const bundle = createOpenDemo();
    const key = await crypto.subtle.generateKey("Ed25519", false, [
      "sign",
      "verify",
    ]);
    const record = await signOpen(bundle.records, key, "contribution.claimed", {
      project: bundle.records.find((r) => r.kind === "project.created").id,
      title: "Browser fictional claim",
      evidence: {
        uri: "https://example.invalid/proof",
        digest: "1".repeat(64),
      },
      references: [],
      credit: [
        {
          actor:
            "koinos:ed25519:" +
            Buffer.from(
              await crypto.subtle.exportKey("raw", key.publicKey),
            ).toString("base64url"),
          weight: 10000,
        },
      ],
    });
    bundle.records.push(record);
    await verifyOpenCrypto(bundle);
    const r = await fetch(url + "/api/open/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bundle),
    });
    assert.equal(r.status, 200, await r.text());
    const broken = structuredClone(bundle);
    broken.records.at(-1).body.title = "different";
    await assert.rejects(verifyOpenCrypto(broken), /Hash/);
    await assert.rejects(
      verifyOpenCrypto({
        ...bundle,
        records: [...bundle.records, bundle.records[0]],
      }),
      /Duplicate/,
    );
  }));
test("economic simulator conserves revenue, uses exact huge integer units and explicit ceiling minting", () => {
  const r = simulate({
    supply: "100000000000000000000000000000",
    rate: "100",
    awards: "5",
    revenue: "99999999999999999999999999999",
    fee: "2000",
  });
  assert.equal(r.source + r.branch, 99999999999999999999999999999n);
  assert.equal(r.originalPayout + r.newPayout + r.remainder, r.branch);
  assert.equal(r.initial + r.minted, r.total);
  for (let i = 0; i < r.rows.length; i++) {
    const prior = i ? r.rows[i - 1].total : r.initial;
    assert.ok(r.rows[i].mint * 9900n >= prior * 100n);
    assert.ok((r.rows[i].mint - 1n) * 9900n < prior * 100n);
  }
  assert.throws(() =>
    simulate({
      supply: "1e6",
      rate: "100",
      awards: "5",
      revenue: "1",
      fee: "1",
    }),
  );
  assert.throws(() =>
    simulate({
      supply: "1",
      rate: "10000",
      awards: "5",
      revenue: "1",
      fee: "1",
    }),
  );
});
test("open mutation endpoints require JSON, bound input, reject malformed merge and untrusted origin", () =>
  run(async (url) => {
    assert.equal(
      (await fetch(url + "/api/open/merge", { method: "POST", body: "{}" }))
        .status,
      415,
    );
    assert.equal(
      (
        await fetch(url + "/api/open/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bundles: [] }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(url + "/api/open/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: " ".repeat(2 * 1024 * 1024 + 1),
        })
      ).status,
      413,
    );
    assert.equal(
      (
        await fetch(url + "/api/open/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "null" },
          body: "{}",
        })
      ).status,
      403,
    );
  }));

test("executed graph endpoint returns only allowlisted independently signed public evidence", () =>
  run(async (url) => {
    const response = await fetch(url + "/api/open/evm-graph");
    assert.equal(response.status, 200);
    const graph = await response.json();
    await verifyOpenCrypto(graph);
    assert.doesNotMatch(JSON.stringify(graph), /PRIVATE KEY|privateKey/);
    assert.ok(graph.records.some((r) => r.kind === "settlement.intent"));
    const report = await (await fetch(url + "/api/open/evm-report")).json();
    assert.equal(report.execution, "local-evm");
    assert.equal(report.liveNetwork, false);
    assert.ok(graph.records.some((r) => r.id === report.openGraph.intent));
    assert.equal(
      (
        await fetch(url + "/api/open/evm-graph", {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(url + "/contracts/reports/open-demo.json")).status,
      404,
    );
  }));
