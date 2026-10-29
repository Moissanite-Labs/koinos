import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { verifyBundle } from "./protocol.mjs";
const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/app.mjs", ["app.mjs", "text/javascript"]],
  ["/verify.mjs", ["verify.mjs", "text/javascript"]],
  ["/style.css", ["style.css", "text/css"]],
]);
const MAX = 2 * 1024 * 1024;
export function createServer() {
  const server = http.createServer(async (req, res) => {
    const reply = (status, data, type = "application/json") => {
      res.writeHead(status, {
        "Content-Type": type + "; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      res.end(typeof data === "string" ? data : JSON.stringify(data));
    };
    try {
      const address =
        ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress,
        ) && serverAddress(req);
      if (!address) return reply(403, { error: "Loopback Host required" });
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`)
        return reply(403, { error: "Cross-origin requests are forbidden" });
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === "GET" && assets.has(url.pathname)) {
        const [name, type] = assets.get(url.pathname);
        return reply(
          200,
          await readFile(new URL("../web/" + name, import.meta.url), "utf8"),
          type,
        );
      }
      if (req.method === "GET" && url.pathname === "/api/demo") {
        const { createDemo } = await import("./demo.mjs");
        return reply(
          200,
          (
            await createDemo({
              stage: url.searchParams.get("stage") || "accepted",
            })
          ).bundle,
        );
      }
      if (req.method === "POST" && url.pathname === "/api/verify") {
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return reply(415, { error: "Use application/json" });
        let size = 0,
          chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX) {
            reply(413, { error: "Bundle exceeds 2 MiB limit" });
            return;
          }
          chunks.push(chunk);
        }
        const bundle = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        return reply(200, { state: verifyBundle(bundle) });
      }
      reply(404, { error: "Not found" });
    } catch (error) {
      reply(400, { error: error.message });
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 32;
  return server;
}
function serverAddress(req) {
  try {
    const u = new URL(`http://${req.headers.host}`);
    return (
      ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}
function isMain() {
  try {
    return (
      Boolean(process.argv[1]) &&
      realpathSync(fileURLToPath(import.meta.url)) ===
        realpathSync(process.argv[1])
    );
  } catch {
    return false;
  }
}
if (isMain()) {
  const port = Number(process.env.PORT || 4173);
  createServer().listen(port, "127.0.0.1", () =>
    console.log(`Koinos workbench: http://127.0.0.1:${port}`),
  );
}
