import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newCommitments,
  postAttestationRecord,
} from "../src/chain/post-attestation.js";

/**
 * Phase 4 (AC-J3.2, ADR-006): after the CLI proves and submits an
 * attestation, it may post the record to a deployed VELO app so the sealed
 * ledger can link the bundle to the on-chain fact. The post is strictly
 * best-effort: the attestation already succeeded on-chain, so a missing env,
 * an unreachable API, or an API refusal must degrade to a logged reason,
 * never to a failed run.
 *
 * The HTTP layer is injected (fetchImpl), matching the read-side convention
 * in src/chain/read.ts — no network in the suite.
 */

const RECORD = {
  bundleHash: "ff".repeat(32),
  txHash: "0xabc",
  commitment: "dd".repeat(32),
};

test("postAttestationRecord skips when VELO_API_URL is not set", async () => {
  let called = 0;
  const result = await postAttestationRecord({
    ...RECORD,
    apiUrl: undefined,
    apiKey: "velo_key",
    fetchImpl: async () => {
      called += 1;
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(result.posted, false);
  assert.match(result.reason ?? "", /VELO_API_URL/);
  assert.equal(called, 0);
});

test("postAttestationRecord skips when VELO_API_KEY is not set", async () => {
  let called = 0;
  const result = await postAttestationRecord({
    ...RECORD,
    apiUrl: "https://velo.example.app",
    apiKey: undefined,
    fetchImpl: async () => {
      called += 1;
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(result.posted, false);
  assert.match(result.reason ?? "", /VELO_API_KEY/);
  assert.equal(called, 0);
});

test("postAttestationRecord posts the exact payload with the bearer key", async () => {
  let seen: { url?: string; method?: string; auth?: string | null; body?: unknown } = {};
  const result = await postAttestationRecord({
    ...RECORD,
    apiUrl: "https://velo.example.app",
    apiKey: "velo_key",
    fetchImpl: async (input, init) => {
      seen = {
        url: String(input),
        method: init?.method,
        auth: (init?.headers as Record<string, string>)?.["authorization"] ?? null,
        body: JSON.parse(String(init?.body)),
      };
      return new Response(JSON.stringify({ ok: true, sealedId: "sb-1" }), { status: 200 });
    },
  });
  assert.equal(result.posted, true);
  assert.equal(seen.url, "https://velo.example.app/api/attestations");
  assert.equal(seen.method, "POST");
  assert.equal(seen.auth, "Bearer velo_key");
  assert.deepEqual(seen.body, RECORD);
});

test("postAttestationRecord treats API refusals as soft failures", async () => {
  for (const status of [401, 403, 404, 503]) {
    const result = await postAttestationRecord({
      ...RECORD,
      apiUrl: "https://velo.example.app",
      apiKey: "velo_key",
      fetchImpl: async () => new Response(JSON.stringify({ error: "nope" }), { status }),
    });
    assert.equal(result.posted, false, `status ${status} must not count as posted`);
    assert.match(result.reason ?? "", new RegExp(String(status)));
  }
});

test("postAttestationRecord survives network errors", async () => {
  const result = await postAttestationRecord({
    ...RECORD,
    apiUrl: "https://velo.example.app",
    apiKey: "velo_key",
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.equal(result.posted, false);
  assert.match(result.reason ?? "", /ECONNREFUSED/);
});

test("newCommitments returns only commitments that appeared after", () => {
  const before = ["aa".repeat(32), "bb".repeat(32)];
  const after = [
    { commitment: "bb".repeat(32), verdict: "NOISE" },
    { commitment: "cc".repeat(32), verdict: "MALICE" },
  ];
  assert.deepEqual(newCommitments(before, after), ["cc".repeat(32)]);
});

test("newCommitments is case-insensitive on hex", () => {
  const upper = "AB".repeat(32);
  assert.deepEqual(newCommitments([upper], [{ commitment: upper.toLowerCase(), verdict: "NOISE" }]), []);
});
