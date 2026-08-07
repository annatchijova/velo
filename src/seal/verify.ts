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
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const CANONICALIZE_VERSION = 1;

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

function canonicalizeValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isInteger(value) || !Number.isFinite(value)) {
      throw new Error(`canonicalize: value ${value} is not an allowed integer`);
    }
    return value.toString();
  }
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (Array.isArray(value)) return `[${value.map(canonicalizeValue).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((k) => `${JSON.stringify(k.normalize("NFC"))}:${canonicalizeValue(record[k])}`).join(",")}}`;
  }
  throw new Error(`canonicalize: unsupported type ${typeof value}`);
}

function canonicalize(value: unknown): string {
  return `v${CANONICALIZE_VERSION}:${canonicalizeValue(value)}`;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function genesisHash(caseId: string): string {
  return sha256Hex(`VELO_GENESIS:${caseId}`);
}

function verifyCustodyChain(chain: CustodyChain): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const expectedGenesis = genesisHash(chain.caseId);
  if (chain.genesisHash !== expectedGenesis) {
    reasons.push("Genesis hash does not match case ID.");
    return { valid: false, reasons };
  }

  let prevHash = chain.genesisHash;
  for (const event of chain.events) {
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

  return { valid: reasons.length === 0, reasons };
}

function verifyBundle(bundle: SealedBundle): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];

  const custody = verifyCustodyChain(bundle.custodyChain);
  if (!custody.valid) reasons.push(...custody.reasons.map((r) => `Custody chain: ${r}`));

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

  const expectedBundleHash = sha256Hex(
    canonicalize({ ...deterministicCore, sealedAt: bundle.sealedAt, custodyTip }),
  );
  if (expectedBundleHash !== bundle.bundleHash) {
    reasons.push("Bundle hash mismatch — timestamp or custody chain altered.");
  }

  if (bundle.verdict === "MALICE" && bundle.corroborationCount < 2) {
    reasons.push("MALICE without >= 2 corroborating sources — Daubert gate violated.");
  }
  if (bundle.verdict === "MALICE" && bundle.devilAdvocate.trim().length === 0) {
    reasons.push("MALICE without a devil's-advocate counter-argument.");
  }

  return { valid: reasons.length === 0, reasons };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node verify.js path/to/bundle.json");
    process.exit(2);
  }
  const bundle = JSON.parse(readFileSync(path, "utf8"));
  const result = verifyBundle(bundle);

  console.log(`case: ${bundle.caseId}`);
  console.log(`verdict: ${bundle.verdict}`);
  console.log(`bundle hash: ${bundle.bundleHash}`);
  console.log(`analysis fingerprint: ${bundle.analysisFingerprint}`);
  console.log(`valid: ${result.valid}`);
  for (const reason of result.reasons) {
    console.log(`  - ${reason}`);
  }
  process.exit(result.valid ? 0 : 1);
}

main();
