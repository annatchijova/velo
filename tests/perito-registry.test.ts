/**
 * Layer 6 — the off-chain registry (membership) reuses merkle.ts and is
 * deterministic, content-sensitive, and order-independent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegistry, peritoLeafBytes, credentialProof, verifyCredentialInclusion, type PeritoRegistryEntry } from "../src/perito/registry.js";
import { generateLeafSecretKey, peritoSecretCommitment } from "../src/perito/secret.js";
import type { ValiditySpan } from "../src/perito/credential.js";

function commit(id: string): string {
  return peritoSecretCommitment({ peritoId: id, realName: "n", licenseId: "L-" + id, leafSecretKey: generateLeafSecretKey() });
}
const span = (from: number, until: number): ValiditySpan => ({ validFromEpoch: from, validUntilEpoch: until });

function fixtureEntries(): PeritoRegistryEntry[] {
  return [
    { peritoId: "A", peritoCommitment: commit("A"), spans: [span(1000, 2000)] },
    { peritoId: "B", peritoCommitment: commit("B"), spans: [span(1500, 2500), span(3000, 4000)] },
    { peritoId: "C", peritoCommitment: commit("C"), spans: [span(0, 500)] },
  ];
}

test("registry root is order-independent (a function of the leaf set)", () => {
  const entries = fixtureEntries();
  const r1 = buildRegistry(entries);
  const r2 = buildRegistry([...entries].reverse());
  assert.equal(r1.root, r2.root, "reordering examiners must not change the root");
  assert.equal(r1.leafCount, 4, "1 + 2 + 1 spans = 4 leaves");
  assert.match(r1.root, /^[0-9a-f]{64}$/);
});

test("root is content-sensitive: a changed window changes the root", () => {
  const entries = fixtureEntries();
  const r1 = buildRegistry(entries);
  const mutated = entries.map((e, i) => (i === 0 ? { ...e, spans: [span(1000, 2001)] } : e));
  assert.notEqual(r1.root, buildRegistry(mutated).root);
});

test("every leaf yields an inclusion proof that verifies against the root", () => {
  const entries = fixtureEntries();
  const registry = buildRegistry(entries);
  for (const leaf of registry.leaves) {
    const midpoint = Math.floor((leaf.span.validFromEpoch + leaf.span.validUntilEpoch) / 2);
    const proof = credentialProof(registry, leaf.peritoCommitment, midpoint);
    assert.equal(proof.covered, true, `${leaf.peritoId} leaf should be provable at a covered date`);
    if (proof.covered) {
      const v = verifyCredentialInclusion(registry.root, proof.leafBytes, proof.proof);
      assert.equal(v.valid, true, v.reasons.join("; "));
    }
  }
});

test("a tampered leaf fails verification", () => {
  const entries = fixtureEntries();
  const registry = buildRegistry(entries);
  const leaf = registry.leaves[0]!;
  const proof = credentialProof(registry, leaf.peritoCommitment, Math.floor((leaf.span.validFromEpoch + leaf.span.validUntilEpoch) / 2));
  assert.equal(proof.covered, true);
  if (proof.covered) {
    const tampered = Buffer.from(proof.leafBytes);
    tampered[0] = tampered[0]! ^ 0xff;
    assert.equal(verifyCredentialInclusion(registry.root, tampered, proof.proof).valid, false);
  }
});

test("an examiner absent from the registry gets no proof", () => {
  const registry = buildRegistry(fixtureEntries());
  const res = credentialProof(registry, commit("STRANGER"), 1200);
  assert.equal(res.covered, false);
  if (!res.covered) assert.match(res.reason, /not in the registry/);
});

test("peritoLeafBytes rejects a non-commitment (guards the deterministic boundary)", () => {
  // A vault token or any non-hex value must never become a leaf.
  assert.throws(() => peritoLeafBytes("gcmf1:abc", span(0, 1)), /64-hex/);
});
