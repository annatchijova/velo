import type { DetectorResult } from "./detectors.js";
import { Fraction } from "./fraction.js";

export type Verdict = "NOISE" | "SUSPICION" | "MALICE" | "ABSTAIN";

export interface ScoreResult {
  verdict: Verdict;
  score: Fraction;
  corroborationCount: number;
  detectorsFired: string[];
  /** Non-empty only when verdict === "MALICE". */
  devilAdvocate: string;
  /** Why the verdict landed where it did — for the sealed bundle's audit trail. */
  reasoning: string;
}

// Thresholds, decided once, in lowest terms — never compared as floats.
const MALICE_THRESHOLD = new Fraction(33, 100);
const NOISE_CEILING = new Fraction(8, 100);
const MIN_CORROBORATION_FOR_MALICE = 2;

export interface ScoreInput {
  detectorResults: DetectorResult[];
  /** Required to justify a MALICE verdict — the strongest counter-argument against it. Empty string if none was formed. */
  devilAdvocate: string;
  /** False if the custody chain failed verification — forces ABSTAIN regardless of score. */
  custodyValid: boolean;
}

export function score(input: ScoreInput): ScoreResult {
  const { detectorResults, devilAdvocate, custodyValid } = input;

  if (!custodyValid) {
    return {
      verdict: "ABSTAIN",
      score: Fraction.zero(),
      corroborationCount: 0,
      detectorsFired: [],
      devilAdvocate: "",
      reasoning: "Custody chain failed verification — evidence is inadmissible regardless of what it shows.",
    };
  }

  const fired = detectorResults.filter((d) => d.fired);
  const corroborationCount = fired.length;
  const totalScore = fired.reduce((acc, d) => acc.add(d.weight), Fraction.zero());
  const detectorsFired = fired.map((d) => d.name);

  const meetsMaliceThreshold = totalScore.greaterThan(MALICE_THRESHOLD);
  const hasCorroboration = corroborationCount >= MIN_CORROBORATION_FOR_MALICE;

  if (meetsMaliceThreshold && hasCorroboration) {
    if (devilAdvocate.trim().length === 0) {
      // Fail closed: a MALICE verdict without an articulated counter-argument
      // is not admissible under this system's own Daubert gate. Degrade
      // rather than publish an unscrutinized MALICE.
      return {
        verdict: "SUSPICION",
        score: totalScore,
        corroborationCount,
        detectorsFired,
        devilAdvocate: "",
        reasoning:
          "Score and corroboration both qualify for MALICE, but no devil's-advocate counter-argument was supplied. Degraded to SUSPICION rather than publish an unscrutinized verdict.",
      };
    }
    return {
      verdict: "MALICE",
      score: totalScore,
      corroborationCount,
      detectorsFired,
      devilAdvocate,
      reasoning: `${corroborationCount} independent sources corroborate (>= ${MIN_CORROBORATION_FOR_MALICE} required), score ${totalScore.toDisplayString()} exceeds ${MALICE_THRESHOLD.toDisplayString()}.`,
    };
  }

  if (meetsMaliceThreshold && !hasCorroboration) {
    return {
      verdict: "SUSPICION",
      score: totalScore,
      corroborationCount,
      detectorsFired,
      devilAdvocate: "",
      reasoning: `Score ${totalScore.toDisplayString()} would qualify for MALICE, but only ${corroborationCount} independent source(s) corroborate — the Daubert corroboration gate requires at least ${MIN_CORROBORATION_FOR_MALICE}.`,
    };
  }

  if (totalScore.lessOrEqual(NOISE_CEILING)) {
    return {
      verdict: "NOISE",
      score: totalScore,
      corroborationCount,
      detectorsFired,
      devilAdvocate: "",
      reasoning: `Score ${totalScore.toDisplayString()} at or below the noise ceiling ${NOISE_CEILING.toDisplayString()}.`,
    };
  }

  return {
    verdict: "SUSPICION",
    score: totalScore,
    corroborationCount,
    detectorsFired,
    devilAdvocate: "",
    reasoning: `Score ${totalScore.toDisplayString()} above the noise ceiling but below the MALICE threshold.`,
  };
}
