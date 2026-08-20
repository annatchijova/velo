import type { Artifact, Marker } from "../engine/evidence.js";

/**
 * Pre-analysis signal producers — the NON-SEALABLE adapter layer of the
 * VIGIA port (docs/PORT-FROM-VIGIA.md section 6), phase 4.
 *
 * These run BEFORE the deterministic engine and produce two things only:
 *
 *   (a) MARKER SUGGESTIONS — advisory. A suggestion names an existing
 *       VELO marker with the evidence for it; the CALLER (analyst, UI,
 *       agent) decides whether to apply it to an artifact before running
 *       the engine. Nothing here auto-applies: a suggested marker enters
 *       the decision path only through the same door an analyst-declared
 *       marker does, and it is sealed as part of the input evidence.
 *
 *   (b) NARRATIVE SIGNALS — floats, scores, interpretations. Stored or
 *       displayed beside the analysis; never read by the engine, never
 *       sealed into a verdict. `canonicalize` would throw on these floats
 *       — which is correct, because they must never get that far.
 *
 * The engine (src/engine), the seal (src/seal) and the hypothesis layer
 * (src/inference) never import this module — pinned by regression test,
 * the same boundary the LLM narrator lives behind. Removing this entire
 * module changes which suggestions an analyst sees, never a verdict.
 *
 * Ported here, verified against the live Python (vigia_sift_bridge.py):
 *   - detect_human_jitter thresholds (variance < 0.1 -> programmed delay,
 *     CV < 0.05 -> non-human precision, no >10s pause across >10 intervals
 *     with mean < 5s -> absence of human pauses)
 *   - calculate_human_entropy's PERFECTLY_REGULAR_INTERVALS
 *     (variance < 0.5 over > 3 intervals)
 *   - audit_grice_maxims quantity maxims (any text > 1000 chars ->
 *     saturation; > 40% of texts under 10 chars -> scarcity)
 *
 * NOT ported, with reasons (spec section 10 has the full log):
 *   - shannon entropy: needs raw content; VELO artifacts carry the
 *     analyst-computed `entropyMilliBits` instead — that field IS this
 *     signal's arrival point.
 *   - Grice relation-maxim evasion phenomena: testimony forensics over
 *     chat messages, an input VELO does not have.
 *   - likelihood ratio: needs the EBS z-score pipeline VELO lacks.
 *   - stylometry: needs an authorship corpus.
 */

export interface MarkerSuggestion {
  /** The artifacts the suggested marker would attach to. */
  artifactIds: string[];
  /** An EXISTING VELO marker — producers never invent vocabulary. */
  marker: Marker;
  /** Which producer suggested it. */
  source: string;
  reason: string;
}

export interface NarrativeSignal {
  /** Which producer emitted it. */
  source: string;
  /** VIGIA's signal type name, kept verbatim for cross-engine reading. */
  type: string;
  interpretation: string;
  /** Floats live here and only here — narrative, never sealed. */
  data: Record<string, number | string>;
  /** VIGIA's original signal weight, reported as narrative context. */
  weight: number;
}

export interface PreAnalysis {
  suggestedMarkers: MarkerSuggestion[];
  narrativeSignals: NarrativeSignal[];
  /** What this pass could not examine — stated, not silent. */
  notes: string[];
}

function parseSeconds(ts: string): number | null {
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? null : ms / 1000;
}

/**
 * Timing-regularity producer, ported from VIGIA's detect_human_jitter and
 * calculate_human_entropy: perfection is a signal of artificiality — a
 * human hesitates and varies, a script has sleep(2).
 *
 * Artifacts are grouped per source (regularity is a property of one
 * emitting stream; interleaving unrelated sources would fabricate
 * intervals) and sorted by timestamp. VIGIA requires at least 3 usable
 * timestamps; unparseable ones are skipped here with a note — the engine
 * already fails closed on those independently.
 */
