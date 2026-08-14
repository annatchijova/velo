import type { DetectorResult } from "./detectors.js";
import { obviousBaitHits } from "./eco.js";
import type { Artifact, CoverageGap } from "./evidence.js";
import { Fraction } from "./fraction.js";

export type Verdict = "NOISE" | "SUSPICION" | "MALICE" | "ABSTAIN";

export interface ScoreResult {
  verdict: Verdict;
  score: Fraction;
  /**
   * Number of INDEPENDENT SOURCES corroborating the finding — distinct
   * provenance roots among the artifacts that actually made detectors fire.
   *
   * Red team F2: this used to be the number of detector categories that
   * fired, which meant a single artifact carrying markers from four
   * categories reported "corroborationCount: 4". Every document, the
   * pitch, and the ZK circuit claim *independent sources*, so that is now
   * what this measures. `detectorCategoriesFired` is reported separately
   * — it is a different fact and no longer pretends to be this one.
   */
  corroborationCount: number;
  /** How many detector categories fired. Kept, but never mistaken for corroboration. */
  detectorCategoriesFired: number;
  detectorsFired: string[];
  /** The distinct provenance roots that corroborate, for audit. */
  corroboratingSources: string[];
  /** Declared gaps carried through to the sealed bundle, so a reader sees what was not examined. */
  coverageGaps: CoverageGap[];
  /** Non-empty only when verdict === "MALICE". */
  devilAdvocate: string;
  /** Why the verdict landed where it did — for the sealed bundle's audit trail. */
  reasoning: string;
}

// Thresholds, decided once, in lowest terms — never compared as floats.
const MALICE_THRESHOLD = new Fraction(33, 100);
const NOISE_CEILING = new Fraction(8, 100);
const MIN_CORROBORATION_FOR_MALICE = 2;
/**
 * VIGIA B-151a: a lone contributing artifact cannot sustain a
 * high-confidence score, however many detector categories it trips. The
 * cap is verdict-neutral by construction here — one artifact is at most
 * one provenance source, so the Daubert gate already blocks MALICE — but
 * the sealed score itself must not overstate what one artifact supports,
 * and the cap leaves an auditable trace in the reasoning (VIGIA's own
 * fix: a transformation that reduces probative strength must say so).
 */
const SINGLE_ARTIFACT_SCORE_CAP = new Fraction(65, 100);

export interface ScoreInput {
  detectorResults: DetectorResult[];
  /** Needed to resolve which independent source each contributing artifact came from. */
  artifacts: Artifact[];
  /** Required to justify a MALICE verdict — the strongest counter-argument against it. Empty string if none was formed. */
  devilAdvocate: string;
  /** False if the custody chain failed verification — forces ABSTAIN regardless of score. */
  custodyValid: boolean;
  /**
   * Sources that should have been examined and were not. Declared by the
   * analyst; the engine cannot detect what was never collected.
   *
   * These degrade a NEGATIVE finding only. "I found nothing" is not
   * supportable when a relevant source was never looked at — that is an
   * unknown, and it now says so instead of returning NOISE. A positive
   * finding is untouched: corroborated MALICE is not erased because an
   * unrelated log rotated. The gap undermines the claim that nothing is
   * there, not the evidence of what is.
   */
  coverageGaps?: CoverageGap[];
}

/**
 * A source is where evidence physically came from, not which detector
 * noticed it. Two artifacts pulled from the same disk image are one
 * source however many markers they carry between them.
 *
 * Resolution order: the root of the provenance chain (the original
 * acquisition), falling back to the normalized `source` field, falling
 * back to the artifact's own ID (worst case: treat it as its own source,
 * which is the conservative choice only when nothing else is known).
 */
function sourceOf(artifact: Artifact): string {
  const root = artifact.provenanceChain[0];
  // Normalize identically to the `source` fallback below: trim + case-fold.
  // Without the case-fold, two artifacts from one physical source whose
  // declared provenance roots differ only in letter case (e.g. "DISK-IMG-01"
  // vs "disk-img-01") counted as two independent sources, inflating the
  // corroboration count and carrying a SUSPICION over the Daubert gate to
  // MALICE — the verdict that gets hashed into the on-chain commitment. The
  // asymmetry (source case-folded, provenance root not) was red team F20.
  if (root && root.trim().length > 0) return `provenance:${root.trim().toLowerCase()}`;
  if (artifact.source && artifact.source.trim().length > 0) return `source:${artifact.source.trim().toLowerCase()}`;
  return `artifact:${artifact.id}`;
}

