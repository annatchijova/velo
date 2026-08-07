import { NextResponse } from "next/server";
import { analyzeCase, sealAnalysis } from "velo/core/operations.js";
import { verifyBundle, attestationPayload } from "velo/seal/bundle.js";
import { Fraction } from "velo/engine/fraction.js";
import type { Artifact, CustodyEvent, DetectorResult, ScoreResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * The engine's orchestration lives in velo/core/operations.ts, shared
 * with the MCP server. This route only translates between HTTP and that
 * module.
 *
 * It used to assemble the custody chain and derive `custodyValid` here,
 * with its own copy of those rules. They matched the engine's copy
 * exactly — which is what red team F8 looked like right up until the two
 * copies stopped matching. The rule that decides whether evidence is
 * admissible is not a thing to hold two versions of.
 */

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

  const analysis = analyzeCase({
    caseId: body.caseId,
    artifacts: body.artifacts as never,
    devilAdvocate: body.devilAdvocate ?? "",
    custodyEvents: (body.custodyEvents ?? []) as never,
  });

  const scenario = body.scenario ?? "engine-only";

  if (scenario === "engine-only") {
    return NextResponse.json({
      detectorResults: analysis.detectorResults.map(serializeDetector),
      score: serializeScore(analysis.scoreResult),
      custodyValid: analysis.custodyValid,
      custodyReason: analysis.custodyReason,
    });
  }

  const bundle = sealAnalysis(body.caseId, body.artifacts as never, analysis);

  // Cross-check: the bundle must be internally consistent as sealed.
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
    custodyValid: analysis.custodyValid,
    selfCheck,
  });
}
