import { open, rename, unlink, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { readJsonFile } from "./store.mjs";
import {
  createOpenRecord,
  createOpenBundle,
  verifyOpenBundle,
  mergeOpenBundles,
} from "./open-protocol.mjs";

export async function loadOpenBundle(path) {
  const bundle = await readJsonFile(path);
  verifyOpenBundle(bundle);
  return bundle;
}

async function edit(path, transform) {
  path = resolve(path);
  await mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST")
      throw Error(
        "Open store is locked; retry after the writer finishes. Inspect stale locks before removing them.",
      );
    throw error;
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  let file;
  try {
    let current;
    try {
      current = await loadOpenBundle(path);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const next = transform(current);
    verifyOpenBundle(next);
    file = await open(temporary, "wx", 0o600);
    await file.writeFile(JSON.stringify(next));
    await file.sync();
    await file.close();
    file = undefined;
    await rename(temporary, path);
    return next;
  } finally {
    if (file) await file.close();
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    await lock.close();
    await unlink(lockPath);
  }
}

export async function mergeOpenFile(path, ...incoming) {
  if (!incoming.length)
    throw Error("At least one incoming open bundle is required");
  for (const bundle of incoming) verifyOpenBundle(bundle);
  const copies = structuredClone(incoming);
  return edit(path, (current) =>
    mergeOpenBundles(...(current ? [current] : []), ...copies),
  );
}

export async function appendOpenFile(path, args) {
  return edit(path, (current) => {
    const records = current?.records ?? [];
    const record = createOpenRecord({ ...args, records });
    return createOpenBundle([...records, record]);
  });
}
