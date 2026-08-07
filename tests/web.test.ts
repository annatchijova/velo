import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createVeloServer } from "../src/web/server.js";

/**
 * The loopback HTTP server is new attack surface. Red team round 1 found
 * a path traversal in the MCP path (F1); the same class of bug applies
 * to URL paths here, so it is tested rather than assumed.
 */

let server: Server;
let base: string;
let staticDir: string;

before(async () => {
  staticDir = mkdtempSync(join(tmpdir(), "velo-static-"));
  writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>t</title>ok");
  server = createVeloServer(staticDir);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (typeof addr === "string" || addr === null) throw new Error("no port");
  base = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  server.close();
});

const seedCase = (caseId: string, withCustody = true) => ({
  caseId,
  artifacts: [
    {
      id: "a1",
      type: "log",
      timestamp: "2026-08-07T14:20:00Z",
      source: "mail",
      process: "mail",
      path: "x",
      entropyMilliBits: 4500,
      markers: ["effect_event", "narrative_poisoning"],
      description: "d",
      provenanceChain: ["sha256:acq-A"],
    },
    {
      id: "a2",
      type: "registry",
      timestamp: "2026-08-07T14:25:00Z",
      source: "reg",
      process: "reg",
      path: "y",
      entropyMilliBits: 3200,
      markers: ["cause_event", "log_cleared"],
      description: "d",
      provenanceChain: ["sha256:acq-B"],
    },
  ],
  devilAdvocate: "counter-argument",
  custodyEvents: withCustody
    ? [{ eventType: "ACQUIRED", timestamp: "2026-08-07T13:00:00Z", detail: "acquired" }]
    : [],
});

const postSeal = (body: unknown) =>
  fetch(`${base}/api/seal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("seal then verify round-trips over HTTP", async () => {
  const sealRes = await postSeal(seedCase("VELO-HTTP-T1"));
  assert.equal(sealRes.status, 200);
  const sealed = (await sealRes.json()) as any;
  assert.equal(sealed.summary.verdict, "MALICE");
  assert.equal(sealed.summary.corroborationCount, 2);

  const verifyRes = await fetch(`${base}/api/cases/VELO-HTTP-T1/verify`);
  assert.equal(verifyRes.status, 200);
  const verified = (await verifyRes.json()) as any;
  assert.equal(verified.internallyConsistent, true);
  assert.ok(verified.doesNotEstablish.length > 0, "the limitation must travel with every result");
});

test("no custody events => ABSTAIN, over HTTP too", async () => {
  const res = await postSeal(seedCase("VELO-HTTP-T2", false));
  const body = (await res.json()) as any;
  assert.equal(body.summary.verdict, "ABSTAIN");
  assert.equal(body.custodyValid, false);
});

test("path traversal in caseId is rejected at the API boundary", async () => {
  for (const bad of ["../pwned", "..%2Fpwned", "a/b", "a\\b", ""]) {
    const res = await postSeal({ ...seedCase("placeholder"), caseId: bad });
    assert.notEqual(res.status, 200, `caseId ${JSON.stringify(bad)} must not be accepted`);
  }
});

test("path traversal in the static path does not escape the served directory", async () => {
  for (const bad of ["/../../../../etc/passwd", "/%2e%2e%2f%2e%2e%2fpackage.json", "/..%5c..%5cpackage.json"]) {
    const res = await fetch(`${base}${bad}`);
    const text = await res.text();
    assert.ok(res.status === 403 || res.status === 404, `${bad} should be refused, got ${res.status}`);
    assert.ok(!text.includes("\"name\": \"velo\""), `${bad} leaked package.json`);
    assert.ok(!text.includes("root:x:"), `${bad} leaked /etc/passwd`);
  }
});

test("malformed JSON and bad shapes fail closed with a message, never a crash", async () => {
  const badJson = await fetch(`${base}/api/seal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  assert.equal(badJson.status, 400);

  const badShape = await postSeal({ caseId: "VELO-HTTP-T3", artifacts: [] });
  assert.equal(badShape.status, 400, "an empty artifact list is not a case");

  const badTimestamp = await postSeal({
    ...seedCase("VELO-HTTP-T4"),
    artifacts: [{ ...seedCase("x").artifacts[0]!, timestamp: "not-a-date" }],
  });
  assert.equal(badTimestamp.status, 400, "an unparseable timestamp must be refused at the edge");
});

test("attest fails explicitly rather than simulating an attestation", async () => {
  const res = await fetch(`${base}/api/attest`);
  assert.equal(res.status, 501);
  const body = (await res.json()) as any;
  assert.match(body.error, /not deployed|Not implemented/i);
});

test("unknown case returns 404, not a crash", async () => {
  const res = await fetch(`${base}/api/cases/VELO-DOES-NOT-EXIST`);
  assert.equal(res.status, 404);
});
