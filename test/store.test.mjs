import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, open, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDemo } from "../src/demo.mjs";
import { createBundle } from "../src/protocol.mjs";
import { importBundle, loadBundle, readJsonFile } from "../src/store.mjs";

test("store imports idempotently, extends, preserves history on shortening and forks, and honors lock", async () => {
  const dir = await mkdtemp(join(tmpdir(), "koinos-store-"));
  try {
    const path = join(dir, "project.json"),
      { bundle } = createDemo();
    await importBundle(path, createBundle(bundle.records.slice(0, 2)));
    await importBundle(path, bundle);
    await importBundle(path, bundle);
    const before = await readFile(path, "utf8");
    await assert.rejects(
      importBundle(path, createBundle(bundle.records.slice(0, 1))),
      /shorten/,
    );
    await assert.rejects(importBundle(path, createDemo().bundle), /conflict/);
    assert.equal(await readFile(path, "utf8"), before);
    const lock = await open(`${path}.lock`, "wx");
    await assert.rejects(importBundle(path, bundle), /locked/);
    await lock.close();
    assert.deepEqual(await loadBundle(path), bundle);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("concurrent store writers cannot silently replace one another", async () => {
  const dir = await mkdtemp(join(tmpdir(), "koinos-race-"));
  try {
    const path = join(dir, "project.json");
    const candidates = [createDemo().bundle, createDemo().bundle];
    const outcomes = await Promise.allSettled(
      candidates.map((bundle) => importBundle(path, bundle)),
    );
    assert.equal(
      outcomes.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      outcomes.filter((result) => result.status === "rejected").length,
      1,
    );
    const persisted = await loadBundle(path);
    const winner = outcomes.findIndex(
      (result) => result.status === "fulfilled",
    );
    assert.deepEqual(persisted, candidates[winner]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("JSON ingress rejects duplicate decoded keys, malformed UTF-8 and oversized input", async () => {
  const dir = await mkdtemp(join(tmpdir(), "koinos-json-"));
  try {
    const path = join(dir, "input.json");
    for (const source of [
      '{"a":1,"a":2}',
      '{"a":1,"\\u0061":2}',
      '{"nested":[{"a":1,"a":2}]}',
    ]) {
      await writeFile(path, source);
      await assert.rejects(readJsonFile(path), /Duplicate/);
    }
    await writeFile(
      path,
      '{"a":[{"same":1},{"same":2}],"string":"a,{}[]: value"}',
    );
    assert.deepEqual(await readJsonFile(path), {
      a: [{ same: 1 }, { same: 2 }],
      string: "a,{}[]: value",
    });
    await writeFile(path, Buffer.from([34, 0xff, 34]));
    await assert.rejects(readJsonFile(path), /encoded data/);
    const file = await open(path, "w");
    await file.truncate(16 * 1024 * 1024 + 1);
    await file.close();
    await assert.rejects(readJsonFile(path), /byte limit/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("JSON ingress rejects truncated syntax and padded source beyond its limit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "koinos-padding-"));
  try {
    const path = join(dir, "input.json");
    await writeFile(path, '{"records":[');
    await assert.rejects(readJsonFile(path), SyntaxError);
    await writeFile(path, " ".repeat(16 * 1024 * 1024) + "{}");
    await assert.rejects(readJsonFile(path), /byte limit/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("store rejects accessor input before cloning without executing getters", async () => {
  const dir = await mkdtemp(join(tmpdir(), "koinos-accessor-"));
  try {
    const { bundle } = createDemo();
    let getterCalls = 0;
    Object.defineProperty(bundle.records[0].body, "title", {
      enumerable: true,
      get() {
        getterCalls++;
        return "Hidden replacement";
      },
    });
    await assert.rejects(
      importBundle(join(dir, "project.json"), bundle),
      /data properties/,
    );
    assert.equal(getterCalls, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
