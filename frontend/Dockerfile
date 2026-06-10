# ============================================================
# Cenli DPE Frontend — Cloud Run Dockerfile
# ============================================================
# Build:   docker build -t cenli-frontend .
# Run:     docker run -p 8080:8080 cenli-frontend
# Deploy:  gcloud run deploy cenli-frontend --source .
# ============================================================

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# Build the app (TanStack Start production build)
RUN npm run build

# Stage 2: Production
FROM node:22-alpine

WORKDIR /app

# TanStack Start outputs the SSR server to dist/
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Small Node HTTP wrapper that boots the TanStack Start fetch handler
RUN printf '%s\n' \
  'import { createServer } from "node:http";' \
  'import { readFile } from "node:fs/promises";' \
  'import { existsSync } from "node:fs";' \
  'import { join, extname } from "node:path";' \
  'import handler from "./dist/server/server.js";' \
  'const port = process.env.PORT || 3000;' \
  'const MIME = { ".js":"application/javascript",".css":"text/css",".html":"text/html",".png":"image/png",".svg":"image/svg+xml",".ico":"image/x-icon",".woff2":"font/woff2",".woff":"font/woff",".json":"application/json",".txt":"text/plain" };' \
  'createServer(async (req, res) => {' \
  '  try {' \
  '    const url = req.url.split("?")[0];' \
  '    const staticPath = join("dist/client", url);' \
  '    if (existsSync(staticPath) && !url.endsWith("/")) {' \
  '      const data = await readFile(staticPath);' \
  '      const mime = MIME[extname(url)] || "application/octet-stream";' \
  '      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "public,max-age=31536000,immutable" });' \
  '      res.end(data); return;' \
  '    }' \
  '    const fullUrl = `http://${req.headers.host}${req.url}`;' \
  '    const headers = {};' \
  '    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers[k] = v;' \
  '    const body = ["GET","HEAD"].includes(req.method) ? undefined : await new Promise(r => { const c=[]; req.on("data",d=>c.push(d)); req.on("end",()=>r(Buffer.concat(c))); });' \
  '    const response = await handler.fetch(new Request(fullUrl, { method: req.method, headers, body }));' \
  '    res.writeHead(response.status, Object.fromEntries(response.headers));' \
  '    if (response.body) { const reader = response.body.getReader(); const pump = async () => { const {done,value} = await reader.read(); if (done) { res.end(); return; } res.write(value); pump(); }; pump(); } else { res.end(); }' \
  '  } catch(e) { console.error(e); res.writeHead(500); res.end("Internal Server Error"); }' \
  '}).listen(port, "0.0.0.0", () => console.log(`Server running on port ${port}`));' \
  > server-start.mjs

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD node server-start.mjs
