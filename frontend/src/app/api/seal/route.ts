import { NextResponse } from "next/server";
import { analyzeCase, sealAnalysis } from "velo/core/operations.js";
import { verifyBundle, attestationPayload } from "velo/seal/bundle.js";
import { Fraction } from "velo/engine/fraction.js";
import type { Artifact, CoverageGap, CustodyEvent, DetectorResult, ScoreResult } from "@/lib/types";
import { getSessionFromRequest } from "@/lib/auth";
import { maybePersistSeal } from "@/lib/persist";
import { readJsonBody, requireJsonContentType } from "@/lib/http";

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
  /**
   * Sources that should have been examined and were not. Passed straight
   * through: the engine degrades a NEGATIVE finding to ABSTAIN when any
   * are declared, and seals them into the analysis fingerprint. Dropping
   * them here would silently promote that ABSTAIN back to NOISE -- the
   * exact overclaim the field exists to prevent.
   */
  coverageGaps?: CoverageGap[];
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
  coverageGaps: CoverageGap[];
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
    coverageGaps: s.coverageGaps,
    devilAdvocate: s.devilAdvocate,
    reasoning: s.reasoning,
  };
}

export async function POST(req: Request) {
  const contentTypeError = requireJsonContentType(req);
  if (contentTypeError) return contentTypeError;

  // F22: capped body read — memory is bounded at the application layer.
  const parsed = await readJsonBody(req);
  if (parsed.status !== 200) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const body = parsed.body as SealBody;

  if (!body.caseId || !Array.isArray(body.artifacts)) {
    return NextResponse.json({ error: "caseId and artifacts are required" }, { status: 400 });
  }

  const analysis = analyzeCase({
    caseId: body.caseId,
    artifacts: body.artifacts as never,
    devilAdvocate: body.devilAdvocate ?? "",
    custodyEvents: (body.custodyEvents ?? []) as never,
    coverageGaps: (body.coverageGaps ?? []) as never,
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

  // AC-J2.2: persistence is an addition for registered experts with a
  // configured database — never a change to what sealing returns, and never
  // a failure mode for anyone else.
  const session = await getSessionFromRequest(req, process.env.AUTH_SECRET ?? "");
  const persistence = await maybePersistSeal(
    session,
    bundle as unknown as Record<string, unknown> & { caseId: string; sealedAt: string; verdict: string; bundleHash: string },
  );

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
    persisted: persistence.persisted,
    sealedId: persistence.id,
    persistenceReason: persistence.reason,
  });
}
