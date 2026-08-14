import { test } from "node:test";
import assert from "node:assert/strict";
import { OBVIOUS_BAIT_TERMS, wordSearch, obviousBaitHits, ecoOverinterpretation } from "../src/engine/eco.js";
import { detectSceneStaging, runAllDetectors } from "../src/engine/detectors.js";
import { score } from "../src/engine/scorer.js";
import { sealBundle } from "../src/seal/bundle.js";
import { createCustodyChain, appendCustodyEvent } from "../src/seal/custody.js";
import type { Artifact } from "../src/engine/evidence.js";

/**
 * Parity fixtures pinned from a live run of the Python original
 * (`vigia/core/eco_check.py`, executed 2026-08-14). The sealable decision
 * (booleans, hit lists) must match the Python bit for bit; the float
 * `obvious_ratio` is a report field and exempt from parity by design.
 */

test("OBVIOUS_BAIT_TERMS is the verbatim VIGIA vocabulary (50 terms, frozen)", () => {
  assert.equal(OBVIOUS_BAIT_TERMS.length, 50);
  assert.ok(Object.isFrozen(OBVIOUS_BAIT_TERMS));
  // Spot anchors across the three doctrine blocks of the vocabulary.
  assert.ok(OBVIOUS_BAIT_TERMS.includes("hack"));
  assert.ok(OBVIOUS_BAIT_TERMS.includes("contraseña"));
  assert.ok(OBVIOUS_BAIT_TERMS.includes("mimikatz"));
  assert.ok(OBVIOUS_BAIT_TERMS.includes("c&c"));
  assert.ok(OBVIOUS_BAIT_TERMS.includes("tor exit"));
  // The deliberate duplicate is preserved (hit-list parity depends on it).
  assert.ok(OBVIOUS_BAIT_TERMS.includes("virustotal"));
  assert.ok(OBVIOUS_BAIT_TERMS.includes("VirusTotal"));
});

test("wordSearch matches the Python word_search on the pinned parity cases", () => {
  const cases: Array<[string, string, boolean]> = [
    ["hack", "the hacker toolkit", false], // word boundary: no substring match
    ["hack", "a clean hack indeed", true],
    ["c&c", "beacon to c&c server", true], // special char: space boundaries
    ["c&c", "beacon to c&cs server", false],
    ["tor exit", "a tor exit node", true],
    ["port scan", "port scanning activity", false],
    ["port scan", "a port scan happened", true],
    ["contraseña", "mi contraseña es segura", true], // non-ASCII term
    ["contraseña", "las contraseñas rotan", false],
    ["", "anything", false], // empty term never matches
    ["root", "the root cause", true],
  ];
  for (const [term, text, expected] of cases) {
    assert.equal(wordSearch(term, text), expected, `wordSearch(${JSON.stringify(term)}, ${JSON.stringify(text)})`);
  }
});

test("obviousBaitHits matches the Python hit lists, including order and duplicates", () => {
  const cases: Array<[string, string[]]> = [
    ["Scheduled task created before the confession.", []],
    // "credentials" does NOT hit "credential" — word boundary, verified in Python.
    ["Authorization memo: run mimikatz and dump lsass credentials, per policy.", ["mimikatz", "lsass", "dump"]],
    [
      "Known russian ISP range flagged; tor exit node observed; c&c beacon to botnet.",
      ["russian isp", "known russian", "isp range", "tor exit", "c&c", "botnet"],
    ],
    ["The hacker toolkit was rehacked by hackers.", []],
    ["hack", ["hack"]],
    ["User changed their contraseña after the reset email.", ["contraseña"]],
    ["port scan from 10.0.0.5 followed by lateral movement and exfil to C2.", ["c2", "exfil", "lateral", "port scan"]],
    // Both vocabulary entries hit, exactly as in Python.
    ["VirusTotal report attached for the blocked ip.", ["virustotal", "VirusTotal"]],
    ["[ERROR] disk failure on volume 2", []],
    ["command and control", ["command and control"]],
    ["no bait here, just a quiet file copy", []],
    ["", []],
    ["  c&c  ", ["c&c"]],
    ["c&cs are not a word boundary match", []],
  ];
  for (const [text, expected] of cases) {
    assert.deepEqual(obviousBaitHits(text), expected, `obviousBaitHits(${JSON.stringify(text)})`);
  }
});

