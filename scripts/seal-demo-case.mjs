#!/usr/bin/env node
// Seal a demo case locally, so there is something to attest on-chain.
//
//   npm run build && node scripts/seal-demo-case.mjs [caseId]
//
// The evidence is the canonical VELO story: a confession mail whose
// triggering cron job was created BEFORE it, plus a network artifact from a
// second, independent acquisition. Two distinct provenance roots, so the
// Daubert gate is satisfied honestly rather than by a single source wearing
// two hats.
import { sealCase } from "../dist/src/core/operations.js";

const caseId = process.argv[2] ?? "VELO-DEMO-001";

const result = sealCase({
  caseId,
  artifacts: [
    {
      id: "a-mail",
      type: "log",
      timestamp: "2026-08-07T14:20:00Z",
      source: "mail_gateway",
      process: "mail_gateway",
      path: "mail://analyst@corp.example",
      entropyMilliBits: 4500,
      markers: ["narrative_poisoning"],
      description: "Self-reported confession mail, sent before the incident it claims to react to.",
      provenanceChain: ["sha256:acquisition-mail-01"],
    },
    {
      id: "a-cron",
      type: "registry",
      timestamp: "2026-08-07T14:25:00Z",
      source: "windows_registry",
      process: "windows_registry",
      path: "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\SystemUpdate",
      entropyMilliBits: 3200,
      markers: ["effect_before_cause"],
      description: "Scheduled task created before the confession — the reaction predates its own trigger.",
      provenanceChain: ["sha256:acquisition-registry-02"],
    },
  ],
  devilAdvocate:
    "The public confession could be read as good faith, but the scheduled task predates it by five minutes. A reaction cannot precede the thing it reacts to, so this is premeditation rather than honesty.",
  custodyEvents: [
    { eventType: "IDENTIFIED", timestamp: "2026-08-07T12:30:00Z", detail: "incident flagged" },
    { eventType: "ACQUIRED", timestamp: "2026-08-07T13:00:00Z", detail: "forensic image acquired" },
  ],
});

console.log(`case          : ${result.summary.caseId}`);
console.log(`verdict       : ${result.summary.verdict}`);
console.log(`corroboration : ${result.summary.corroborationCount} (${result.corroboratingSources.join(", ")})`);
console.log(`detectors     : ${result.detectorsFired.join(", ")}`);
console.log(`fingerprint   : ${result.summary.analysisFingerprint}`);
console.log(`saved to      : ${result.savedTo}`);
console.log(`\nreasoning     : ${result.reasoning}`);
console.log(`\nNext:  bun run deploy/attest-case.ts ${result.summary.caseId}`);
