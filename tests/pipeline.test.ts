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

test("MALICE requires >= 2 INDEPENDENT SOURCES — the star test (red team F2)", () => {
  // One physical source (a single disk image, one provenance root), but
  // carrying markers from four different detector categories. Before the
  // F2 fix this reported "corroborationCount: 4" and reached MALICE off
  // one artifact — the exact scenario that made the project's central
  // claim ("two independent corroborating sources") untrue.
  const oneSourceManyCategories: Artifact[] = [
    {
      id: "a-single-image",
      type: "file",
      timestamp: "2026-08-07T14:25:00Z",
      source: "disk_image_alpha",
      process: "n/a",
      path: "/mnt/evidence/alpha.E01",
      entropyMilliBits: 7100,
      markers: ["effect_before_cause", "surgical_deletion", "narrative_poisoning", "process_masquerade"],
      description: "A single acquired disk image carrying markers from four categories.",
      provenanceChain: ["sha256:acquisition-alpha"],
    },
  ];

  const detectorResults = runAllDetectors(oneSourceManyCategories);
  assert.equal(
    detectorResults.filter((d) => d.fired).length,
    4,
    "test setup check: four detector categories should fire from this one artifact",
  );

  const result = score({
    detectorResults,
    artifacts: oneSourceManyCategories,
    devilAdvocate: "some counter-argument",
    custodyValid: true,
  });

  assert.equal(result.corroborationCount, 1, "one physical source is one source, however many categories it trips");
  assert.equal(result.detectorCategoriesFired, 4, "categories are still reported — just never mistaken for sources");
  assert.notEqual(result.verdict, "MALICE", "MALICE must never be reachable from a single independent source");
});

test("two artifacts from the SAME provenance root count as one source (red team F2)", () => {
  const sameRoot: Artifact[] = [
    {
      id: "a-one",
      type: "file",
      timestamp: "2026-08-07T14:20:00Z",
      source: "disk_image_alpha",
      process: "n/a",
      path: "/mnt/evidence/alpha/file1",
      entropyMilliBits: 4000,
      markers: ["surgical_deletion"],
      description: "Carved from image alpha.",
      provenanceChain: ["sha256:acquisition-alpha", "sha256:carve-1"],
    },
    {
      id: "a-two",
      type: "file",
      timestamp: "2026-08-07T14:21:00Z",
      source: "disk_image_alpha",
      process: "n/a",
      path: "/mnt/evidence/alpha/file2",
      entropyMilliBits: 4100,
      markers: ["narrative_poisoning"],
      description: "Also carved from image alpha — same acquisition.",
      provenanceChain: ["sha256:acquisition-alpha", "sha256:carve-2"],
    },
  ];

  const result = score({
    detectorResults: runAllDetectors(sameRoot),
    artifacts: sameRoot,
    devilAdvocate: "x",
    custodyValid: true,
  });

  assert.equal(result.corroborationCount, 1, "same acquisition root => one independent source");
});

test("MALICE requires a devil's-advocate counter-argument", () => {
  const artifacts = maliceArtifacts();
  const detectorResults = runAllDetectors(artifacts);
  const result = score({ detectorResults, artifacts, devilAdvocate: "", custodyValid: true });

  assert.notEqual(result.verdict, "MALICE", "MALICE without a devil's-advocate must degrade, not publish");
});

test("full path: enough corroboration + devil's advocate => MALICE", () => {
  const artifacts = maliceArtifacts();
  const detectorResults = runAllDetectors(artifacts);
  const result = score({
    detectorResults,
    artifacts,
    devilAdvocate: "The confession could suggest good faith, but the cron job predates it — premeditation.",
    custodyValid: true,
  });

  assert.equal(result.verdict, "MALICE");
  assert.ok(result.corroborationCount >= 2);
});

test("broken custody chain forces ABSTAIN regardless of score", () => {
  const artifacts = maliceArtifacts();
  const detectorResults = runAllDetectors(artifacts);
  const result = score({ detectorResults, artifacts, devilAdvocate: "x", custodyValid: false });
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
  const result = score({ detectorResults: runAllDetectors(benign), artifacts: benign, devilAdvocate: "", custodyValid: true });
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
  const artifacts = maliceArtifacts();
  const detectorResults = runAllDetectors(artifacts);
  const result = score({
    detectorResults,
    artifacts,
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

  assert.equal(verifyBundle(bundleA).internallyConsistent, true);
});

test("tampered commitment fails verification", () => {
  const artifacts = maliceArtifacts();
  const detectorResults = runAllDetectors(artifacts);
  const result = score({
    detectorResults,
    artifacts,
    devilAdvocate: "Confession predates by the cron job — premeditation, not good faith.",
    custodyValid: true,
  });
  let chain = createCustodyChain("VELO-TEST-003");
  chain = appendCustodyEvent(chain, "IDENTIFIED", "2026-08-07T14:00:00Z", "evidence identified");
  const manifest = { caseId: "VELO-TEST-003", artifacts: maliceArtifacts() };
  const bundle = sealBundle("VELO-TEST-003", "2026-08-07T15:00:00Z", result, manifest, chain);

  const tampered = { ...bundle, verdict: "NOISE" as const };
  const verification = verifyBundle(tampered);
  assert.equal(verification.internallyConsistent, false);
});