test("ecoOverinterpretation: strict integer predicate 2*hits > n (Python parity)", () => {
  // Majority bait (4 of 5) => staged.
  const majority = ecoOverinterpretation([
    "mimikatz dump found on desktop",
    "ransomware note left in every folder",
    "clean system log",
    "tor exit node in browser history",
    "cobalt strike beacon config",
  ]);
  assert.equal(majority.staged, true);
  assert.equal(majority.hits.length, 4);

  // Exactly half (2 of 4) => NOT staged: the predicate is strict `>`.
  const half = ecoOverinterpretation([
    "mimikatz on disk",
    "backdoor listed in startup",
    "routine patch applied",
    "user logged in from office",
  ]);
  assert.equal(half.staged, false);
  assert.equal(half.hits.length, 2);

  assert.equal(ecoOverinterpretation(["routine patch applied", "user logged in from office", "backup completed"]).staged, false);
  assert.equal(ecoOverinterpretation([]).staged, false);
  // A single bait-laden artifact IS a majority of one.
  assert.equal(ecoOverinterpretation(["obvious malware dropper on desktop"]).staged, true);
});

function artifact(id: string, description: string, provenance: string): Artifact {
  return {
    id,
    type: "file",
    timestamp: "2026-08-07T14:20:00Z",
    source: `src-${id}`,
    process: "n/a",
    path: `/evidence/${id}`,
    entropyMilliBits: 4000,
    markers: [],
    description,
    provenanceChain: [provenance],
  };
}

test("detectSceneStaging fires POSSIBLE_SCENE_STAGING only past the strict majority", () => {
  const staged = [
    artifact("s1", "mimikatz dump found on desktop", "sha256:p1"),
    artifact("s2", "ransomware note left in every folder", "sha256:p2"),
    artifact("s3", "clean system log", "sha256:p3"),
  ];
  const fired = detectSceneStaging(staged);
  assert.equal(fired.fired, true);
  assert.deepEqual(fired.fractures, ["POSSIBLE_SCENE_STAGING"]);
  // Set-level claim: no per-artifact corroboration credit — prose
  // vocabulary must not inflate the Daubert independent-source count.
  assert.deepEqual(fired.contributingArtifactIds, []);
  assert.equal(fired.weight.toString(), "1/4");

  const half = detectSceneStaging([
    artifact("h1", "mimikatz on disk", "sha256:p1"),
    artifact("h2", "routine patch applied", "sha256:p2"),
  ]);
  assert.equal(half.fired, false);
  assert.deepEqual(half.fractures, []);
  assert.deepEqual(half.contributingArtifactIds, []);
  assert.equal(half.weight.toString(), "0/1");
});

test("gate D1: a bait-laden devil's advocate is recorded as a signal and does not weaken MALICE", () => {
  // Two independent provenance roots, bait-heavy descriptions: the scene
  // staging detector plus anti-forensic markers push the score over the
  // MALICE threshold with the required corroboration.
  const artifacts: Artifact[] = [
    { ...artifact("d1", "mimikatz dump and ransomware note on desktop", "sha256:rootA"), markers: ["log_cleared", "effect_before_cause"] },
    { ...artifact("d2", "tor exit node beacon to botnet observed", "sha256:rootB"), markers: ["narrative_poisoning"] },
  ];
  const detectorResults = runAllDetectors(artifacts);
  const withBait = score({
    detectorResults,
    artifacts,
    devilAdvocate: "The authorization memo covered mimikatz use during the pentest window.",
    custodyValid: true,
  });
  assert.equal(withBait.verdict, "MALICE");
  assert.match(withBait.reasoning, /Gate D1 \(Eco filter\)/);
  assert.match(withBait.reasoning, /mimikatz/);

  // A clean counter-argument produces the same verdict with no D1 note:
  // the gate annotates, it never moves the verdict in either direction.
  const clean = score({
    detectorResults,
    artifacts,
    devilAdvocate: "A scheduled maintenance job could explain the log rotation.",
    custodyValid: true,
  });
  assert.equal(clean.verdict, "MALICE");
  assert.doesNotMatch(clean.reasoning, /Gate D1/);
});

test("determinism: sealing a scene-staging case twice yields identical hashes (no float leaked)", () => {
  const artifacts = [
    artifact("z1", "mimikatz dump found on desktop", "sha256:pA"),
    artifact("z2", "cobalt strike beacon config", "sha256:pB"),
    artifact("z3", "clean system log", "sha256:pC"),
  ];
  const detectorResults = runAllDetectors(artifacts);
  assert.equal(detectorResults.find((d) => d.name === "scene_staging")?.fired, true);
  const scoreResult = score({ detectorResults, artifacts, devilAdvocate: "", custodyValid: true });

  let chain = createCustodyChain("VELO-ECO-DET-001");
  chain = appendCustodyEvent(chain, "ACQUIRED", "2026-08-07T14:00:00Z", "synthetic acquisition");

  const sealedAt = "2026-08-14T12:00:00Z";
  const manifest = { caseId: "VELO-ECO-DET-001", artifacts };
  const a = sealBundle("VELO-ECO-DET-001", sealedAt, scoreResult, manifest, chain);
  const b = sealBundle("VELO-ECO-DET-001", sealedAt, scoreResult, manifest, chain);
  assert.equal(a.analysisFingerprint, b.analysisFingerprint);
  assert.equal(a.bundleHash, b.bundleHash);
});
