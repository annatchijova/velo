import { test } from "node:test";
import assert from "node:assert/strict";
import { runAllDetectors } from "../src/engine/detectors.js";
import type { Artifact, CoverageGap } from "../src/engine/evidence.js";
import { score } from "../src/engine/scorer.js";

/**
 * A coverage gap is a source that should have been examined and was not.
 *
 * Before this existed, "I looked and found nothing" and "I could not look
 * where it mattered" both came out as NOISE — a true negative and an
 * unknown wearing the same label. That is the overclaim this system
 * exists to prevent, made by the system itself.
 *
 * The rule is deliberately narrow: a gap undermines a NEGATIVE finding
 * only. Corroborated MALICE is not erased because an unrelated log
 * rotated; the gap casts doubt on the claim that nothing is there, not on
 * the evidence of what is.
 */

const GAPS: CoverageGap[] = [
  { expected: "Domain controller authentication log", reason: "rotated before acquisition" },
];

function benign(): Artifact[] {
  return [
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
}

function corroboratedMalice(): Artifact[] {
  return [
    {
      id: "a-mail",
      type: "log",
      timestamp: "2026-08-07T14:20:00Z",
      source: "mail_gateway",
      process: "mail_gateway",
      path: "mail://x",
      entropyMilliBits: 4500,
      markers: ["effect_event", "narrative_poisoning"],
      description: "confession",
      provenanceChain: ["sha256:acq-mail"],
    },
    {
      id: "a-cron",
      type: "registry",
      timestamp: "2026-08-07T14:25:00Z",
      source: "windows_registry",
      process: "windows_registry",
      path: "HKLM\\x",
      entropyMilliBits: 3200,
      markers: ["cause_event", "log_cleared"],
      description: "cron",
      provenanceChain: ["sha256:acq-workstation"],
    },
  ];
}

test("no gaps: a clean examination is still NOISE", () => {
  const artifacts = benign();
  const r = score({
    detectorResults: runAllDetectors(artifacts),
    artifacts,
    devilAdvocate: "",
    custodyValid: true,
  });
  assert.equal(r.verdict, "NOISE");
});

test("a gap turns 'nothing found' into ABSTAIN, not NOISE", () => {
  const artifacts = benign();
  const r = score({
    detectorResults: runAllDetectors(artifacts),
    artifacts,
    devilAdvocate: "",
    custodyValid: true,
    coverageGaps: GAPS,
  });

  assert.equal(r.verdict, "ABSTAIN", "an unexamined source makes a negative finding unsupportable");
  assert.match(r.reasoning, /could not be examined/);
  assert.match(r.reasoning, /rotated before acquisition/, "the reason must reach the reader, not just the count");
});

test("a gap does NOT weaken a corroborated positive finding", () => {
  const artifacts = corroboratedMalice();
  const withGap = score({
    detectorResults: runAllDetectors(artifacts),
    artifacts,
    devilAdvocate: "The confession predates its own cause.",
    custodyValid: true,
    coverageGaps: GAPS,
  });

  assert.equal(withGap.verdict, "MALICE", "evidence of what IS there survives a gap elsewhere");
  assert.ok(withGap.corroborationCount >= 2);
});

test("the declared gaps travel with the result", () => {
  const artifacts = benign();
  const r = score({
    detectorResults: runAllDetectors(artifacts),
    artifacts,
    devilAdvocate: "",
    custodyValid: true,
    coverageGaps: GAPS,
  });
  assert.deepEqual(r.coverageGaps, GAPS, "a reader must be able to see what was not examined");
});

test("a broken custody chain still wins over everything, gaps included", () => {
  const artifacts = corroboratedMalice();
  const r = score({
    detectorResults: runAllDetectors(artifacts),
    artifacts,
    devilAdvocate: "x",
    custodyValid: false,
    coverageGaps: GAPS,
  });
  assert.equal(r.verdict, "ABSTAIN");
  assert.match(r.reasoning, /Custody chain/);
});

test("zero evidence with no declared gap is still NOISE — the gap must be declared, not inferred", () => {
  // The engine cannot know what was never collected. Silence is not a
  // gap; someone has to say so. This documents that boundary rather than
  // leaving it to be discovered.
  const r = score({ detectorResults: runAllDetectors([]), artifacts: [], devilAdvocate: "", custodyValid: true });
  assert.equal(r.verdict, "NOISE");
});
