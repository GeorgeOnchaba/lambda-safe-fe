import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");
const host = process.env.HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const apiTarget = process.env.LAMBDA_SAFE_API_TARGET ?? "http://compiler:8080";
const tokenPath = process.env.LAMBDA_SAFE_API_TOKEN_FILE ?? "/run/secrets/lambda-safe-api-token";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

function readToken() {
  try {
    const value = fs.readFileSync(tokenPath, "utf8").trim();
    if (value.length < 32 || !/^[\x21-\x7e]+$/.test(value)) {
      throw new Error("token must contain at least 32 visible ASCII characters");
    }
    return value;
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && !fs.existsSync(tokenPath)) return null;
    throw new Error(`Cannot load API token (${tokenPath}): ${error.message}`);
  }
}

let token;
try {
  token = readToken();
} catch (error) {
  console.error(error.message);
  process.exit(70);
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;

  if (pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ status: "ok", service: "lambda-safe-ui" }));
    return;
  }

  if (["/healthz", "/readyz"].includes(pathname) || pathname.startsWith("/v1/")) {
    if (!["GET", "POST"].includes(req.method ?? "")) {
      res.writeHead(405, { "content-type": "application/json", allow: "GET, POST" });
      res.end(JSON.stringify({ message: "method not allowed" }));
      return;
    }
    let body;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1_300_000) {
          res.writeHead(413, { "content-type": "application/json" });
          res.end(JSON.stringify({ code: "UI-PROXY-413", message: "request body too large" }));
          return;
        }
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
      const headers = {};
      if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
      if (token) headers.authorization = `Bearer ${token}`;
      if (body.length > 0) headers["content-length"] = String(body.length);

      const upstream = await fetch(new URL(pathname + new URL(req.url ?? "/", "http://localhost").search, apiTarget), {
        method: req.method,
        headers,
        body: body.length > 0 && req.method !== "GET" ? body : undefined,
        signal: AbortSignal.timeout(35_000)
      });
      const data = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      });
      res.end(data);
      return;
    } catch (error) {
      console.error("Compiler API proxy failed:", error.message);
      res.writeHead(502, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ code: "UI-PROXY-502", message: "compiler API unavailable" }));
      return;
    }
  }

  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.resolve(dist, "." + requestPath);
  if (!resolved.startsWith(dist + path.sep) && resolved !== path.join(dist, "index.html")) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  let filePath = resolved;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error("not a file");
  } catch {
    // SPA fallback for client-side routes; unknown assets still return HTML only
    // for paths that do not include a file extension.
    if (path.extname(pathname)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    filePath = path.join(dist, "index.html");
  }

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      "content-type": mime[path.extname(filePath)] ?? "application/octet-stream",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      "cache-control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable"
    });
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end("internal server error");
  }
});

server.listen(port, host, () => console.log(`lambda-safe-ui listening on ${host}:${port}`));
