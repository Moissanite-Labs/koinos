import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  rm,
  stat,
  readFile,
  writeFile,
  symlink,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const cli = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));
const run = (...args) =>
  spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
test("CLI creates protected non-overwriting keys and portable verified demo exports", async () => {
  const dir = await mkdtemp(join(tmpdir(), "koinos-cli-"));
  try {
    const key = join(dir, "identity.pem"),
      bundle = join(dir, "demo.json"),
      store = join(dir, "store.json");
    const generated = run("keygen", key);
    assert.equal(generated.status, 0, generated.stderr);
    if (process.platform !== "win32") {
      assert.equal((await stat(key)).mode & 0o777, 0o600);
    }
    assert.doesNotMatch(generated.stdout, /PRIVATE KEY/);
    const id = JSON.parse(generated.stdout).id;
    const authored = join(dir, "authored.json"),
      body = join(dir, "body.json");
    await writeFile(
      body,
      JSON.stringify({
        title: "CLI trial",
        description: "Authored from body files",
        participants: [{ id, name: "Author", kind: "human" }],
      }),
    );
    const created = run("create", authored, key, body);
    assert.equal(created.status, 0, created.stderr);
    assert.equal(run("create", authored, key, body).status, 1);
    await writeFile(
      body,
      JSON.stringify({
        title: "Terms",
        uri: "https://example.invalid/terms",
        digest: "a".repeat(64),
        parties: [id],
      }),
    );
    const appended = run("append", authored, key, "agreement.proposed", body);
    assert.equal(appended.status, 0, appended.stderr);
    assert.equal(JSON.parse(appended.stdout).count, 2);
    assert.equal(
      JSON.parse(run("inspect", authored).stdout).agreements.length,
      1,
    );
    const before = await readFile(key, "utf8");
    assert.equal(run("keygen", key).status, 1);
    assert.equal(await readFile(key, "utf8"), before);
    assert.equal(run("demo", bundle).status, 0);
    assert.equal(run("import", store, bundle).status, 0);
    const pin = JSON.parse(run("pin", store).stdout);
    assert.equal(run("verify", store, pin.head, pin.project).status, 0);
    assert.equal(run("verify", store, "0".repeat(64)).status, 1);
    assert.doesNotMatch(await readFile(bundle, "utf8"), /PRIVATE KEY/);
    assert.equal(run("export", store, bundle).status, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI runs through symlinked directories and bin links with observable success and failure", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "koinos-cli-links-"));
  try {
    const linked = join(dir, "package"),
      bin = join(dir, "bin");
    await mkdir(bin);
    await symlink(
      dirname(dirname(cli)),
      linked,
      process.platform === "win32" ? "junction" : "dir",
    );
    const binCli = join(bin, "koinos.mjs");
    let binAvailable = true;
    try {
      await symlink(cli, binCli, "file");
    } catch (error) {
      if (process.platform !== "win32" || error.code !== "EPERM") throw error;
      binAvailable = false;
      t.diagnostic(
        "Windows denied file symlink creation; bin-link variant skipped, junction variants remain covered.",
      );
    }
    const valid = join(dir, "valid.json"),
      invalid = join(dir, "invalid.json");
    assert.equal(run("demo", valid).status, 0);
    await writeFile(invalid, "{}");
    const variants = [
      [join(linked, "src/cli.mjs")],
      ["--preserve-symlinks-main", join(linked, "src/cli.mjs")],
      ...(binAvailable ? [[binCli]] : []),
    ];
    for (const variant of variants) {
      const success = spawnSync(
        process.execPath,
        [...variant, "verify", valid],
        { encoding: "utf8" },
      );
      assert.equal(success.status, 0, success.stderr);
      assert.equal(JSON.parse(success.stdout).valid, true);
      const failure = spawnSync(
        process.execPath,
        [...variant, "verify", invalid],
        { encoding: "utf8" },
      );
      assert.equal(failure.status, 1);
      assert.match(failure.stderr, /Error:/);
      assert.equal(failure.stdout, "");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI can be imported from stdin without executing main", () => {
  const script = `const {main} = await import(${JSON.stringify(pathToFileURL(cli).href)}); console.log(typeof main);`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: script,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "function");
  assert.equal(result.stderr, "");
});
