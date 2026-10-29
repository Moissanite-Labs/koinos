import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { generateIdentity } from "../src/protocol.mjs";
import { createOpenDemo } from "../src/open-demo.mjs";
import {
  createOpenRecord,
  createOpenBundle,
  verifyOpenBundle,
} from "../src/open-protocol.mjs";
import {
  mergeOpenFile,
  loadOpenBundle,
  appendOpenFile,
} from "../src/open-store.mjs";

const cli = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));
const run = (...args) =>
  spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
const profile = (name) => ({
  name,
  skills: ["building"],
  needs: ["market"],
  role: "builder",
  statement: "Fictional test profile",
});

test("open file merges concurrent work without replacing records and preserves failed writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "koinos-open-store-"));
  try {
    const path = join(dir, "store.json"),
      demo = createOpenDemo();
    await mergeOpenFile(path, demo);
    const alice = generateIdentity(),
      bob = generateIdentity();
    const a = createOpenBundle([
      ...demo.records,
      createOpenRecord({
        records: demo.records,
        identity: alice,
        kind: "profile.published",
        body: profile("Alice"),
      }),
    ]);
    const b = createOpenBundle([
      ...demo.records,
      createOpenRecord({
        records: demo.records,
        identity: bob,
        kind: "profile.published",
        body: profile("Bob"),
      }),
    ]);
    await mergeOpenFile(path, a, b);
    const merged = await loadOpenBundle(path);
    assert.equal(merged.records.length, demo.records.length + 2);
    assert.equal(verifyOpenBundle(merged).heads.length, 2);
    await mergeOpenFile(path, demo); // Old views cannot delete observed work.
    assert.deepEqual(await loadOpenBundle(path), merged);
    const before = await readFile(path, "utf8");
    await assert.rejects(
      appendOpenFile(path, { identity: alice, kind: "unknown", body: {} }),
    );
    assert.equal(await readFile(path, "utf8"), before);
    await writeFile(path + ".lock", "cooperating writer");
    await assert.rejects(mergeOpenFile(path, a), /locked/);
    assert.equal(await readFile(path, "utf8"), before);
    await rm(path + ".lock");
    await writeFile(path, "corrupt");
    await assert.rejects(mergeOpenFile(path, a));
    assert.equal(await readFile(path, "utf8"), "corrupt");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("open CLI verifies, authors, merges, matches and exports only opted-in feedback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "koinos-open-cli-"));
  try {
    const demo = join(dir, "demo.json"),
      store = join(dir, "store.json"),
      feedback = join(dir, "feedback.json");
    const created = run("open", "demo", demo);
    assert.equal(created.status, 0, created.stderr);
    const verified = run("open", "verify", demo);
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(JSON.parse(verified.stdout).settlementVerified, false);
    assert.equal(run("open", "merge", store, demo).status, 0);
    const state = JSON.parse(run("open", "inspect", store).stdout);
    const matches = run("open", "match", store, state.profiles[0].id);
    assert.equal(matches.status, 0, matches.stderr);
    assert.ok(Array.isArray(JSON.parse(matches.stdout)));
    const exported = run("open", "feedback", store, "evaluation", feedback);
    assert.equal(exported.status, 0, exported.stderr);
    const data = JSON.parse(await readFile(feedback, "utf8"));
    assert.ok(data.feedback.length > 0);
    assert.doesNotMatch(
      JSON.stringify(data),
      /https?:|PRIVATE KEY|koinos:ed25519:/,
    );
    assert.equal(
      run("open", "feedback", store, "evaluation", feedback).status,
      1,
    );
    const key = join(dir, "key.pem"),
      body = join(dir, "profile.json");
    assert.equal(run("keygen", key).status, 0);
    await writeFile(body, JSON.stringify(profile("CLI contributor")));
    const added = run("open", "append", store, key, "profile.published", body);
    assert.equal(added.status, 0, added.stderr);
    assert.equal(JSON.parse(added.stdout).count, state.count + 1);
    const invalid = join(dir, "invalid.json");
    await writeFile(invalid, "{}");
    assert.equal(run("open", "verify", invalid).status, 1);
    assert.equal(run("open", "plan", store, "0".repeat(64)).status, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
