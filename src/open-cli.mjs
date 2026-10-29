import { open } from "node:fs/promises";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { readJsonFile, readTextFile } from "./store.mjs";
import {
  loadOpenBundle,
  mergeOpenFile,
  appendOpenFile,
} from "./open-store.mjs";
import {
  verifyOpenBundle,
  matchOpportunities,
  exportConsentedFeedback,
} from "./open-protocol.mjs";
import { createOpenDemo } from "./open-demo.mjs";

export const openHelp = `Permissionless collaboration records (koinos-open/0.2)
  koinos open demo OUTPUT.json
  koinos open append STORE KEY.pem KIND BODY.json
  koinos open inspect BUNDLE.json
  koinos open verify BUNDLE.json
  koinos open merge STORE INCOMING.json [MORE.json ...]
  koinos open export STORE OUTPUT.json
  koinos open match BUNDLE.json PROFILE_RECORD_ID
  koinos open feedback BUNDLE.json evaluation|training OUTPUT.json
  koinos open plan BUNDLE.json SETTLEMENT_INTENT_ID
Use koinos keygen KEY.pem to create a protected local signing key.
Full bundle exports reveal all included records. Feedback export is a separate,
explicitly consented metadata operation. Settlement plans do not move assets.
`;

async function exclusive(path, value) {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(value));
    await file.sync();
  } finally {
    await file.close();
  }
}

export async function openMain(args) {
  const [command, ...rest] = args;
  const output = (value) =>
    process.stdout.write(JSON.stringify(value, null, 2) + "\n");
  const arity = (minimum, maximum = minimum) => {
    if (rest.length < minimum || rest.length > maximum)
      throw Error(`Invalid arguments for open ${command}. Use open --help.`);
  };
  if (!command || command === "--help" || command === "help") {
    process.stdout.write(openHelp);
    return;
  }
  if (command === "demo") {
    arity(1);
    const bundle = createOpenDemo();
    await exclusive(rest[0], bundle);
    output({ exported: rest[0], count: bundle.records.length });
    return;
  }
  if (command === "append") {
    arity(4);
    const privateKey = await readTextFile(rest[1], 16384);
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "ed25519")
      throw Error("Ed25519 signing key required");
    const id =
      "koinos:ed25519:" +
      createPublicKey(key)
        .export({ type: "spki", format: "der" })
        .subarray(-32)
        .toString("base64url");
    const bundle = await appendOpenFile(rest[0], {
      identity: { id, privateKey },
      kind: rest[2],
      body: await readJsonFile(rest[3]),
    });
    const state = verifyOpenBundle(bundle);
    output({ count: state.count, heads: state.heads });
    return;
  }
  if (command === "inspect" || command === "verify") {
    arity(1);
    const state = verifyOpenBundle(await loadOpenBundle(rest[0]));
    output(
      command === "inspect"
        ? state
        : {
            valid: true,
            count: state.count,
            heads: state.heads,
            settlementVerified: false,
          },
    );
    return;
  }
  if (command === "merge") {
    arity(2, 17);
    const incoming = await Promise.all(rest.slice(1).map(loadOpenBundle));
    const state = verifyOpenBundle(await mergeOpenFile(rest[0], ...incoming));
    output({ count: state.count, heads: state.heads });
    return;
  }
  if (command === "export") {
    arity(2);
    const bundle = await loadOpenBundle(rest[0]);
    await exclusive(rest[1], bundle);
    output({ exported: rest[1], count: bundle.records.length });
    return;
  }
  if (command === "match") {
    arity(2);
    output(matchOpportunities(await loadOpenBundle(rest[0]), rest[1]));
    return;
  }
  if (command === "feedback") {
    arity(3);
    const data = exportConsentedFeedback(
      await loadOpenBundle(rest[0]),
      rest[1],
    );
    await exclusive(rest[2], data);
    output({
      exported: rest[2],
      purpose: data.purpose,
      count: data.feedback.length,
    });
    return;
  }
  if (command === "plan") {
    arity(2);
    const { deriveSettlementPlan } = await import("./open-protocol.mjs");
    output(deriveSettlementPlan(await loadOpenBundle(rest[0]), rest[1]));
    return;
  }
  throw Error("Unknown open command. Use open --help.");
}
