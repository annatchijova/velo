/**
 * Layer 6 — the determinism boundary (CLAUDE.md 5.2 / 5.3).
 *
 * What enters the tree must be reproducible bit-for-bit; what is stored at
 * rest must NOT be (random nonce). This test pins both sides so a future
 * change that accidentally seals a vault token, or de-randomizes the vault,
 * fails loudly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { peritoSecretCommitment, type PeritoSecret } from "../src/perito/secret.js";
import { buildRegistry, peritoLeafBytes, type PeritoRegistryEntry } from "../src/perito/registry.js";
import { PeritoVault } from "../src/perito/vault.js";
import type { ValiditySpan } from "../src/perito/credential.js";

const secret: PeritoSecret = {
  peritoId: "VELO-PERITO-005",
  realName: "Nadia R.",
  licenseId: "CPCI-RNS-INF-05190",
  leafSecretKey: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
};
const span: ValiditySpan = { validFromEpoch: 1748736000, validUntilEpoch: 1769904000 };

test("the perito secret commitment is deterministic across runs", () => {
  assert.equal(peritoSecretCommitment(secret), peritoSecretCommitment({ ...secret }));
});

test("the registry leaf and root are byte-identical for fixed inputs", () => {
  const commitment = peritoSecretCommitment(secret);
  const leafA = peritoLeafBytes(commitment, span);
  const leafB = peritoLeafBytes(commitment, span);
  assert.ok(leafA.equals(leafB), "leaf bytes must be reproducible");
  const entry: PeritoRegistryEntry = { peritoId: secret.peritoId, peritoCommitment: commitment, spans: [span] };
  assert.equal(buildRegistry([entry]).root, buildRegistry([entry]).root);
});

test("the vault token is NEVER identical across runs (excluded from any sealed/Merkle path)", () => {
  const vault = new PeritoVault(randomBytes(32));
  const t1 = vault.sealSecret(secret.peritoId, "realName", secret.realName);
  const t2 = vault.sealSecret(secret.peritoId, "realName", secret.realName);
  assert.notEqual(t1, t2, "if these were equal, the vault would be deterministic and could leak into a seal");
});

test("a vault token cannot be smuggled into a leaf (the bridge is one-way and hex-only)", () => {
  const vault = new PeritoVault(randomBytes(32));
  const token = vault.sealSecret(secret.peritoId, "leafSecretKey", secret.leafSecretKey);
  // The only path secret -> tree is via a deterministic hex commitment;
  // a ciphertext token is not 64-hex and is rejected outright.
  assert.throws(() => peritoLeafBytes(token, span), /64-hex/);
});
