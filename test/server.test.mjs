import test from "node:test";
import http from "node:http";
import assert from "node:assert/strict";
import { createServer } from "../src/server.mjs";
import { createDemo } from "../src/demo.mjs";
async function run(fn) {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
test("serves bounded explicit assets with CSP; rejects arbitrary files and hostile origins", () =>
  run(async (url) => {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(
      page.headers.get("content-security-policy"),
      /frame-ancestors 'none'/,
    );
    assert.equal((await fetch(url + "/src/protocol.mjs")).status, 404);
    assert.equal(
      (
        await fetch(url + "/api/demo", {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    const hostile = await new Promise((resolve, reject) => {
      http
        .get(url, { headers: { Host: "evil.example" } }, (r) => {
          r.resume();
          resolve(r.statusCode);
        })
        .on("error", reject);
    });
    assert.equal(hostile, 403);
  }));
test("demo exposes only public bundle; server validates semantic authority", () =>
  run(async (url) => {
    const response = await fetch(url + "/api/demo");
    const bundle = await response.json();
    assert.equal(bundle.format, "koinos-bundle/0.1");
    assert.doesNotMatch(JSON.stringify(bundle), /PRIVATE KEY|privateKey/);
    const post = (b) =>
      fetch(url + "/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
    assert.equal((await post(bundle)).status, 200);
    bundle.records[0].body.title = "tampered";
    assert.equal((await post(bundle)).status, 400);
  }));
test("requires JSON and limits payload size", () =>
  run(async (url) => {
    assert.equal(
      (await fetch(url + "/api/verify", { method: "POST", body: "{}" })).status,
      415,
    );
    assert.equal(
      (
        await fetch(url + "/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: " ".repeat(2 * 1024 * 1024 + 1),
        })
      ).status,
      413,
    );
  }));
test("independent WebCrypto verifier accepts and rejects altered history", async () => {
  const { verifyCryptography } = await import("../web/verify.mjs");
  const { bundle } = createDemo();
  assert.equal((await verifyCryptography(bundle)).count, bundle.records.length);
  const negativeZero = structuredClone(bundle);
  negativeZero.records[0].sequence = -0;
  await assert.rejects(
    verifyCryptography(negativeZero),
    /Unsupported canonical value/,
  );
  const changed = structuredClone(bundle);
  changed.records[1].previous = "0".repeat(64);
  await assert.rejects(verifyCryptography(changed), /chain/);
  const badSig = structuredClone(bundle);
  badSig.records.at(-1).signature = "A".repeat(86);
  await assert.rejects(verifyCryptography(badSig), /signature/);
});

test("new rejected import supersedes pending demo and verification operations", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = (
    await readFile(new URL("../web/app.mjs", import.meta.url), "utf8")
  )
    .replace(
      /import\s*\{\s*verifyCryptography\s*\}\s*from\s*['"]\.\/verify\.mjs['"];?/,
      "",
    )
    .replace(/demo\(\);\s*$/, "");
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        hidden: false,
        disabled: false,
        textContent: "",
        value: "accepted",
        files: [],
        listeners: {},
        addEventListener(event, fn) {
          this.listeners[event] = fn;
        },
      });
    return nodes.get(id);
  };
  const document = { getElementById: node, querySelectorAll: () => [] };
  let releaseDemo;
  const fetch = () =>
    new Promise((resolve) => {
      releaseDemo = () => resolve({ ok: true, json: async () => ({}) });
    });
  const api = new Function(
    "document",
    "fetch",
    "verifyCryptography",
    source + ";return {demo,load,begin};",
  )(document, fetch, async () => ({ count: 1 }));
  const pending = api.demo();
  node("file").files = [{ size: 1, text: async () => "{" }];
  await node("file").listeners.change();
  releaseDemo();
  await pending;
  assert.equal(node("workspace").hidden, true);
  assert.equal(node("export").disabled, true);
  assert.match(node("error").textContent, /Invalid JSON/);
  let releaseVerify;
  const verify = () =>
    new Promise((resolve) => (releaseVerify = () => resolve({ count: 1 })));
  const api2 = new Function(
    "document",
    "fetch",
    "verifyCryptography",
    source + ";return {load,begin};",
  )(
    document,
    async () => ({ ok: true, json: async () => ({ state: {} }) }),
    verify,
  );
  const old = api2.load({}, api2.begin());
  node("file").files = [{ size: 2 * 1024 * 1024 + 1 }];
  await node("file").listeners.change();
  releaseVerify();
  await old;
  assert.equal(node("workspace").hidden, true);
  assert.equal(node("export").disabled, true);
  assert.match(node("error").textContent, /exceeds/);
});

test("direct startup works from paths containing URL-special characters", async () => {
  const { mkdtemp, cp, rm, realpath, symlink } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawn } = await import("node:child_process");
  const dir = await realpath(await mkdtemp(join(tmpdir(), "koinos #%-")));
  try {
    await cp(new URL("../src/", import.meta.url), join(dir, "src"), {
      recursive: true,
    });
    await symlink(
      join(dir, "src"),
      join(dir, "linked-src"),
      process.platform === "win32" ? "junction" : "dir",
    );
    for (const args of [
      [join(dir, "src/server.mjs")],
      [join(dir, "linked-src/server.mjs")],
      ["--preserve-symlinks-main", join(dir, "linked-src/server.mjs")],
    ]) {
      const child = spawn(process.execPath, args, {
        env: { ...process.env, PORT: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      try {
        const output = await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(Error("Server startup timed out")),
            5000,
          );
          child.stdout.once("data", (data) => {
            clearTimeout(timer);
            resolve(String(data));
          });
          child.once("error", reject);
          child.once("exit", (code) => {
            clearTimeout(timer);
            reject(Error("Server exited " + code));
          });
        });
        assert.match(output, /Koinos workbench/);
      } finally {
        if (child.exitCode === null) {
          const closed = new Promise((r) => child.once("close", r));
          child.kill();
          await closed;
        }
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("server imports from stdin without listening or resolving dash as a file", async () => {
  const { spawnSync } = await import("node:child_process");
  const moduleURL = new URL("../src/server.mjs", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: `const {createServer} = await import(${JSON.stringify(moduleURL)}); console.log(typeof createServer);`,
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "function");
});