export function score(input: ScoreInput): ScoreResult {
  const { detectorResults, artifacts, devilAdvocate, custodyValid } = input;
  const coverageGaps = input.coverageGaps ?? [];

  if (!custodyValid) {
    return {
      verdict: "ABSTAIN",
      score: Fraction.zero(),
      corroborationCount: 0,
      detectorCategoriesFired: 0,
      detectorsFired: [],
      corroboratingSources: [],
      coverageGaps,
      devilAdvocate: "",
      reasoning: "Custody chain failed verification — evidence is inadmissible regardless of what it shows.",
    };
  }

  const fired = detectorResults.filter((d) => d.fired);
  const rawScore = fired.reduce((acc, d) => acc.add(d.weight), Fraction.zero());
  const detectorsFired = fired.map((d) => d.name);

  const byId = new Map(artifacts.map((a) => [a.id, a]));
  const sources = new Set<string>();
  const contributingArtifactIds = new Set<string>();
  for (const d of fired) {
    for (const artifactId of d.contributingArtifactIds) {
      contributingArtifactIds.add(artifactId);
      const artifact = byId.get(artifactId);
      if (artifact) sources.add(sourceOf(artifact));
    }
  }
  const corroboratingSources = [...sources].sort();
  const corroborationCount = corroboratingSources.length;

  // B-151a single-artifact cap (see SINGLE_ARTIFACT_SCORE_CAP). Counts
  // artifacts that actually made detectors fire — VIGIA counts artifacts
  // with a positive adjusted score, which is the same notion here.
  let totalScore = rawScore;
  let capNote = "";
  if (contributingArtifactIds.size < 2 && rawScore.greaterThan(SINGLE_ARTIFACT_SCORE_CAP)) {
    totalScore = SINGLE_ARTIFACT_SCORE_CAP;
    capNote = ` Single-artifact cap (VIGIA B-151a): raw score ${rawScore.toDisplayString()} came from fewer than two contributing artifacts and was capped to ${SINGLE_ARTIFACT_SCORE_CAP.toDisplayString()} — a lone artifact cannot sustain a high-confidence score.`;
  }

  const meetsMaliceThreshold = totalScore.greaterThan(MALICE_THRESHOLD);
  const hasCorroboration = corroborationCount >= MIN_CORROBORATION_FOR_MALICE;

  const base = {
    score: totalScore,
    corroborationCount,
    detectorCategoriesFired: fired.length,
    detectorsFired,
    corroboratingSources,
    coverageGaps,
  };

  if (meetsMaliceThreshold && hasCorroboration) {
    if (devilAdvocate.trim().length === 0) {
      // Fail closed: a MALICE verdict without an articulated counter-argument
      // is not admissible under this system's own Daubert gate. Degrade
      // rather than publish an unscrutinized MALICE.
      return {
        ...base,
        verdict: "SUSPICION",
        devilAdvocate: "",
        reasoning:
          `Score and corroboration both qualify for MALICE, but no devil's-advocate counter-argument was supplied. Degraded to SUSPICION rather than publish an unscrutinized verdict.${capNote}`,
      };
    }
    // Gate D1 (Eco), ported from VIGIA: exculpatory text that itself
    // screams attack vocabulary is a signal, not a refutation. VELO's
    // devil's-advocate never reduces the score (verified against this
    // file: its presence is what ENABLES MALICE under the Daubert
    // scrutiny gate), so there is no reduction to block — the gate here
    // is the pre-emission record that the counter-argument tripped the
    // Eco filter, sealed into the reasoning so a reader weighs it.
    const devilBait = obviousBaitHits(devilAdvocate);
    const d1Note =
      devilBait.length > 0
        ? ` Gate D1 (Eco filter): the devil's-advocate text itself contains obvious-bait vocabulary (${devilBait.join(", ")}) — under the Eco filter an overly obvious refutation is a signal, not a refutation.`
        : "";
    return {
      ...base,
      verdict: "MALICE",
      devilAdvocate,
      reasoning: `${corroborationCount} independent sources corroborate (>= ${MIN_CORROBORATION_FOR_MALICE} required), score ${totalScore.toDisplayString()} exceeds ${MALICE_THRESHOLD.toDisplayString()}.${d1Note}${capNote}`,
    };
  }

  if (meetsMaliceThreshold && !hasCorroboration) {
    return {
      ...base,
      verdict: "SUSPICION",
      devilAdvocate: "",
      reasoning: `Score ${totalScore.toDisplayString()} would qualify for MALICE, but only ${corroborationCount} independent source(s) corroborate — the Daubert corroboration gate requires at least ${MIN_CORROBORATION_FOR_MALICE}.${capNote}`,
    };
  }

  if (totalScore.lessOrEqual(NOISE_CEILING)) {
    // "Nothing found" is only a finding if the looking was complete.
    // With a declared gap, the honest answer is that this is unknown,
    // not that it is clean — reporting NOISE here would be the engine
    // making exactly the overclaim the system exists to prevent.
    if (coverageGaps.length > 0) {
      const missing = coverageGaps.map((g) => `${g.expected} (${g.reason})`).join("; ");
      return {
        ...base,
        verdict: "ABSTAIN",
        devilAdvocate: "",
        reasoning: `Nothing anomalous was found in what was examined, but ${coverageGaps.length} expected source(s) could not be examined: ${missing}. A negative finding is not supportable over evidence that was never available.${capNote}`,
      };
    }
    return {
      ...base,
      verdict: "NOISE",
      devilAdvocate: "",
      reasoning: `Score ${totalScore.toDisplayString()} at or below the noise ceiling ${NOISE_CEILING.toDisplayString()}.${capNote}`,
    };
  }

  return {
    ...base,
    verdict: "SUSPICION",
    devilAdvocate: "",
    reasoning: `Score ${totalScore.toDisplayString()} above the noise ceiling but below the MALICE threshold.${capNote}`,
  };
}
