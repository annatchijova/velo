import type { DetectorResult } from "./detectors.js";
import type { Artifact } from "./evidence.js";
import { Fraction } from "./fraction.js";

/**
 * Per-artifact effective-trust audit, ported from VIGIA's canonical scorer
 * (vigia_scorer.py — the Fraction-exact tables) and the sealable subset of
 * vigia/core/trust_fusion.py.
 *
 * WHAT THIS IS: an exact-arithmetic trust factor per artifact —
 * provenance-chain depth factor x temporal-integrity factor — reported
 * BESIDE the verdict as audit metadata. A reader sees "this artifact's own
 * temporal integrity is compromised (trust 12957/95740)" next to the score
 * it contributed to.
 *
 * WHAT THIS IS NOT: a verdict input. VIGIA couples effective trust to two
 * verdict gates (mean < 1/100 without fractures -> ABSTAIN; < 15/100 with
 * fractures -> SUSPICION cap) that counterbalance its hard-temporal MALICE
 * gate. VELO deliberately did not port that hard gate (it would bypass the
 * Daubert corroboration gate), so adopting the caps alone would invert
 * doctrine: the same temporal fractures that raise VELO's score would cap
 * its verdict. Additionally, the ABSTAIN gate is unreachable here — with
 * no external prior_trust input the floor is (1/10) x (12957/95740), which
 * is above 1/100. Dead-code gates pretending to be guarantees are worse
 * than documented absence, so the gates stay out and this layer stays
 * verdict-neutral. Verified against the live Python before deciding.
 *
 * The recon claim that this module was "temporal decay by evidence age"
 * did not survive the audit: the live Python decays by temporal-VIOLATION
 * severity, not by age. No evidence-age schema was added for that reason.
 */

/**
 * exp(-2x) bucketed to 0.05 steps, ported verbatim from vigia_scorer.py
 * `_EXP_NEG2_TABLE` (index = bucket = round(x / 0.05), clamped [0, 20]).
 * The table replaces math.exp so x86 and ARM produce identical bytes.
 */
export const EXP_NEG2_TABLE: readonly Fraction[] = Object.freeze([
  new Fraction(1, 1),
  new Fraction(57630, 63691),
  new Fraction(13559, 16561),
  new Fraction(50286, 67879),
  new Fraction(26788, 39963),
  new Fraction(20841, 34361),
  new Fraction(28148, 51289),
  new Fraction(46609, 93859),
  new Fraction(37297, 83006),
  new Fraction(40263, 99031),
  new Fraction(18089, 49171),
  new Fraction(6481, 19470),
  new Fraction(13342, 44297),
  new Fraction(4436, 16277),
  new Fraction(24529, 99470),
  new Fraction(21053, 94353),
  new Fraction(9283, 45979),
  new Fraction(9999, 54734),
  new Fraction(3404, 20593),
  new Fraction(4282, 28629),
  new Fraction(12957, 95740),
]);

/**
 * epc_factor = (19/20)^k with k = max(0, chainLength - 3), clamped at 15 —
 * ported verbatim from vigia_scorer.py `_EPC_FACTOR_TABLE`. A provenance
 * chain longer than three links loses 5% of trust per extra hop.
 */
export const EPC_FACTOR_TABLE: readonly Fraction[] = Object.freeze([
  new Fraction(1, 1),
  new Fraction(19, 20),
  new Fraction(361, 400),
  new Fraction(6859, 8000),
  new Fraction(130321, 160000),
  new Fraction(2476099n, 3200000n),
  new Fraction(47045881n, 64000000n),
  new Fraction(893871739n, 1280000000n),
  new Fraction(16983563041n, 25600000000n),
  new Fraction(322687697779n, 512000000000n),
  new Fraction(6131066257801n, 10240000000000n),
  new Fraction(116490258898219n, 204800000000000n),
  new Fraction(2213314919066161n, 4096000000000000n),
  new Fraction(42052983462257059n, 81920000000000000n),
  new Fraction(799006685782884121n, 1638400000000000000n),
  new Fraction(15181127029874798299n, 32768000000000000000n),
]);

/** Broken or absent chain: 1/10, exactly as the canonical scorer (P0 consistency note). */
export const EMPTY_CHAIN_FACTOR = new Fraction(1, 10);

