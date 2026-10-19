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

function loadToken() {
  try {
    const token = fs.readFileSync(tokenPath, "utf8").trim();
    if (token.length < 32 || !/^[\x21-\x7e]+$/.test(token)) {
      throw new Error("token must be at least 32 visible ASCII characters");
    }
    return token;
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && !fs.existsSync(tokenPath)) return null;
    throw new Error(`unable to load API token: ${error.message}`);
  }
}

let token;
try {
  token = loadToken();
} catch (error) {
  console.error(error.message);
  process.exit(70);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? "/", "http://localhost");
  const pathname = requestUrl.pathname;

  if (pathname === "/healthz") {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    res.end(JSON.stringify({ status: "ok", service: "lambda-safe-ui" }));
    return;
  }

  if (pathname === "/readyz" || pathname.startsWith("/v1/")) {
    if (!["GET", "POST"].includes(req.method ?? "")) {
      res.writeHead(405, { "content-type": "application/json", "allow": "GET, POST" });
      res.end(JSON.stringify({ message: "method not allowed" }));
      return;
    }

    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1_300_000) {
          res.writeHead(413, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ code: "UI-PROXY-413", message: "request body too large" }));
          return;
        }
        chunks.push(chunk);
      }

      const body = Buffer.concat(chunks);
      const headers = {};
      if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
      if (token) headers.authorization = `Bearer ${token}`;

      const upstream = await fetch(new URL(pathname + requestUrl.search, apiTarget), {
        method: req.method,
        headers,
        body: body.length && req.method !== "GET" ? body : undefined,
        signal: AbortSignal.timeout(35_000)
      });
      const contentType = upstream.headers.get("content-type") ?? "application/json; charset=utf-8";
      const responseBody = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, {
        "content-type": contentType,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      });
      res.end(responseBody);
    } catch (error) {
      console.error("compiler API proxy failed:", error.message);
      res.writeHead(502, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ code: "UI-PROXY-502", message: "compiler API unavailable" }));
    }
    return;
  }

  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(dist, "." + relativePath);
  if (!filePath.startsWith(dist + path.sep)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  let servePath = filePath;
  try {
    if (!fs.statSync(servePath).isFile()) throw new Error("not a file");
  } catch {
    if (path.extname(pathname)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" });
      res.end("not found");
      return;
    }
    servePath = path.join(dist, "index.html");
  }

  try {
    const content = fs.readFileSync(servePath);
    res.writeHead(200, {
      "content-type": mime[path.extname(servePath)] ?? "application/octet-stream",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      "cache-control": servePath.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable"
    });
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end("internal server error");
  }
});

server.listen(port, host, () => console.log(`lambda-safe-ui listening on ${host}:${port}`));
