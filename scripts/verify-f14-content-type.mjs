#!/usr/bin/env node
// Reproduction for red team F14's fix (docs/RED_TEAM_ROUND_3.md).
//
// Exercises the same guard logic now used by frontend/src/lib/http.ts's
// requireJsonContentType() against real Web-standard Request objects
// (Node's built-in Request, not a mock) covering the three CORS-safelisted
// content types a cross-origin <form> can send without a preflight, plus
// the legitimate application/json case with and without a charset param.
//
// This is a faithful copy of the guard, not an import of the live file,
// because the live file lives in a Next.js app (path aliases, its own
// module resolution) and this script intentionally has zero dependencies
// so it can be run anywhere, anytime, without `npm install` in frontend/.
// If frontend/src/lib/http.ts changes, update this copy to match and
// re-run — that drift risk is the same tradeoff the standalone verifier
// (src/seal/verify.ts) already accepts, for the same reason.
//
//   node scripts/verify-f14-content-type.mjs

function requireJsonContentType(req) {
  const contentType = req.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return { status: 415, error: `Expected Content-Type: application/json, got ${JSON.stringify(contentType)}` };
  }
  return null;
}

const cases = [
  { name: "legit application/json", headers: { "content-type": "application/json" }, expectBlocked: false },
  { name: "legit application/json with charset", headers: { "content-type": "application/json; charset=utf-8" }, expectBlocked: false },
  { name: "CSRF vector: text/plain (CORS-safelisted, no preflight)", headers: { "content-type": "text/plain" }, expectBlocked: true },
  { name: "CSRF vector: application/x-www-form-urlencoded", headers: { "content-type": "application/x-www-form-urlencoded" }, expectBlocked: true },
  { name: "CSRF vector: multipart/form-data", headers: { "content-type": "multipart/form-data; boundary=x" }, expectBlocked: true },
  { name: "no content-type header at all", headers: {}, expectBlocked: true },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const req = new Request("http://localhost/api/seal", { method: "POST", headers: c.headers, body: "{}" });
  const result = requireJsonContentType(req);
  const blocked = result !== null;
  const ok = blocked === c.expectBlocked;
  console.log(`${ok ? "PASS" : "FAIL"} — ${c.name}: blocked=${blocked} (expected ${c.expectBlocked})${blocked ? ` [${result.status}]` : ""}`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass}/${cases.length} passed`);
process.exit(fail > 0 ? 1 : 0);
