/**
 * Layer 6 — the CENTERPIECE: validity at the attestation date.
 *
 * Drives VELO-PERITO-005 (the adversarial fixture) against the real case
 * timestamps in cases/*.json and asserts the three-outcomes-by-date contract,
 * plus the crucial fact that membership and validity are INDEPENDENT: the
 * examiner is in the tree for all three cases, but only two are valid.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizePerito, type NormalizedPerito } from "../src/perito/credential.js";
import { checkValidity } from "../src/perito/validity.js";
import { attestationEpochForCase } from "../src/perito/case_adapter.js";
import { generateLeafSecretKey, peritoSecretCommitment } from "../src/perito/secret.js";
import { buildRegistry, credentialProof, verifyCredentialInclusion, type PeritoRegistryEntry } from "../src/perito/registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const CORPUS_DIR = path.join(ROOT, "peritos-syntetic");
const CASES_DIR = path.join(ROOT, "cases");

function loadPerito(id: string): NormalizedPerito {
  return normalizePerito(JSON.parse(readFileSync(path.join(CORPUS_DIR, `${id}.json`), "utf8")));
}
function caseEpoch(file: string): number | null {
  return attestationEpochForCase(JSON.parse(readFileSync(path.join(CASES_DIR, file), "utf8")));
}

const p005 = loadPerito("VELO-PERITO-005");

test("VELO-PERITO-005: three attestation dates, three outcomes (the corpus contract)", () => {
  const v009 = checkValidity(p005.spans, caseEpoch("VELO-009-trampa-soporte.json"));
  const v010 = checkValidity(p005.spans, caseEpoch("VELO-010-dia-normal.json"));
  const v006 = checkValidity(p005.spans, caseEpoch("VELO-006-vacio-quirurgico.json"));

  assert.equal(v009.status, "VALID", "VELO-009 (2026-01-16) is in period 1");
  assert.equal(v010.status, "VALID", "VELO-010 (2026-07-20) is in period 2");
  assert.equal(v006.status, "INVALID", "VELO-006 (2026-04-10) is in the licensing gap");
  // The gap is classified as a gap, not as before/after.
  assert.ok(v006.reasons.some((r) => /gap/i.test(r)), "VELO-006 should be reported as a gap");
});

test("membership and validity are INDEPENDENT: 005 is in the tree for all three, valid for two", () => {
  // Build a registry where VELO-PERITO-005 is a genuine member (both spans).
  const secret = { peritoId: "VELO-PERITO-005", realName: "n", licenseId: "CPCI-RNS-INF-05190", leafSecretKey: generateLeafSecretKey() };
  const commitment = peritoSecretCommitment(secret);
  const entry: PeritoRegistryEntry = { peritoId: secret.peritoId, peritoCommitment: commitment, spans: p005.spans };
  const registry = buildRegistry([entry]);

  const e009 = caseEpoch("VELO-009-trampa-soporte.json")!;
  const e010 = caseEpoch("VELO-010-dia-normal.json")!;
  const e006 = caseEpoch("VELO-006-vacio-quirurgico.json")!;

  // Membership: the examiner has leaves in the tree, and each leaf verifies.
  assert.equal(registry.leafCount, 2, "two spans -> two leaves");
  for (const leaf of registry.leaves) {
    const proof = credentialProof(registry, commitment, leaf.span.validFromEpoch); // a date inside each span
    assert.equal(proof.covered, true);
    if (proof.covered) {
      const v = verifyCredentialInclusion(registry.root, proof.leafBytes, proof.proof);
      assert.equal(v.valid, true, v.reasons.join("; "));
    }
  }

  // Validity via covering-span selection: 009 and 010 covered, 006 not.
  assert.equal(credentialProof(registry, commitment, e009).covered, true, "009 has a covering span");
  assert.equal(credentialProof(registry, commitment, e010).covered, true, "010 has a covering span");
  const gap = credentialProof(registry, commitment, e006);
  assert.equal(gap.covered, false, "006 falls in the gap: member of the tree, but no covering span");
  if (!gap.covered) assert.match(gap.reason, /not membership/);
});

test("boundaries are inclusive; one second into the gap is INVALID; unknown date ABSTAINs", () => {
  const [first, second] = p005.spans;
  assert.equal(checkValidity(p005.spans, first!.validFromEpoch).status, "VALID", "exact start is inclusive");
  assert.equal(checkValidity(p005.spans, first!.validUntilEpoch).status, "VALID", "exact end is inclusive");
  assert.equal(checkValidity(p005.spans, first!.validUntilEpoch + 1).status, "INVALID", "one second past the end is out");
  assert.equal(checkValidity(p005.spans, second!.validFromEpoch - 1).status, "INVALID", "one second before re-licensing is in the gap");
  assert.equal(checkValidity(p005.spans, null).status, "ABSTAIN", "unknown date must abstain, not pass");
  assert.equal(checkValidity(p005.spans, undefined).status, "ABSTAIN");
  assert.equal(checkValidity(p005.spans, 1.5 as unknown as number).status, "ABSTAIN", "non-integer epoch abstains");
});

test("every other examiner is VALID at each of their declared case dates", () => {
  const caseFileById: Record<string, string> = {
    "VELO-001": "VELO-001-peon-confesion.json",
    "VELO-002": "VELO-002-logs-uniformes.json",
    "VELO-003": "VELO-003-falso-flag.json",
    "VELO-004": "VELO-004-cadena-rota.json",
    "VELO-005": "VELO-005-convergencia.json",
    "VELO-011": "VELO-011-two-badges.json",
    "VELO-012": "VELO-012-quiet-resignation.json",
  };
  for (const id of ["VELO-PERITO-001", "VELO-PERITO-002", "VELO-PERITO-003", "VELO-PERITO-004", "VELO-PERITO-006"]) {
    const perito = loadPerito(id);
    for (const caseId of perito.casesAttested) {
      const file = caseFileById[caseId];
      if (!file) continue; // some attested cases (e.g. VELO-005 second opinion) share a file; skip unmapped
      const status = perito.credentialStatusAtAttestation[caseId];
      if (status !== "VALID") continue;
      const epoch = caseEpoch(file);
      assert.equal(checkValidity(perito.spans, epoch).status, "VALID", `${id} should be VALID at ${caseId} (${file})`);
    }
  }
});
