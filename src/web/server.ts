#!/usr/bin/env node
/**
 * Local loopback HTTP server — the browser UI's way into the same engine
 * the MCP server drives.
 *
 * DESIGN CONSTRAINT, not a default: this binds to 127.0.0.1 and nothing
 * else. A machine holding a victim's forensic evidence must not open a
 * port to its network. A hosted version of this server would be the
 * exact problem VELO exists to avoid, so making it hostable is not a
 * future feature — it is a thing not to do.
 *
 * All behaviour comes from src/core/operations.ts, shared with the MCP
 * server. Red team F8 was two copies of one function drifting apart;
 * this interface is deliberately thin enough to have nothing to drift.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { z } from "zod";
import { getCase, listCases, sealCase, verifyCase, type SealCaseInput } from "../core/operations.js";
import { CUSTODY_EVENT_TYPES } from "../seal/custody.js";
import { InvalidCaseIdError } from "../mcp/store.js";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4310;

/** A sealed case is small. Anything this large is not a case. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const caseIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/, "caseId may only contain letters, digits, dot, underscore and hyphen");

const artifactSchema = z.object({
  id: z.string(),
  type: z.enum(["file", "process", "log", "network", "registry", "dns_record"]),
  timestamp: z.string().datetime({ offset: true }),
  source: z.string(),
  process: z.string(),
  path: z.string(),
  entropyMilliBits: z.number().int().safe(),
  markers: z.array(z.string()),
  description: z.string(),
  provenanceChain: z.array(z.string()),
});

const sealRequestSchema = z.object({
  caseId: caseIdSchema,
  artifacts: z.array(artifactSchema).min(1),
  devilAdvocate: z.string().default(""),
  custodyEvents: z
    .array(
      z.object({
        eventType: z.enum(CUSTODY_EVENT_TYPES),
        timestamp: z.string().datetime({ offset: true }),
        detail: z.string(),
      }),
    )
    .default([]),
});

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    // This server never intends to be embedded or called cross-origin.
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    "referrer-policy": "no-referrer",
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > MAX_BODY_BYTES) {
      throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

/**
 * Static file serving, with the same lesson red team F1 taught about
 * caseId applied to URL paths: resolve first, then confirm the result is
 * still inside the served directory. `..` in a URL is not a routing
 * quirk, it is a read of the expert's filesystem.
 */
function serveStatic(res: ServerResponse, staticDir: string, urlPath: string): void {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const target = resolve(join(staticDir, rel === "/" || rel === "." ? "index.html" : rel));
  const root = resolve(staticDir);

  if (target !== root && !target.startsWith(root + sep)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  res.writeHead(200, {
    "content-type": MIME[extname(target)] ?? "application/octet-stream",
    "x-content-type-options": "nosniff",
  });
  createReadStream(target).pipe(res);
}

export function createVeloServer(staticDir: string) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    const path = url.pathname;

    try {
      if (req.method === "GET" && path === "/api/cases") {
        sendJson(res, 200, listCases());
        return;
      }

      const caseMatch = /^\/api\/cases\/([^/]+)$/.exec(path);
      if (req.method === "GET" && caseMatch) {
        const parsed = caseIdSchema.safeParse(decodeURIComponent(caseMatch[1]!));
        if (!parsed.success) {
          sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Invalid caseId" });
          return;
        }
        const summary = getCase(parsed.data);
        if (!summary) {
          sendJson(res, 404, { error: `No case found with id ${parsed.data}` });
          return;
        }
        sendJson(res, 200, summary);
        return;
      }

      const verifyMatch = /^\/api\/cases\/([^/]+)\/verify$/.exec(path);
      if (req.method === "GET" && verifyMatch) {
        const parsed = caseIdSchema.safeParse(decodeURIComponent(verifyMatch[1]!));
        if (!parsed.success) {
          sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Invalid caseId" });
          return;
        }
        const result = verifyCase(parsed.data);
        if (!result) {
          sendJson(res, 404, { error: `No case found with id ${parsed.data}` });
          return;
        }
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && path === "/api/seal") {
        const raw = await readBody(req);
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(raw);
        } catch {
          sendJson(res, 400, { error: "Body is not valid JSON" });
          return;
        }
        const parsed = sealRequestSchema.safeParse(parsedJson);
        if (!parsed.success) {
          sendJson(res, 400, {
            error: "Invalid request",
            issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
          });
          return;
        }
        // Markers stay `string[]` through zod on purpose: an unknown
        // marker is not an error, it simply fires no detector. Rejecting
        // it here would make the API brittle against a corpus that grows
        // faster than the Marker union — which is precisely how red team
        // F5 (corpus/engine drift) happened in the first place.
        sendJson(res, 200, sealCase(parsed.data as SealCaseInput));
        return;
      }

      // Registered but honestly unavailable, exactly as in the MCP server:
      // the contract compiles but nothing is deployed, so this cannot work
      // yet and will not pretend to.
      if (path === "/api/attest") {
        sendJson(res, 501, {
          error:
            "Not implemented. The Compact contract compiles, but nothing is deployed to a network and no proof server is wired up, so an attestation cannot be produced. This endpoint fails rather than simulating one.",
        });
        return;
      }

      if (req.method === "GET") {
        serveStatic(res, staticDir, path);
        return;
      }

      sendJson(res, 405, { error: "Method not allowed" });
    } catch (err) {
      if (err instanceof InvalidCaseIdError) {
        sendJson(res, 400, { error: err.message });
        return;
      }
      sendJson(res, 500, { error: err instanceof Error ? err.message : "Internal error" });
    }
  });
}

function main() {
  const port = Number.parseInt(process.env["VELO_PORT"] ?? String(DEFAULT_PORT), 10);
  const staticDir = process.env["VELO_STATIC_DIR"] ?? resolve("src/web/static");

  const server = createVeloServer(staticDir);
  server.listen(port, HOST, () => {
    console.log(`VELO UI on http://${HOST}:${port}`);
    console.log(`serving ${staticDir}`);
    console.log("bound to loopback only — this machine's evidence is not on any network");
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  main();
}
