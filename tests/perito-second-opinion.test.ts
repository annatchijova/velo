/**
 * Layer 7 — blind second opinion: commit-reveal blindness, the distinct-examiner
 * nullifier, and agreement (the corpus centerpiece: PERITO-003 + PERITO-004 on
 * VELO-005 both reach MALICE -> AGREE, without either verdict being visible
 * before both committed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  SecondOpinionBoard,
  SecondOpinionError,
  makeVerdictCommitment,
  opinionNullifier,
  generateOpinionNonce,
  evidenceCaseCommitment,
} from "../src/perito/second_opinion.js";
import { analyzeCase, sealAnalysis } from "../src/core/operations.js";
import { artifactSchema, type Artifact } from "../src/engine/evidence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(__dirname, "..", "..", "cases");
function loadCaseFile(file: string): any {
  return JSON.parse(readFileSync(path.join(CASES_DIR, file), "utf8"));
}

// Stand-in case_commitment and two distinct examiner leaf secret keys standing
// for VELO-PERITO-003 and VELO-PERITO-004.
const CASE = "a".repeat(64);
const keyA = "11".repeat(32); // PERITO-003
const keyB = "22".repeat(32); // PERITO-004

test("blindness: no verdict can be revealed until BOTH opinions are committed", () => {
  const board = new SecondOpinionBoard(CASE);
  const nA = generateOpinionNonce();
  board.commit(makeVerdictCommitment("MALICE", nA), opinionNullifier(keyA, CASE));
  // Only one committed: revealing now would let the second examiner see it first.
  assert.throws(() => board.reveal("MALICE", nA), SecondOpinionError);

  const nB = generateOpinionNonce();
  board.commit(makeVerdictCommitment("MALICE", nB), opinionNullifier(keyB, CASE));
  assert.equal(board.status().agreement, "PENDING", "still pending until both reveal");
  board.reveal("MALICE", nA);
  board.reveal("MALICE", nB);
  assert.equal(board.status().agreement, "AGREE");
});

test("a verdict commitment leaks nothing about the verdict", () => {
  const n = "ab".repeat(32);
  const cMalice = makeVerdictCommitment("MALICE", n);
  const cNoise = makeVerdictCommitment("NOISE", n);
  assert.match(cMalice, /^[0-9a-f]{64}$/);
  assert.notEqual(cMalice, cNoise, "different verdicts must commit differently");
  assert.ok(!cMalice.includes("MALICE"));
  // Different nonce, same verdict -> different commitment (hiding).
  assert.notEqual(makeVerdictCommitment("MALICE", "cd".repeat(32)), cMalice);
});

test("nullifier: the same examiner cannot opine twice; two distinct examiners can", () => {
  const board = new SecondOpinionBoard(CASE);
  board.commit(makeVerdictCommitment("MALICE", generateOpinionNonce()), opinionNullifier(keyA, CASE));
  assert.throws(
    () => board.commit(makeVerdictCommitment("NOISE", generateOpinionNonce()), opinionNullifier(keyA, CASE)),
    SecondOpinionError,
    "same examiner (same nullifier) must be rejected",
  );
  board.commit(makeVerdictCommitment("MALICE", generateOpinionNonce()), opinionNullifier(keyB, CASE));
  assert.equal(board.status().commitCount, 2);
});

test("nullifier is deterministic, case-scoped, and examiner-scoped", () => {
  assert.equal(opinionNullifier(keyA, CASE), opinionNullifier(keyA, CASE), "deterministic");
  assert.notEqual(opinionNullifier(keyA, CASE), opinionNullifier(keyA, "b".repeat(64)), "different case -> different nullifier");
  assert.notEqual(opinionNullifier(keyA, CASE), opinionNullifier(keyB, CASE), "different examiner -> different nullifier");
});

test("corpus centerpiece: PERITO-003 + PERITO-004 both MALICE on VELO-005 -> AGREE", () => {
  const board = new SecondOpinionBoard(CASE);
  const n3 = generateOpinionNonce();
  const n4 = generateOpinionNonce();
  board.commit(makeVerdictCommitment("MALICE", n3), opinionNullifier(keyA, CASE)); // 003
  board.commit(makeVerdictCommitment("MALICE", n4), opinionNullifier(keyB, CASE)); // 004
  assert.equal(board.status().agreement, "PENDING", "no verdict visible until both reveal");
  board.reveal("MALICE", n3);
  board.reveal("MALICE", n4);
  const s = board.status();
  assert.equal(s.agreement, "AGREE");
  assert.deepEqual(s.revealedVerdicts, ["MALICE", "MALICE"]);
});

test("disagreement -> CONTRADICT; an ABSTAIN against a MALICE is not agreement", () => {
  const board = new SecondOpinionBoard(CASE);
  const n3 = generateOpinionNonce();
  const n4 = generateOpinionNonce();
  board.commit(makeVerdictCommitment("MALICE", n3), opinionNullifier(keyA, CASE));
  board.commit(makeVerdictCommitment("ABSTAIN", n4), opinionNullifier(keyB, CASE));
  board.reveal("MALICE", n3);
  board.reveal("ABSTAIN", n4);
  assert.equal(board.status().agreement, "CONTRADICT");
});

test("reveal integrity: wrong nonce or wrong verdict is rejected", () => {
  const board = new SecondOpinionBoard(CASE);
  const n3 = generateOpinionNonce();
  const n4 = generateOpinionNonce();
  board.commit(makeVerdictCommitment("MALICE", n3), opinionNullifier(keyA, CASE));
  board.commit(makeVerdictCommitment("MALICE", n4), opinionNullifier(keyB, CASE));
  assert.throws(() => board.reveal("MALICE", "00".repeat(32)), SecondOpinionError, "wrong nonce");
  assert.throws(() => board.reveal("NOISE", n3), SecondOpinionError, "wrong verdict for that commitment");
});

test("a third opinion is rejected", () => {
  const board = new SecondOpinionBoard(CASE);
  board.commit(makeVerdictCommitment("MALICE", generateOpinionNonce()), opinionNullifier(keyA, CASE));
  board.commit(makeVerdictCommitment("MALICE", generateOpinionNonce()), opinionNullifier(keyB, CASE));
  const keyC = "33".repeat(32);
  assert.throws(
    () => board.commit(makeVerdictCommitment("MALICE", generateOpinionNonce()), opinionNullifier(keyC, CASE)),
    SecondOpinionError,
  );
});

test("determinism boundary: nullifier byte-stable, verdict commitment nonce-varying", () => {
  assert.equal(opinionNullifier(keyA, CASE), opinionNullifier(keyA, CASE));
  const a = makeVerdictCommitment("MALICE", generateOpinionNonce());
  const b = makeVerdictCommitment("MALICE", generateOpinionNonce());
  assert.notEqual(a, b, "hiding commitment must not be reproducible without the nonce");
});

// --- case_commitment is the REAL Layer 2 evidence root, not a synthetic hash ---

test("case_commitment equals the evidence root a GENUINE seal produces (not a string hash)", () => {
  const caseObj = loadCaseFile("VELO-005-convergencia.json");
  // Seal the case through the real Layer 2 pipeline, parsing artifacts at the
  // same boundary the MCP server does (so _es fields are stripped identically).
  const artifacts = caseObj.artifacts.map((a: unknown) => artifactSchema.parse(a)) as unknown as Artifact[];
  const custodyEvents = (caseObj.custodyEvents ?? []).map((e: any) => ({ eventType: e.eventType, timestamp: e.timestamp, detail: e.detail ?? "" }));
  const analysis = analyzeCase({ caseId: caseObj.case_id, artifacts, devilAdvocate: caseObj.devil_advocate ?? "", custodyEvents, coverageGaps: [] });
  const bundle = sealAnalysis(caseObj.case_id, artifacts, analysis);

  const cc = evidenceCaseCommitment(caseObj);
  assert.equal(cc.hex, bundle.evidenceRoot, "the case_commitment must be the sealed bundle's evidence root");
  assert.match(cc.hex, /^[0-9a-f]{64}$/);
  assert.equal(cc.bytes.length, 32, "32 bytes, a drop-in Bytes<32>");
  // And decidedly NOT the old synthetic hash of the caseId string.
  const synthetic = createHash("sha256").update(`velo:SYNTHETIC-case-commitment:v1:${caseObj.case_id}`).digest("hex");
  assert.notEqual(cc.hex, synthetic, "must no longer be sha256 of the caseId string");
});

test("two examiners on the same case share the commitment; different cases differ", () => {
  const v005 = evidenceCaseCommitment(loadCaseFile("VELO-005-convergencia.json"));
  const v005again = evidenceCaseCommitment(loadCaseFile("VELO-005-convergencia.json"));
  const v006 = evidenceCaseCommitment(loadCaseFile("VELO-006-vacio-quirurgico.json"));
  assert.equal(v005.hex, v005again.hex, "same evidence -> same commitment (shared by both examiners)");
  assert.notEqual(v005.hex, v006.hex, "different evidence -> different commitment");
});

test("a case with no artifacts is rejected, not committed to an empty set", () => {
  assert.throws(() => evidenceCaseCommitment({ case_id: "EMPTY", artifacts: [] }), SecondOpinionError);
});
