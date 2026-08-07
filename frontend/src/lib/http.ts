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
