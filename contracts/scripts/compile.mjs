import solc from "solc";
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export const root = fileURLToPath(new URL("../", import.meta.url));
export function compile() {
  const sources = Object.fromEntries(
    readdirSync(resolve(root, "src"))
      .filter((name) => name.endsWith(".sol"))
      .map((name) => [
        name,
        { content: readFileSync(resolve(root, "src", name), "utf8") },
      ]),
  );
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources,
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: "cancun",
          outputSelection: {
            "*": {
              "*": [
                "abi",
                "evm.bytecode.object",
                "evm.deployedBytecode.object",
              ],
            },
          },
        },
      }),
      {
        import: (path) => {
          try {
            return {
              contents: readFileSync(
                resolve(root, "node_modules", path),
                "utf8",
              ),
            };
          } catch {
            return { error: `Missing import ${path}` };
          }
        },
      },
    ),
  );
  const errors = (output.errors ?? []).filter(
    (error) => error.severity === "error",
  );
  if (errors.length)
    throw Error(errors.map((error) => error.formattedMessage).join("\n"));
  const artifacts = {};
  for (const [source, entries] of Object.entries(output.contracts))
    for (const [name, artifact] of Object.entries(entries)) {
      if (!artifact.evm.bytecode.object) continue;
      const bytes = artifact.evm.deployedBytecode.object.length / 2;
      if (bytes > 24576) throw Error(`${name} exceeds EIP-170: ${bytes}`);
      artifacts[name] = {
        source,
        abi: artifact.abi,
        bytecode: "0x" + artifact.evm.bytecode.object,
        runtimeBytes: bytes,
      };
    }
  return artifacts;
}
function isMain() {
  try {
    return (
      !!process.argv[1] &&
      realpathSync(process.argv[1]) ===
        realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}
if (isMain()) {
  const artifacts = compile();
  mkdirSync(resolve(root, "artifacts"), { recursive: true });
  writeFileSync(
    resolve(root, "artifacts/contracts.json"),
    JSON.stringify(artifacts, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(artifacts).map(([name, a]) => [
          name,
          { runtimeBytes: a.runtimeBytes },
        ]),
      ),
    ),
  );
}
