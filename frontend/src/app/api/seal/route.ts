import { NextResponse } from "next/server";
import { runAllDetectors } from "velo/engine/detectors.js";
import { score } from "velo/engine/scorer.js";
import {
  createCustodyChain,
  appendCustodyEvent,
  verifyCustodyChain,
} from "velo/seal/custody.js";
import { sealBundle, verifyBundle, attestationPayload } from "velo/seal/bundle.js";
import { Fraction } from "velo/engine/fraction.js";
import type { Artifact, CustodyEvent, DetectorResult, ScoreResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

interface SealBody {
  caseId: string;
  artifacts: Artifact[];
  devilAdvocate?: string;
  custodyEvents?: CustodyEvent[];
  scenario?: "engine-only" | "seal";
}

function serializeDetector(d: {
  name: string;
  fired: boolean;
  fractures: string[];
  weight: Fraction;
  contributingArtifactIds: string[];
}): DetectorResult {
  return {
    name: d.name,
    fired: d.fired,
    fractures: d.fractures,
    weight: d.weight.toString(),
    contributingArtifactIds: d.contributingArtifactIds,
  };
}

function serializeScore(s: {
  verdict: ScoreResult["verdict"];
  score: Fraction;
  corroborationCount: number;
  detectorCategoriesFired: number;
  detectorsFired: string[];
  corroboratingSources: string[];
  devilAdvocate: string;
  reasoning: string;
}): ScoreResult {
  return {
    verdict: s.verdict,
    score: s.score.toString(),
    corroborationCount: s.corroborationCount,
    detectorCategoriesFired: s.detectorCategoriesFired,
    detectorsFired: s.detectorsFired,
    corroboratingSources: s.corroboratingSources,
    devilAdvocate: s.devilAdvocate,
    reasoning: s.reasoning,
  };
}

function buildCustody(caseId: string, events: CustodyEvent[]) {
  let chain = createCustodyChain(caseId);
  for (const ev of events) {
    chain = appendCustodyEvent(chain, ev.eventType as never, ev.timestamp, ev.detail);
  }
  return chain;
}

export async function POST(req: Request) {
  let body: SealBody;
  try {
    body = (await req.json()) as SealBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.caseId || !Array.isArray(body.artifacts)) {
    return NextResponse.json({ error: "caseId and artifacts are required" }, { status: 400 });
  }

  const scenario = body.scenario ?? "engine-only";

  // 1. Run the deterministic engine over the evidence (server-side, node:crypto).
  const detectorResults = runAllDetectors(body.artifacts as never);
  const serializedDetectors = detectorResults.map(serializeDetector);

  // 2. Custody: an evidence set with no custody events has no chain of custody.
  const chain = buildCustody(body.caseId, body.custodyEvents ?? []);
  const custodyCheck = verifyCustodyChain(chain);
  const custodyValid = custodyCheck.valid && (body.custodyEvents?.length ?? 0) > 0;

  // 3. Score — ABSTAIN when the chain is broken or absent, regardless of signal.
  const scoreResult = score({
    detectorResults,
    artifacts: body.artifacts as never,
    devilAdvocate: body.devilAdvocate ?? "",
    custodyValid,
  });

  if (scenario === "engine-only") {
    return NextResponse.json({
      detectorResults: serializedDetectors,
      score: serializeScore(scoreResult),
      custodyValid,
      custodyReason: custodyValid
        ? custodyCheck.reason
        : "No chain of custody — evidence is inadmissible.",
    });
  }

  // 4. Seal: append SEALED and produce the two-hash bundle.
  const sealedAt = new Date().toISOString();
  const bundle = sealBundle(
    body.caseId,
    sealedAt,
    scoreResult,
    { caseId: body.caseId, artifacts: body.artifacts as never },
    chain,
  );

  // Cross-check: the bundle must be internally consistent as-is.
  const selfCheck = verifyBundle(bundle);

  return NextResponse.json({
    bundle: bundle as unknown as Record<string, unknown>,
    summary: {
      caseId: bundle.caseId,
      verdict: bundle.verdict,
      sealedAt: bundle.sealedAt,
      bundleHash: bundle.bundleHash,
      analysisFingerprint: bundle.analysisFingerprint,
      corroborationCount: bundle.corroborationCount,
    },
    attestationPayload: attestationPayload(bundle),
    custodyValid,
    selfCheck,
  });
}
