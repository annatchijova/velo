/**
 * Layer 6 — own-vs-others case visibility (the "my cases" data-shaping rule).
 *
 * The perito-facing dashboard is where Layer 6/7 ZK proofs gate what gets
 * rendered. This module produces the SHAPED object the frontend renders; the
 * ZK proof is what authorizes the shaping, and the frontend enforces it. This
 * is engine support for the rule, not the enforcement boundary itself.
 *
 * The rule the synthetic corpus exercises (peritos-syntetic/README.md):
 *
 *  - OWN case (case_id in perito.casesAttested AND its
 *    credential_status_at_attestation is VALID): the examiner sees the full
 *    case object. A case they attested with a credential that was NOT valid at
 *    the time (VELO-PERITO-005's EXPIRED VELO-006) does NOT grant the owner
 *    view — an invalid credential cannot unlock full disclosure, mirroring the
 *    validity gate. Such a case is shaped as "restricted", like anyone else's.
 *
 *  - SOMEONE ELSE'S case (case_id not owned-validly): only
 *    {case_id, name, expected_verdict, expected_corroboration_count}. The
 *    artifacts, devil_advocate, peirce_chain, and — crucially — the attesting
 *    examiner's public_alias stay hidden. The restricted view is built by
 *    copying exactly those four fields, so nothing else can leak by accident.
 *
 *  - UNCLAIMED case (in NO examiner's casesAttested, e.g. VELO-013): must not
 *    appear in ANY examiner's "my cases". It belongs only to a public/pending
 *    queue, and even there without expected_verdict — nobody has attested it,
 *    so there is no verdict to show.
 */

import type { NormalizedPerito } from "./credential.js";

/**
 * A case object as loaded from cases/*.json. Only the fields the visibility
 * rule reads are named; the rest ride along in the full owner view via the
 * index signature and are stripped by the restricted view.
 */
export interface CaseObject {
  case_id: string;
  name: string;
  expected_verdict?: string;
  expected_corroboration_count?: number;
  [key: string]: unknown;
}

/** The only four fields a non-owner examiner may see. */
export interface RestrictedCaseView {
  case_id: string;
  name: string;
  expected_verdict: string | undefined;
  expected_corroboration_count: number | undefined;
}

/** A pending/unclaimed queue entry — no verdict, because none has been attested. */
export interface UnclaimedCaseEntry {
  case_id: string;
  name: string;
}

export type ShapedCase =
  | { view: "owner"; case: CaseObject }
  | { view: "restricted"; case: RestrictedCaseView };

/** True iff `perito` attested `caseId` with a credential that was VALID then. */
export function ownsValidly(perito: NormalizedPerito, caseId: string): boolean {
  return perito.casesAttested.includes(caseId) && perito.credentialStatusAtAttestation[caseId] === "VALID";
}

/** True iff ANY examiner lists `caseId` in casesAttested. */
export function caseIsClaimed(allPeritos: NormalizedPerito[], caseId: string): boolean {
  return allPeritos.some((p) => p.casesAttested.includes(caseId));
}

/** Strip a case down to the four fields a non-owner may see. */
export function restrictedView(caseObj: CaseObject): RestrictedCaseView {
  return {
    case_id: caseObj.case_id,
    name: caseObj.name,
    expected_verdict: caseObj.expected_verdict,
    expected_corroboration_count: caseObj.expected_corroboration_count,
  };
}

/**
 * Shape one case for one examiner, assuming the case is claimed by someone.
 * Owner view for a validly-owned case, restricted view otherwise.
 */
export function shapeCaseForPerito(perito: NormalizedPerito, caseObj: CaseObject): ShapedCase {
  if (ownsValidly(perito, caseObj.case_id)) {
    return { view: "owner", case: caseObj };
  }
  return { view: "restricted", case: restrictedView(caseObj) };
}

/**
 * The "my cases" surface for one examiner: every CLAIMED case, shaped. An
 * unclaimed case is excluded entirely — it appears in no examiner's list.
 */
export function listPeritoCases(perito: NormalizedPerito, allCases: CaseObject[], allPeritos: NormalizedPerito[]): ShapedCase[] {
  return allCases.filter((c) => caseIsClaimed(allPeritos, c.case_id)).map((c) => shapeCaseForPerito(perito, c));
}

/** One unclaimed entry — case_id and name only, never a verdict. */
export function unclaimedQueueEntry(caseObj: CaseObject): UnclaimedCaseEntry {
  return { case_id: caseObj.case_id, name: caseObj.name };
}

/** The public/pending queue: cases no examiner has attested, without verdicts. */
export function unclaimedQueue(allPeritos: NormalizedPerito[], allCases: CaseObject[]): UnclaimedCaseEntry[] {
  return allCases.filter((c) => !caseIsClaimed(allPeritos, c.case_id)).map(unclaimedQueueEntry);
}
