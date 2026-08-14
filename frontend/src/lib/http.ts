import { NextResponse } from "next/server";

/**
 * Red team F14 (docs/RED_TEAM_ROUND_3.md, main repo): none of the POST
 * routes checked `Content-Type` before parsing the body as JSON. A
 * cross-origin `<form enctype="text/plain">` is one of the three
 * CORS-safelisted content types — a browser sends it with no preflight —
 * and a crafted `name`/`value` pair serializes to a body that still
 * parses as valid JSON. Any page the user has open could silently POST to
 * these routes; the browser's Same-Origin Policy stops the attacker from
 * reading the response, but not from sending the request, and not from
 * whatever side effect the route has.
 *
 * The current routes (seal/verify/attest) don't persist anything to disk,
 * so today this is compute-abuse at worst, not the state-corruption impact
 * F14 demonstrated against the now-retired standalone `src/web/server.ts`
 * (which did persist). Enforcing this here is still correct: it closes
 * the whole class before anyone adds a write path, rather than after.
 *
 * Requiring exactly `application/json` (ignoring an optional charset
 * parameter) means a plain HTML form can never satisfy this — that
 * content type isn't one of the three CORS-safelisted values — and a
 * `fetch`/`XHR` call that sets it becomes a CORS "non-simple" request,
 * which needs a preflight this server never answers with a matching
 * `Access-Control-Allow-Origin`. Closed by default, not by an allowlist
 * that has to be maintained.
 */
export function requireJsonContentType(req: Request): NextResponse | null {
  const contentType = req.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return NextResponse.json(
      { error: `Expected Content-Type: application/json, got ${JSON.stringify(contentType)}` },
      { status: 415 },
    );
  }
  return null;
}

/**
 * Red team round 6, F22: the compute-bearing POST routes read their bodies
 * with no size cap — request memory was unbounded at the application layer.
 * readJsonBody enforces the cap while streaming (a body that declares or
 * turns out to be oversized is refused before it is fully buffered or
 * parsed), and turns malformed JSON into a 400 instead of a crash.
 */
export const MAX_JSON_BODY_BYTES = 256 * 1024;

export type ReadJsonOutcome =
  | { status: 200; body: unknown }
  | { status: 400 | 413; error: string };

export async function readJsonBody(req: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<ReadJsonOutcome> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const declaredBytes = Number.parseInt(declared, 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      return { status: 413, error: `Request body exceeds the ${maxBytes}-byte limit.` };
    }
  }

  const reader = req.body?.getReader();
  if (!reader) {
    return { status: 400, error: "Expected a JSON body." };
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: 413, error: `Request body exceeds the ${maxBytes}-byte limit.` };
      }
      chunks.push(value);
    }
  } catch {
    return { status: 400, error: "Could not read the request body." };
  }

  const text = new TextDecoder().decode(concatBytes(chunks));
  try {
    return { status: 200, body: JSON.parse(text) };
  } catch {
    return { status: 400, error: "Body is not valid JSON." };
  }
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
