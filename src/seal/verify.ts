#!/usr/bin/env node
/**
 * Standalone offline bundle verifier.
 *
 * Deliberately self-contained — does NOT import from bundle.ts or
 * custody.ts. A judge, a counter-expert, or anyone else should be able to
 * take this single file plus a sealed bundle JSON and verify it without
 * trusting (or even reading) the rest of this repository. Node.js
 * built-ins only — no npm dependencies.
 *
 * Usage: node verify.js path/to/bundle.json
 *
 * WHAT THIS ESTABLISHES, AND WHAT IT DOES NOT (red team F4):
 * It establishes that the bundle is internally consistent — the hashes
 * recompute, the custody links hold. It does NOT establish authenticity:
 * everything here is SHA-256 over public data with no secret anywhere, so
 * anyone can fabricate a bundle from scratch that passes. Authenticity is
 * anchored by the on-chain attestation (Capa 2), which is not part of
 * this build. The output says "internally consistent", never "valid",
 * because a reader takes "valid" to mean "authentic".
 *
 * DUPLICATED LOGIC WARNING (red team F8): the canonicalization below is a
 * deliberate copy of src/seal/canonical.ts — that duplication is the
 * price of the no-dependencies property. It has already drifted once
 * (bigint handling). tests/conformance.test.ts pins both implementations
 * to the same vectors so drift fails a test instead of silently
 * producing two different hashes for one bundle.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const CANONICALIZE_VERSION = 2;

const CUSTODY_EVENT_TYPES = ["IDENTIFIED", "COLLECTED", "ACQUIRED", "PRESERVED", "ANALYZED", "SEALED"];

interface CustodyEvent {
  seq: number;
  eventType: string;
  timestamp: string;
  detail: string;
  prevHash: string;
  entryHash: string;
}

interface CustodyChain {
  caseId: string;
  genesisHash: string;
  events: CustodyEvent[];
}

interface SealedBundle {
  caseId: string;
  sealedAt: string;
  verdict: string;
  score: string;
  corroborationCount: number;
  detectorsFired: string[];
  devilAdvocate: string;
  reasoning: string;
  evidenceManifest: unknown;
  custodyChain: CustodyChain;
  bundleHash: string;
  analysisFingerprint: string;
}

/** Code-point ordering — must match canonical.ts. See F9 there for why. */
function compareByCodePoint(a: string, b: string): number {
  const ca = [...a];
  const cb = [...b];
  const len = Math.min(ca.length, cb.length);
  for (let i = 0; i < len; i++) {
    const pa = ca[i]!.codePointAt(0)!;
    const pb = cb[i]!.codePointAt(0)!;
    if (pa !== pb) return pa < pb ? -1 : 1;
  }
  return ca.length === cb.length ? 0 : ca.length < cb.length ? -1 : 1;
}

function canonicalizeValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`canonicalize: non-finite number ${value} is not allowed`);
    if (!Number.isInteger(value)) throw new Error(`canonicalize: non-integer number ${value} is not allowed`);
    if (!Number.isSafeInteger(value)) {
      throw new Error(`canonicalize: integer ${value} exceeds the safe range (2^53-1) and may have lost precision`);
    }
    return Object.is(value, -0) ? "0" : value.toString();
  }
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (Array.isArray(value)) return `[${value.map(canonicalizeValue).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareByCodePoint);
    return `{${keys.map((k) => `${JSON.stringify(k.normalize("NFC"))}:${canonicalizeValue(record[k])}`).join(",")}}`;
  }
  throw new Error(`canonicalize: unsupported type ${typeof value}`);
}

export function canonicalize(value: unknown): string {
  return `v${CANONICALIZE_VERSION}:${canonicalizeValue(value)}`;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function genesisHash(caseId: string): string {
  return sha256Hex(`VELO_GENESIS:${caseId}`);
}

/**
 * Red team F10: JSON.parse silently takes the last value for duplicate
 * keys, so a file whose bytes read `"verdict": "NOISE"` first could be
 * certified as MALICE — and other languages' parsers take the first
 * value, meaning the same bytes verify to opposite verdicts. Duplicates
 * are rejected outright rather than resolved by any rule.
 */
function parseStrict(text: string): unknown {
  const seenAt = new WeakMap<object, Set<string>>();
  return JSON.parse(text, function (this: object, key, value) {
    if (key === "") return value;
    let keys = seenAt.get(this);
    if (!keys) {
      keys = new Set();
      seenAt.set(this, keys);
    }
    if (keys.has(key)) {
      throw new SyntaxError(`Duplicate key ${JSON.stringify(key)} in bundle JSON — ambiguous document, refusing to verify.`);
    }
    keys.add(key);
    return value;
  });
}

function verifyCustodyChain(chain: CustodyChain): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (chain.genesisHash !== genesisHash(chain.caseId)) {
    reasons.push("Genesis hash does not match case ID.");
    return { ok: false, reasons };
  }

  let prevHash = chain.genesisHash;
  let previousTimestampMs: number | null = null;

  for (const [index, event] of chain.events.entries()) {
    // F7: the closed vocabulary is enforced here too — the judge's tool
    // previously did not even know what the valid event types were.
    if (!CUSTODY_EVENT_TYPES.includes(event.eventType)) {
      reasons.push(`Unknown event type ${JSON.stringify(event.eventType)} at seq ${event.seq}.`);
      break;
    }
    if (event.seq !== index) {
      reasons.push(`Non-consecutive seq at position ${index}: found ${event.seq}.`);
      break;
    }
    const timestampMs = new Date(event.timestamp).getTime();
    if (Number.isNaN(timestampMs)) {
      reasons.push(`Unparseable timestamp at seq ${event.seq}.`);
      break;
    }
    if (previousTimestampMs !== null && timestampMs < previousTimestampMs) {
      reasons.push(`Timestamp at seq ${event.seq} precedes the previous event.`);
      break;
    }
    previousTimestampMs = timestampMs;

    if (event.prevHash !== prevHash) {
      reasons.push(`Broken link at seq ${event.seq}.`);
      break;
    }
    const expectedEntryHash = sha256Hex(
      canonicalize({
        seq: event.seq,
        eventType: event.eventType,
        timestamp: event.timestamp,
        detail: event.detail,
        prevHash: event.prevHash,
      }),
    );
    if (event.entryHash !== expectedEntryHash) {
      reasons.push(`Tampered entry at seq ${event.seq}.`);
      break;
    }
    prevHash = event.entryHash;
  }

  return { ok: reasons.length === 0, reasons };
}

/** Shape check at the boundary, so a malformed file is reported, not thrown (F12). */
function assertLooksLikeBundle(value: unknown): asserts value is SealedBundle {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Not a bundle: expected a JSON object.");
  }
  const b = value as Record<string, unknown>;
  for (const field of ["caseId", "sealedAt", "verdict", "bundleHash", "analysisFingerprint"]) {
    if (typeof b[field] !== "string") throw new TypeError(`Not a bundle: missing or non-string field "${field}".`);
  }
  if (typeof b["corroborationCount"] !== "number") throw new TypeError('Not a bundle: missing numeric "corroborationCount".');
  const chain = b["custodyChain"];
  if (typeof chain !== "object" || chain === null || !Array.isArray((chain as CustodyChain).events)) {
    throw new TypeError('Not a bundle: missing or malformed "custodyChain".');
  }
}

export function verifyBundle(bundle: SealedBundle): { internallyConsistent: boolean; reasons: string[] } {
  const reasons: string[] = [];

  const custody = verifyCustodyChain(bundle.custodyChain);
  if (!custody.ok) reasons.push(...custody.reasons.map((r) => `Custody chain: ${r}`));

  const deterministicCore = {
    caseId: bundle.caseId,
    verdict: bundle.verdict,
    score: bundle.score,
    corroborationCount: bundle.corroborationCount,
    detectorsFired: bundle.detectorsFired,
    devilAdvocate: bundle.devilAdvocate,
    reasoning: bundle.reasoning,
    evidenceManifest: bundle.evidenceManifest,
  };

  const expectedFingerprint = sha256Hex(canonicalize(deterministicCore));
  if (expectedFingerprint !== bundle.analysisFingerprint) {
    reasons.push("Analysis fingerprint mismatch — analysis content altered after sealing.");
  }

  const custodyTip =
    bundle.custodyChain.events.length === 0
      ? bundle.custodyChain.genesisHash
      : bundle.custodyChain.events[bundle.custodyChain.events.length - 1]!.entryHash;

  const expectedBundleHash = sha256Hex(canonicalize({ ...deterministicCore, sealedAt: bundle.sealedAt, custodyTip }));
  if (expectedBundleHash !== bundle.bundleHash) {
    reasons.push("Bundle hash mismatch — timestamp or custody chain altered.");
  }

  if (bundle.verdict === "MALICE" && bundle.corroborationCount < 2) {
    reasons.push("MALICE without >= 2 corroborating sources — Daubert gate violated.");
  }
  if (bundle.verdict === "MALICE" && bundle.devilAdvocate.trim().length === 0) {
    reasons.push("MALICE without a devil's-advocate counter-argument.");
  }

  return { internallyConsistent: reasons.length === 0, reasons };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node verify.js path/to/bundle.json");
    process.exit(2);
  }

  let bundle: SealedBundle;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = parseStrict(raw);
    assertLooksLikeBundle(parsed);
    bundle = parsed;
  } catch (err) {
    // F12: a judge gets a sentence, not a stack trace. Still fails closed.
    console.log(`file: ${path}`);
    console.log("internally consistent: NO");
    console.log(`  - Could not read this as a sealed bundle: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const result = verifyBundle(bundle);

  console.log(`case: ${bundle.caseId}`);
  console.log(`verdict: ${bundle.verdict}`);
  console.log(`bundle hash: ${bundle.bundleHash}`);
  console.log(`analysis fingerprint: ${bundle.analysisFingerprint}`);
  console.log(`internally consistent: ${result.internallyConsistent ? "YES" : "NO"}`);
  for (const reason of result.reasons) {
    console.log(`  - ${reason}`);
  }
  console.log("");
  console.log("This does NOT establish who produced this bundle, or when.");
  console.log("It establishes only that the bundle is consistent with itself.");
  console.log("Authenticity is anchored by the on-chain attestation, which is not part of this build.");

  process.exit(result.internallyConsistent ? 0 : 1);
}

// Only run the CLI when executed directly, so the conformance test can
// import canonicalize() from this file without triggering it.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  main();
}