/**
 * Temporal-violation weights, from vigia/core/trust_fusion.py
 * `_TEMPORAL_VIOLATION_WEIGHTS`, mapped onto VELO fracture names:
 * TEMPORAL_CAUSALITY_VIOLATION is VIGIA's EFFECT_BEFORE_CAUSE (weight 1);
 * TEMPORAL_ENTROPY_NULL is its STATISTICAL_UNIFORMITY (too-regular
 * timestamps, weight 3/5). Every other temporal fracture takes VIGIA's own
 * `.get(type, 0.5)` default of 1/2. VIGIA additionally multiplies a
 * per-violation severity float; VELO fractures carry no severities, so the
 * weight stands alone — equivalent to severity 1, the conservative-high
 * reading. That granularity difference makes this mapping PLAUSIBLE
 * doctrine transfer, not a parity-confirmed port; the tables themselves
 * are verbatim.
 */
export const TEMPORAL_VIOLATION_WEIGHTS: ReadonlyMap<string, Fraction> = new Map([
  ["TEMPORAL_CAUSALITY_VIOLATION", new Fraction(1, 1)],
  ["TEMPORAL_ENTROPY_NULL", new Fraction(3, 5)],
]);

export const DEFAULT_TEMPORAL_VIOLATION_WEIGHT = new Fraction(1, 2);

/** round(20x) in exact rational arithmetic, half-to-even like Python's round(). */
function bucketOf(x: Fraction): number {
  const clamped = x.compare(new Fraction(1, 1)) > 0 ? new Fraction(1, 1) : x.compare(Fraction.zero()) < 0 ? Fraction.zero() : x;
  const n = 20n * clamped.num;
  const d = clamped.den;
  const q = n / d;
  const r = n % d;
  const twice = 2n * r;
  let bucket = q;
  if (twice > d || (twice === d && q % 2n === 1n)) bucket = q + 1n;
  return Number(bucket > 20n ? 20n : bucket < 0n ? 0n : bucket);
}

/** Provenance-chain depth factor: table lookup, empty chain penalized to 1/10. */
export function provenanceDepthFactor(provenanceChain: readonly string[]): Fraction {
  const meaningful = provenanceChain.filter((h) => h.trim().length > 0);
  if (meaningful.length === 0) return EMPTY_CHAIN_FACTOR;
  const k = Math.min(15, Math.max(0, meaningful.length - 3));
  return EPC_FACTOR_TABLE[k]!;
}

/**
 * Temporal-integrity factor: exp(-2 * max weight) over the temporal
 * fractures attributed to the artifact, via the exact table. No temporal
 * fractures -> 1 (full trust).
 */
export function temporalTrustFactor(temporalFractures: readonly string[]): Fraction {
  if (temporalFractures.length === 0) return new Fraction(1, 1);
  let maxWeight = Fraction.zero();
  for (const f of temporalFractures) {
    const w = TEMPORAL_VIOLATION_WEIGHTS.get(f) ?? DEFAULT_TEMPORAL_VIOLATION_WEIGHT;
    if (w.compare(maxWeight) > 0) maxWeight = w;
  }
  return EXP_NEG2_TABLE[bucketOf(maxWeight)]!;
}

export interface ArtifactTrust {
  artifactId: string;
  /** Fraction strings, exact — safe to display or seal, never a float. */
  provenanceFactor: string;
  temporalFactor: string;
  effectiveTrust: string;
  /** The temporal fractures that drove the factor, for the reader. */
  temporalFractures: string[];
}

/**
 * Effective trust per artifact = provenance depth factor x temporal factor.
 *
 * Attribution granularity: VIGIA attributes each violation to its
 * cause/effect artifact ids. VELO's DetectorResult reports fractures and
 * contributors at detector level, so every contributor of the temporal
 * detector carries that detector's fired fracture set — coarser than
 * VIGIA, may over-penalize a contributor whose own fracture was the
 * lesser one. Documented rather than hidden; audit metadata only.
 */
export function computeArtifactTrust(artifacts: readonly Artifact[], detectorResults: readonly DetectorResult[]): ArtifactTrust[] {
  const temporal = detectorResults.find((d) => d.name === "temporal");
  const temporalContributors = new Set(temporal?.contributingArtifactIds ?? []);
  const temporalFractures = temporal?.fired ? temporal.fractures : [];

  return artifacts.map((a) => {
    const provenanceFactor = provenanceDepthFactor(a.provenanceChain);
    const mine = temporalContributors.has(a.id) ? temporalFractures : [];
    const temporalFactor = temporalTrustFactor(mine);
    const effective = new Fraction(provenanceFactor.num * temporalFactor.num, provenanceFactor.den * temporalFactor.den);
    return {
      artifactId: a.id,
      provenanceFactor: provenanceFactor.toString(),
      temporalFactor: temporalFactor.toString(),
      effectiveTrust: effective.toString(),
      temporalFractures: [...mine],
    };
  });
}
