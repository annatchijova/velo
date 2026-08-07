#!/usr/bin/env node
/**
 * End-to-end simulation — the backbone of the pitch video.
 *
 * Follows the 4-step story from 00_VELO_MASTER.md §6:
 *   1. Analyze evidence locally (air-gapped, in spirit)
 *   2. Seal the bundle, generate the local proof of correctness
 *   3. Attest on Midnight (STUBBED — the contract isn't deployed in
 *      this build; this step is narrated, not simulated, so the demo
 *      never overclaims what's real)
 *   4. Verify independently, offline
 *
 * Then runs the single most important moment for the pitch: an attempt
 * to attest MALICE without enough corroboration, shown failing live.
 */

import { runAllDetectors } from "./engine/detectors.js";
import type { Artifact } from "./engine/evidence.js";
import { score } from "./engine/scorer.js";
import { sealBundle, verifyBundle } from "./seal/bundle.js";
import { createCustodyChain, appendCustodyEvent, verifyCustodyChain } from "./seal/custody.js";

function section(title: string): void {
  console.log(`\n${"=".repeat(70)}`);
  console.log(title);
  console.log("=".repeat(70));
}

function step(label: string, detail: string): void {
  console.log(`\n  [${label}] ${detail}`);
}

const maliceCase: Artifact[] = [
  {
    id: "a-mail",
    type: "log",
    timestamp: "2026-08-07T14:20:00Z",
    source: "mail_gateway",
    process: "mail_gateway",
    path: "mail://analyst@corp.example",
    entropyMilliBits: 4500,
    markers: ["effect_event", "narrative_poisoning"],
    description: "Self-reported confession mail, sent before the incident it claims to react to.",
    provenanceChain: ["sha256:mail01"],
  },
  {
    id: "a-cron",
    type: "registry",
    timestamp: "2026-08-07T14:25:00Z",
    source: "windows_registry",
    process: "windows_registry",
    path: "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\SystemUpdate",
    entropyMilliBits: 3200,
    markers: ["cause_event", "log_cleared"],
    description: "Scheduled task created before the confession — premeditation.",
    provenanceChain: ["sha256:cron01"],
  },
  {
    id: "a-net",
    type: "network",
    timestamp: "2026-08-07T14:35:00Z",
    source: "network_capture",
    process: "svchost.exe",
    path: "conn://203.0.113.9:443",
    entropyMilliBits: 6800,
    markers: ["process_masquerade", "unusual_path"],
    description: "Large outbound transfer during the benign audit window.",
    provenanceChain: ["sha256:net01"],
  },
];

async function main() {
  section("VELO — end-to-end simulation");
  console.log("Case: VELO-DEMO — 'The Confession That Came First'");
  console.log("All evidence below is 100% synthetic. Zero PII, zero real incidents.");

  section("STEP 1 — Analyze locally (the expert's own machine, air-gapped in spirit)");
  step("INPUT", `${maliceCase.length} synthetic artifacts: a confession email, a scheduled task, a network transfer.`);
  const detectorResults = runAllDetectors(maliceCase);
  for (const d of detectorResults) {
    step(d.fired ? "FIRED" : "clean", `${d.name}: ${d.fired ? d.fractures.join(", ") : "no markers"}`);
  }

  const devilAdvocate =
    "The confession could suggest good faith, but the scheduled task predates it by 5 minutes — the 'reaction' cannot be a reaction to something that hadn't happened yet. Premeditation, not honesty.";
  const result = score({ detectorResults, devilAdvocate, custodyValid: true });
  step("VERDICT", `${result.verdict} (score ${result.score.toDisplayString()}, ${result.corroborationCount} independent sources)`);
  step("REASONING", result.reasoning);

  section("STEP 2 — Seal the bundle (still local, nothing has touched the network)");
  let chain = createCustodyChain("VELO-DEMO");
  chain = appendCustodyEvent(chain, "IDENTIFIED", "2026-08-07T14:00:00Z", "evidence identified");
  chain = appendCustodyEvent(chain, "ACQUIRED", "2026-08-07T14:05:00Z", "forensic image acquired");
  chain = appendCustodyEvent(chain, "PRESERVED", "2026-08-07T14:10:00Z", "read-only preservation");
  chain = appendCustodyEvent(chain, "ANALYZED", "2026-08-07T14:40:00Z", "deterministic engine ran");

  const manifest = { caseId: "VELO-DEMO", artifacts: maliceCase };
  const bundle = sealBundle("VELO-DEMO", new Date().toISOString(), result, manifest, chain);
  step("BUNDLE HASH", bundle.bundleHash);
  step("ANALYSIS FINGERPRINT", bundle.analysisFingerprint);
  step("NOTE", "The evidence itself never appears in the bundle hash's neighborhood — only hashes and the verdict do.");

  section("STEP 3 — Attest on Midnight");
  step("STATUS", "PENDING — this build has no deployed Compact contract yet (Capa 2, requires a machine that can run the compiler).");
  step("WHAT WOULD HAPPEN", "commitment + ZK proof published to testnet; the world sees the verdict and the corroboration count, never the evidence.");

  section("STEP 4 — Verify independently and offline");
  const verification = verifyBundle(bundle);
  step("VALID", String(verification.valid));
  const custodyCheck = verifyCustodyChain(bundle.custodyChain);
  step("CUSTODY CHAIN", `${custodyCheck.valid} — ${custodyCheck.reason}`);

  section("THE MOMENT THAT MATTERS — trying to force a MALICE without enough corroboration");
  console.log("\nSame kind of evidence, but only ONE independent source this time.");
  const insufficientCase: Artifact[] = [maliceCase[1]!]; // only the cron artifact — a single source
  const insufficientResults = runAllDetectors(insufficientCase);
  const insufficientScore = score({
    detectorResults: insufficientResults,
    devilAdvocate: "Trying to force it anyway.",
    custodyValid: true,
  });
  step("ATTEMPTED VERDICT", insufficientScore.verdict);
  step("WHY", insufficientScore.reasoning);
  console.log(
    insufficientScore.verdict === "MALICE"
      ? "\n  !! THIS WOULD BE A BUG — MALICE reached with < 2 sources !!"
      : "\n  Correctly refused. The Daubert corroboration gate held — this is not a promise, it's a constraint.",
  );

  section("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
