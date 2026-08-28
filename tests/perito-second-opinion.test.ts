/**
 * Layer 7 — blind second opinion: commit-reveal blindness, the distinct-examiner
 * nullifier, and agreement (the corpus centerpiece: PERITO-003 + PERITO-004 on
 * VELO-005 both reach MALICE -> AGREE, without either verdict being visible
 * before both committed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SecondOpinionBoard,
  SecondOpinionError,
  makeVerdictCommitment,
  opinionNullifier,
  generateOpinionNonce,
} from "../src/perito/second_opinion.js";

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
