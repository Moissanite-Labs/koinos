import { open, rename, unlink, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  verifyBundle,
  createRecord,
  createBundle,
  LIMITS,
} from "./protocol.mjs";

// Read at most limit+1 bytes even when a file changes while being read.
export async function readTextFile(path, limit = LIMITS.bytes) {
  const file = await open(path, "r");
  try {
    const chunks = [];
    let size = 0;
    while (size <= limit) {
      const buffer = Buffer.alloc(Math.min(65536, limit + 1 - size));
      const { bytesRead } = await file.read(buffer);
      if (!bytesRead) break;
      chunks.push(buffer.subarray(0, bytesRead));
      size += bytesRead;
    }
    if (size > limit) throw new Error(`Input exceeds ${limit} byte limit`);
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } finally {
    await file.close();
  }
}
export async function readJsonFile(path) {
  const text = await readTextFile(path);
  const value = JSON.parse(text);
  // JSON.parse discards duplicate keys. Inspect original tokens before accepting it.
  const stack = [];
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/g;
  for (const match of text.matchAll(tokens)) {
    const token = match[0],
      frame = stack.at(-1);
    if (token === "{" || token === "[") {
      stack.push({
        object: token === "{",
        key: token === "{",
        keys: new Set(),
      });
      if (stack.length > LIMITS.depth + 1)
        throw new Error("JSON depth limit exceeded");
    } else if (token === "}" || token === "]") stack.pop();
    else if (token === ",") {
      if (frame?.object) frame.key = true;
    } else if (token === ":") {
      if (frame?.object) frame.key = false;
    } else if (frame?.object && frame.key && token.startsWith('"')) {
      const key = JSON.parse(token);
      if (frame.keys.has(key))
        throw new Error(`Duplicate JSON object key: ${key}`);
      frame.keys.add(key);
      frame.key = false;
    }
  }
  return value;
}
export async function loadBundle(path) {
  const bundle = await readJsonFile(path);
  verifyBundle(bundle);
  return bundle;
}
async function locked(path, action) {
  path = resolve(path);
  await mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        `Store is locked: ${path}; retry after the writer finishes. Stale locks require manual inspection.`,
      );
    throw error;
  }
  try {
    return await action(path);
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
async function existing(path) {
  try {
    return await loadBundle(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
async function atomicWrite(path, bundle) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  let file;
  try {
    file = await open(temporary, "wx", 0o600);
    await file.writeFile(JSON.stringify(bundle));
    await file.sync();
    await file.close();
    file = null;
    await rename(temporary, path);
  } finally {
    if (file) await file.close();
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
function extendsHistory(current, incoming) {
  if (!current) return;
  if (incoming.records.length < current.records.length)
    throw new Error("Import would shorten existing history");
  for (let i = 0; i < current.records.length; i++) {
    if (current.records[i].id !== incoming.records[i].id)
      throw new Error(
        `Import conflicts with existing history at sequence ${i}; existing history preserved`,
      );
  }
}
export async function importBundle(path, bundle) {
  verifyBundle(bundle);
  bundle = structuredClone(bundle);
  verifyBundle(bundle);
  return locked(path, async (path) => {
    const current = await existing(path);
    extendsHistory(current, bundle);
    if (current && current.records.length === bundle.records.length)
      return current;
    await atomicWrite(path, bundle);
    return bundle;
  });
}
export const saveBundle = importBundle;
export async function appendEvent(path, args) {
  return locked(path, async (path) => {
    const current = await existing(path);
    const records = current?.records ?? [];
    const record = createRecord({ ...args, records });
    const bundle = createBundle([...records, record]);
    await atomicWrite(path, bundle);
    return bundle;
  });
}
