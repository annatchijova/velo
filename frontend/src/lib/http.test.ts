import { describe, it, expect } from "vitest";
import { requireJsonContentType } from "@/lib/http";

/**
 * Regression tests for red team F14 (docs/RED_TEAM_ROUND_3.md).
 *
 * The finding: none of the POST routes checked `Content-Type` before
 * parsing the body as JSON. A cross-origin `<form enctype="text/plain">`
 * sends one of the three CORS-safelisted content types — no preflight —
 * and a crafted name/value pair serialises to something that still parses
 * as valid JSON. Any page the analyst had open could POST to the local
 * API. Same-Origin Policy stops the attacker reading the response; it
 * does not stop the request or its side effects.
 *
 * These tests exist because a security fix with no test is one refactor
 * away from being removed by someone who does not know why it is there.
 */

const req = (contentType?: string) =>
  new Request("http://localhost/api/seal", {
    method: "POST",
    headers: contentType === undefined ? {} : { "content-type": contentType },
    body: "{}",
  });

describe("requireJsonContentType — the three CORS-safelisted types must be refused", () => {
  // These are exactly the content types a browser will send cross-origin
  // without a preflight. All three are the attack, not an edge case.
  it.each([
    "text/plain",
    "text/plain;charset=UTF-8",
    "application/x-www-form-urlencoded",
    "multipart/form-data; boundary=----x",
  ])("refuses %s", (ct) => {
    const res = requireJsonContentType(req(ct));
    expect(res, `${ct} must be refused`).not.toBeNull();
    expect(res!.status).toBe(415);
  });

  it("refuses a request with no Content-Type at all", () => {
    const res = requireJsonContentType(req());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(415);
  });
});

describe("requireJsonContentType — legitimate callers still pass", () => {
  it.each([
    "application/json",
    "application/json; charset=utf-8",
    "APPLICATION/JSON",
    "  application/json  ",
  ])("accepts %s", (ct) => {
    expect(requireJsonContentType(req(ct)), `${ct} should be accepted`).toBeNull();
  });
});

describe("requireJsonContentType — near-misses do not slip through", () => {
  // A prefix match would accept these; an exact media-type match does not.
  it.each([
    "application/json-patch+json",
    "application/jsonx",
    "text/json",
    "application/ld+json",
  ])("refuses %s", (ct) => {
    const res = requireJsonContentType(req(ct));
    expect(res, `${ct} must not be treated as application/json`).not.toBeNull();
    expect(res!.status).toBe(415);
  });
});

describe("requireJsonContentType — the refusal explains itself", () => {
  it("returns 415 and names what it received", async () => {
    const res = requireJsonContentType(req("text/plain"));
    const body = (await res!.json()) as { error: string };
    expect(body.error).toContain("application/json");
    expect(body.error).toContain("text/plain");
  });
});

/**
 * Red team round 6, F22: the compute-bearing POST routes had no request-body
 * size cap — memory is unbounded at the application layer. readJsonBody
 * enforces one, refusing oversized bodies before parse.
 */

import { MAX_JSON_BODY_BYTES, readJsonBody } from "@/lib/http";

describe("readJsonBody — size cap (F22)", () => {
  it("parses a small JSON body", async () => {
    const req = new Request("http://localhost/api/seal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId: "VELO-001" }),
    });
    const result = await readJsonBody(req);
    expect(result.status).toBe(200);
    if (result.status === 200) expect(result.body).toEqual({ caseId: "VELO-001" });
  });

  it("refuses bodies over the cap declared in content-length", async () => {
    const req = new Request("http://localhost/api/seal", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(MAX_JSON_BODY_BYTES + 1),
      },
      body: "{}",
    });
    const result = await readJsonBody(req);
    expect(result.status).toBe(413);
  });

  it("refuses oversized bodies even without a content-length header", async () => {
    const big = `{"pad":"${"x".repeat(MAX_JSON_BODY_BYTES)}"}`;
    const req = new Request("http://localhost/api/seal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: big,
    });
    const result = await readJsonBody(req);
    expect(result.status).toBe(413);
  });

  it("refuses malformed JSON with 400, not a crash", async () => {
    const req = new Request("http://localhost/api/seal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const result = await readJsonBody(req);
    expect(result.status).toBe(400);
  });

  it("accepts a body exactly at the cap", async () => {
    const pad = "x".repeat(MAX_JSON_BODY_BYTES - 10);
    const body = `{"pad":"${pad}"}`;
    expect(body.length).toBe(MAX_JSON_BODY_BYTES);
    const req = new Request("http://localhost/api/seal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const result = await readJsonBody(req);
    expect(result.status).toBe(200);
  });
});
