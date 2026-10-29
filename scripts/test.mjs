import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const directory = fileURLToPath(new URL("../test/", import.meta.url));
const files = (await readdir(directory))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => join(directory, name));
if (!files.length) throw Error("No reference tests found");
const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