export function analyzeTimingRegularity(artifacts: readonly Artifact[]): PreAnalysis {
  const suggestedMarkers: MarkerSuggestion[] = [];
  const narrativeSignals: NarrativeSignal[] = [];
  const notes: string[] = [];

  const bySource = new Map<string, { id: string; seconds: number }[]>();
  for (const a of artifacts) {
    const seconds = parseSeconds(a.timestamp);
    if (seconds === null) {
      notes.push(`Artifact ${a.id}: unparseable timestamp, excluded from timing analysis (the engine flags it separately).`);
      continue;
    }
    const group = bySource.get(a.source) ?? [];
    group.push({ id: a.id, seconds });
    bySource.set(a.source, group);
  }

  for (const [source, group] of bySource) {
    if (group.length < 3) continue; // VIGIA: at least 3 timestamps required
    group.sort((x, y) => x.seconds - y.seconds);

    const intervals: number[] = [];
    for (let i = 1; i < group.length; i++) intervals.push(group[i]!.seconds - group[i - 1]!.seconds);

    const avg = intervals.reduce((s, x) => s + x, 0) / intervals.length;
    const variance = intervals.reduce((s, x) => s + (x - avg) ** 2, 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const cv = avg > 0 ? stdDev / avg : 0;

    const producer = `timing_regularity(${source})`;
    let regularityDetected = false;

    if (variance < 0.1 && intervals.length >= 2) {
      regularityDetected = true;
      narrativeSignals.push({
        source: producer,
        type: "PROGRAMMED_DELAY_DETECTED",
        interpretation: `Variance of ${variance.toFixed(6)}s across ${intervals.length} intervals. A sleep() call in code produces exactly this; no human has this regularity.`,
        data: { variance, intervals: intervals.length },
        weight: 40,
      });
    }
    if (cv < 0.05 && intervals.length >= 2) {
      regularityDetected = true;
      narrativeSignals.push({
        source: producer,
        type: "NON_HUMAN_PRECISION",
        interpretation: `Coefficient of variation ${cv.toFixed(4)}. Humans typically show CV > 0.3; this precision is only possible with automation.`,
        data: { coefficientOfVariation: cv },
        weight: 30,
      });
    }
    if (intervals.length > 3 && variance < 0.5 && !regularityDetected) {
      // calculate_human_entropy's softer threshold — reported only when
      // the harder jitter checks did not already fire.
      regularityDetected = true;
      narrativeSignals.push({
        source: producer,
        type: "PERFECTLY_REGULAR_INTERVALS",
        interpretation: `Variance ${variance.toFixed(4)} over ${intervals.length} intervals. Humans have high variance in rhythm; near-perfect regularity indicates a programmed delay.`,
        data: { variance },
        weight: 25,
      });
    }
    if (intervals.length > 10 && avg < 5 && !intervals.some((i) => i > 10)) {
      narrativeSignals.push({
        source: producer,
        type: "ABSENCE_OF_HUMAN_PAUSES",
        interpretation: "In a long session a human always pauses to think, read or get distracted. Total absence of pauses indicates automation.",
        data: { intervals: intervals.length, averageIntervalSeconds: avg },
        weight: 20,
      });
    }

    if (regularityDetected) {
      suggestedMarkers.push({
        artifactIds: group.map((g) => g.id),
        marker: "temporal_entropy_null",
        source: producer,
        reason:
          `The ${group.length} artifacts from source "${source}" show machine-regular timing ` +
          `(variance ${variance.toFixed(6)}s, CV ${cv.toFixed(4)}). If you agree, apply the ` +
          "temporal_entropy_null marker so the deterministic temporal detector scores it.",
      });
    }
  }

  return { suggestedMarkers, narrativeSignals, notes };
}

/**
 * Grice quantity maxims, ported from VIGIA's audit_grice_maxims: the
 * integer-threshold subset only. Saturation hides critical data inside
 * semantic noise; deliberate scarcity is active concealment. Produces
 * narrative signals only — no VELO marker maps to these yet.
 */
export function analyzeGriceQuantity(texts: readonly string[]): PreAnalysis {
  const narrativeSignals: NarrativeSignal[] = [];
  const lengths = texts.map((t) => t.length);

  if (lengths.some((l) => l > 1000)) {
    narrativeSignals.push({
      source: "grice_quantity",
      type: "SATURATION",
      interpretation: "Excessively long messages. Saturation is a technique to hide critical data within semantic noise.",
      data: { maxLength: Math.max(...lengths) },
      weight: 25,
    });
  }
  const sparse = lengths.filter((l) => l < 10).length;
  if (texts.length > 0 && sparse > texts.length * 0.4) {
    narrativeSignals.push({
      source: "grice_quantity",
      type: "SCARCITY",
      interpretation: "Abnormally short responses. Active concealment produces deliberate scarcity.",
      data: { sparseCount: sparse, total: texts.length },
      weight: 20,
    });
  }

  return { suggestedMarkers: [], narrativeSignals, notes: [] };
}

/** Run every producer over a case's inputs and merge the results. */
export function preAnalyze(artifacts: readonly Artifact[], texts: readonly string[] = []): PreAnalysis {
  const parts = [analyzeTimingRegularity(artifacts), texts.length > 0 ? analyzeGriceQuantity(texts) : null];
  const merged: PreAnalysis = { suggestedMarkers: [], narrativeSignals: [], notes: [] };
  for (const p of parts) {
    if (!p) continue;
    merged.suggestedMarkers.push(...p.suggestedMarkers);
    merged.narrativeSignals.push(...p.narrativeSignals);
    merged.notes.push(...p.notes);
  }
  return merged;
}
