/**
 * Layer 6 — the encrypted-at-rest vault (ported dbcrypto.py): round-trip,
 * fail-closed tamper detection, AAD binding, transparent migration.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { FieldCipher, PeritoVault, FieldCryptoError, isEncrypted, escapePlaintext, unescapePlaintext } from "../src/perito/vault.js";

const key = () => randomBytes(32);

test("round-trip: decrypt(encrypt(x)) === x", () => {
  const c = new FieldCipher(key());
  const secret = "CPCI-RNS-INF-05190 / Nadia R.";
  const token = c.encryptField(secret, "VELO-PERITO-005:licenseId");
  assert.ok(isEncrypted(token));
  assert.equal(c.decryptField(token, "VELO-PERITO-005:licenseId"), secret);
});

test("tamper is fail-closed: a flipped byte raises FieldCryptoError, never garbage", () => {
  const c = new FieldCipher(key());
  const token = c.encryptField("secret", "ctx");
  // Corrupt one byte of the base64url payload.
  const chars = token.split("");
  const i = token.length - 3;
  chars[i] = chars[i] === "A" ? "B" : "A";
  assert.throws(() => c.decryptField(chars.join(""), "ctx"), FieldCryptoError);
});

test("AAD binding: decrypting under a different context fails", () => {
  const c = new FieldCipher(key());
  const token = c.encryptField("secret", "VELO-PERITO-001:realName");
  assert.throws(() => c.decryptField(token, "VELO-PERITO-002:realName"), FieldCryptoError);
});

test("wrong key fails closed", () => {
  const token = new FieldCipher(key()).encryptField("secret", "ctx");
  assert.throws(() => new FieldCipher(key()).decryptField(token, "ctx"), FieldCryptoError);
});

test("transparent migration: a plaintext value passes through decrypt unchanged", () => {
  const c = new FieldCipher(key());
  assert.equal(c.decryptField("legacy-plaintext", "ctx"), "legacy-plaintext");
  assert.equal(c.maybeDecrypt(null, "ctx"), null);
});

test("plaintext that looks like a token is escaped and recovered", () => {
  assert.equal(unescapePlaintext(escapePlaintext("gcmf1:not-really")), "gcmf1:not-really");
  assert.equal(unescapePlaintext(escapePlaintext("normal")), "normal");
  assert.ok(escapePlaintext("gcmf1:x").startsWith("gcmf0:"));
});

test("nonce uniqueness: same plaintext encrypts to different tokens each time", () => {
  const c = new FieldCipher(key());
  const a = c.encryptField("same", "ctx");
  const b = c.encryptField("same", "ctx");
  assert.notEqual(a, b, "a fresh random nonce must make the token non-deterministic");
});

test("PeritoVault binds to peritoId:field context", () => {
  const v = new PeritoVault(key());
  const token = v.sealSecret("VELO-PERITO-005", "leafSecretKey", "deadbeef");
  assert.equal(v.openSecret("VELO-PERITO-005", "leafSecretKey", token), "deadbeef");
  assert.throws(() => v.openSecret("VELO-PERITO-005", "realName", token), FieldCryptoError);
});

test("a wrong-length key is rejected", () => {
  assert.throws(() => new FieldCipher(randomBytes(16)), /32 bytes/);
});
