import type { SealedBundle } from "../seal/bundle.js";

/**
 * The narrative layer: an LLM puts an ALREADY-SEALED result into words.
 *
 * Architecture (the invariant this module exists to preserve): the
 * deterministic engine produces and seals the verdict BEFORE any model is
 * called — `narrate` only accepts a `SealedBundle`, so the type system
 * itself enforces the ordering. The model receives a compressed,
 * read-only summary, its prompt states that every figure is fixed, and
 * its prose is stored BESIDE the seal, never inside it. Swapping the
 * backend (Ollama <-> Anthropic <-> none) changes the wording and nothing
 * else — the swap test in tests/narrative.test.ts is the contract.
 *
 * The "LLM picks enums, the engine decides" discipline, applied: this
 * layer accepts exactly ONE thing back from the model — free prose. No
 * number, label, or verdict is ever parsed out of the model's output into
 * a decision. The only post-processing is a deterministic guard that
 * CHECKS the prose against the sealed verdict and flags contradictions as
 * a warning on the record — it annotates, it never corrects or blocks.
 */

/** A pluggable way to turn a prompt into prose. Implementations in backends.ts. */
export interface NarratorBackend {
  /** Stable identifier, e.g. "ollama" or "anthropic". */
  name: string;
  /** The model that will write the prose, for the record's audit trail. */
  model: string;
  generate(prompt: string): Promise<string>;
}

/** Stored beside the sealed bundle — never inside it. */
export interface NarrativeRecord {
  caseId: string;
  /** Which sealed result this prose narrates — the anchor back to the seal. */
  bundleHash: string;
  analysisFingerprint: string;
  backend: string;
  model: string;
  generatedAt: string;
  prose: string;
  /**
   * Deterministic post-check: does the prose name a verdict other than
   * the sealed one? Coarse by design (a whole-word scan cannot parse
   * negations) and consequence-free by design: an inconsistent narration
   * is reported next to the seal it contradicts, and the seal wins.
   */
  proseConsistentWithVerdict: boolean;
  consistencyNote: string;
}

const VERDICTS = ["NOISE", "SUSPICION", "MALICE", "ABSTAIN"] as const;

/**
 * The compressed, read-only summary the model narrates from. Everything
 * here is already sealed; nothing the model says can change any of it.
 */
export function buildNarrativePrompt(bundle: SealedBundle): string {
  const gaps =
    bundle.coverageGaps.length > 0
      ? bundle.coverageGaps.map((g) => `- ${g.expected}: ${g.reason}`).join("\n")
      : "none declared";
  return [
    "You are the narrator for a deterministic forensic engine. The analysis below is FINISHED and cryptographically sealed.",
    "Every figure, verdict and finding is FIXED. You must not alter, re-estimate, second-guess or extend any of them.",
    "Your only job is to explain this sealed result in clear, neutral prose for a non-technical reader (a judge, an auditor).",
    "Do not introduce numbers, verdicts or findings that are not listed here. Do not speculate about guilt or identity.",
    "",
    `Case: ${bundle.caseId}`,
    `Sealed verdict: ${bundle.verdict}`,
    `Score (exact rational): ${bundle.score}`,
    `Independent corroborating sources: ${bundle.corroborationCount}`,
    `Detectors fired: ${bundle.detectorsFired.join(", ") || "none"}`,
    `Coverage gaps (sources never examined):\n${gaps}`,
    `Devil's advocate on record: ${bundle.devilAdvocate || "none"}`,
    `Engine reasoning: ${bundle.reasoning}`,
    "",
    "Write one short paragraph (3-6 sentences). Plain language. State the verdict exactly as sealed.",
  ].join("\n");
}

/** Whole-word scan for verdict tokens the sealed result does not carry. */
function checkProseConsistency(prose: string, sealedVerdict: SealedBundle["verdict"]): { ok: boolean; note: string } {
  const foreign = VERDICTS.filter((v) => v !== sealedVerdict && new RegExp(`\\b${v}\\b`, "i").test(prose));
  if (foreign.length === 0) return { ok: true, note: "" };
  return {
    ok: false,
    note:
      `Narration mentions verdict term(s) ${foreign.join(", ")} while the sealed verdict is ${sealedVerdict}. ` +
      "The seal is authoritative; the prose is decorative. This check is a coarse whole-word scan and cannot " +
      "parse negations - treat it as a flag for human review, not a finding.",
  };
}

/**
 * Narrate a sealed bundle. The bundle is read, never written; the record
 * returned lives beside the seal. Backend failures propagate to the
 * caller, which degrades honestly (narrative absent, core untouched).
 */
export async function narrate(bundle: SealedBundle, backend: NarratorBackend): Promise<NarrativeRecord> {
  const prose = (await backend.generate(buildNarrativePrompt(bundle))).trim();
  const consistency = checkProseConsistency(prose, bundle.verdict);
  return {
    caseId: bundle.caseId,
    bundleHash: bundle.bundleHash,
    analysisFingerprint: bundle.analysisFingerprint,
    backend: backend.name,
    model: backend.model,
    generatedAt: new Date().toISOString(),
    prose,
    proseConsistentWithVerdict: consistency.ok,
    consistencyNote: consistency.note,
  };
}
