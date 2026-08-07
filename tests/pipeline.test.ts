import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact } from "../src/engine/evidence.js";
import { runAllDetectors } from "../src/engine/detectors.js";
import { score } from "../src/engine/scorer.js";
import { createCustodyChain, appendCustodyEvent, verifyCustodyChain } from "../src/seal/custody.js";
import { sealBundle, verifyBundle } from "../src/seal/bundle.js";

/** A confession email claims to be a spontaneous reaction to an incident,
 * but was sent BEFORE the scheduled task that actually caused the
 * incident was even created — the "reaction" predates its own trigger,
 * which is only possible if the confession was staged in advance. */
function maliceArtifacts(): Artifact[] {
  return [
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
      path: "HKLM\\...\\Run\\SystemUpdate",
      entropyMilliBits: 3200,
      markers: ["cause_event", "log_cleared"],
      description: "Scheduled task created before the confession.",
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
}

test("MALICE requires >= 2 corroborating sources — the star test", () => {
  // Genuinely isolated to ONE detector category (temporal only) — no
  // other marker type present, so exactly one source can corroborate.
  const singleSource: Artifact[] = [
    {
      id: "a-cause-only",
      type: "registry",
      timestamp: "2026-08-07T14:25:00Z",
      source: "windows_registry",
      process: "windows_registry",
      path: "HKLM\\...\\Run\\SystemUpdate",
      entropyMilliBits: 3200,
      markers: ["cause_event"],
      description: "Scheduled task created before the confession.",
      provenanceChain: ["sha256:cron01"],
    },
    {
      id: "a-effect-only",
      type: "log",
      timestamp: "2026-08-07T14:20:00Z",
      source: "mail_gateway",
      process: "mail_gateway",
      path: "mail://analyst@corp.example",
      entropyMilliBits: 4500,
      markers: ["effect_event"],
      description: "Self-reported confession mail, sent before its own supposed cause.",
      provenanceChain: ["sha256:mail01"],
    },
  ];
  const detectorResults = runAllDetectors(singleSource);
  assert.equal(
    detectorResults.filter((d) => d.fired).length,
    1,
    "test setup check: exactly one detector category should fire here",
  );

  const result = score({ detectorResults, devilAdvocate: "some counter-argument", custodyValid: true });
  assert.notEqual(result.verdict, "MALICE", "MALICE must never be reachable with fewer than 2 corroborating sources");
});

test("MALICE requires a devil's-advocate counter-argument", () => {
  const detectorResults = runAllDetectors(maliceArtifacts());
  const result = score({ detectorResults, devilAdvocate: "", custodyValid: true });

  assert.notEqual(result.verdict, "MALICE", "MALICE without a devil's-advocate must degrade, not publish");
});

test("full path: enough corroboration + devil's advocate => MALICE", () => {
  const detectorResults = runAllDetectors(maliceArtifacts());
  const result = score({
    detectorResults,
    devilAdvocate: "The confession could suggest good faith, but the cron job predates it — premeditation.",
    custodyValid: true,
  });

  assert.equal(result.verdict, "MALICE");
  assert.ok(result.corroborationCount >= 2);
});

test("broken custody chain forces ABSTAIN regardless of score", () => {
  const detectorResults = runAllDetectors(maliceArtifacts());
  const result = score({ detectorResults, devilAdvocate: "x", custodyValid: false });
  assert.equal(result.verdict, "ABSTAIN");
});

test("NOISE case: no markers fired at all", () => {
  const benign: Artifact[] = [
    {
      id: "a-normal",
      type: "log",
      timestamp: "2026-08-07T09:00:00Z",
      source: "auth_log",
      process: "sshd",
      path: "/var/log/auth.log",
      entropyMilliBits: 2100,
      markers: [],
      description: "Routine login.",
      provenanceChain: ["sha256:ok01"],
    },
  ];
  const result = score({ detectorResults: runAllDetectors(benign), devilAdvocate: "", custodyValid: true });
  assert.equal(result.verdict, "NOISE");
});

test("custody chain: tampering any entry invalidates the whole chain from that point", () => {
  let chain = createCustodyChain("VELO-TEST-001");
  chain = appendCustodyEvent(chain, "IDENTIFIED", "2026-08-07T14:00:00Z", "evidence identified");
  chain = appendCustodyEvent(chain, "ACQUIRED", "2026-08-07T14:05:00Z", "forensic image acquired");

  const before = verifyCustodyChain(chain);
  assert.equal(before.valid, true);

  const tampered = {
    ...chain,
    events: chain.events.map((e, i) => (i === 0 ? { ...e, detail: "TAMPERED" } : e)),
  };
  const after = verifyCustodyChain(tampered);
  assert.equal(after.valid, false);
});

test("KNOWN LIMITATION: verifyCustodyChain in isolation cannot detect truncation", () => {
  // This test documents a real gap, on purpose -- see the comment on
  // verifyCustodyChain in src/seal/custody.ts. A chain with events
  // removed from the END is internally consistent, because every
  // remaining link still recomputes correctly. Truncation is only
  // actually caught by comparing against an externally-anchored
  // commitment (the on-chain record, Capa 2) -- not by this function
  // alone. If this assertion ever starts failing because someone "fixed"
  // verifyCustodyChain to reject truncation, that's worth a real
  // conversation: it likely means an expected-tip parameter got added,
  // and this test (and the comment it points at) needs updating together.
  let chain = createCustodyChain("VELO-TRUNC-TEST");
  chain = appendCustodyEvent(chain, "IDENTIFIED", "2026-08-07T14:00:00Z", "step 1");
  chain = appendCustodyEvent(chain, "ACQUIRED", "2026-08-07T14:05:00Z", "step 2");
  chain = appendCustodyEvent(chain, "ANALYZED", "2026-08-07T14:10:00Z", "step 3");
  chain = appendCustodyEvent(chain, "SEALED", "2026-08-07T14:15:00Z", "step 4 - the real ending");

  const truncated = { ...chain, events: chain.events.slice(0, 3) };
  const result = verifyCustodyChain(truncated);

  assert.equal(result.valid, true, "documents the known gap -- see comment above and in custody.ts");
});

test("sealed bundle: analysis fingerprint is stable across re-sealing the same analysis, bundle hash is not", () => {
  const detectorResults = runAllDetectors(maliceArtifacts());
  const result = score({
    detectorResults,
    devilAdvocate: "Confession predates by the cron job — premeditation, not good faith.",
    custodyValid: true,
  });

  let chain = createCustodyChain("VELO-TEST-002");
  chain = appendCustodyEvent(chain, "IDENTIFIED", "2026-08-07T14:00:00Z", "evidence identified");
  const manifest = { caseId: "VELO-TEST-002", artifacts: maliceArtifacts() };

  const bundleA = sealBundle("VELO-TEST-002", "2026-08-07T15:00:00Z", result, manifest, chain);
  const bundleB = sealBundle("VELO-TEST-002", "2026-08-07T15:05:00Z", result, manifest, chain);

  assert.equal(bundleA.analysisFingerprint, bundleB.analysisFingerprint, "same analysis, same fingerprint");
  assert.notEqual(bundleA.bundleHash, bundleB.bundleHash, "different seal time, different bundle hash");

  assert.equal(verifyBundle(bundleA).valid, true);
});

test("tampered commitment fails verification", () => {
  const detectorResults = runAllDetectors(maliceArtifacts());
  const result = score({
    detectorResults,
    devilAdvocate: "Confession predates by the cron job — premeditation, not good faith.",
    custodyValid: true,
  });
  let chain = createCustodyChain("VELO-TEST-003");
  chain = appendCustodyEvent(chain, "IDENTIFIED", "2026-08-07T14:00:00Z", "evidence identified");
  const manifest = { caseId: "VELO-TEST-003", artifacts: maliceArtifacts() };
  const bundle = sealBundle("VELO-TEST-003", "2026-08-07T15:00:00Z", result, manifest, chain);

  const tampered = { ...bundle, verdict: "NOISE" as const };
  const verification = verifyBundle(tampered);
  assert.equal(verification.valid, false);
});
