/**
 * Layer 6 — encrypted-at-rest vault for a perito's secret.
 *
 * A faithful TypeScript port of continuum's `legacy/core/dbcrypto.py`
 * (application-level field encryption) to Node's `crypto`. The perito's
 * private identity (real name, license number, `leafSecretKey`) is stored
 * encrypted so that a stolen state file is not plaintext identity. This is
 * the "conservar secretos como en continuum" layer.
 *
 * Primitive: AES-256-GCM with a random 12-byte nonce per value. Token format
 * (a string, safe for JSON/TEXT storage):
 *
 *     gcmf1:<base64url(nonce(12) || ciphertext || tag(16))>
 *
 * AAD (associated data): each value is bound to its CONTEXT, "<peritoId>:<field>".
 * An attacker who can write the store cannot move an encrypted value to
 * another perito or field without invalidating the tag. AAD is authenticated,
 * not encrypted; the caller must supply a stable, unique context.
 *
 * Plaintext/ciphertext coexistence (transparent migration): `isEncrypted`
 * identifies a token by its prefix; `decryptField` returns a non-prefixed
 * value unchanged so a partially migrated store stays readable.
 *
 * PORTED LESSON (continuum R5-001): `encryptField` ALWAYS encrypts its input.
 * It never tries to detect whether the plaintext "already looks encrypted" —
 * that heuristic misclassifies plaintext beginning with the ciphertext prefix
 * and leaves it in the clear. Idempotent migration is the caller's job
 * (check `isEncrypted` on the STORED form, escape ambiguous plaintext first).
 *
 * ============================ DETERMINISM BOUNDARY ============================
 * This module's output is NON-DETERMINISTIC by design: a fresh random nonce
 * per call means the same plaintext encrypts to a different token every time.
 * It MUST NEVER be canonicalized, sealed, or placed in a Merkle leaf. Only the
 * DETERMINISTIC `peritoSecretCommitment` (secret.ts) enters the tree. Perito
 * secret -> (deterministic hash) -> leaf; perito secret -> (this vault, random
 * nonce) -> bytes at rest. The two never cross.
 * =============================================================================
 *
 * Vault-key management (where the 32 key bytes come from, how they are
 * unlocked) is a DEPLOYMENT question and is intentionally out of scope here,
 * exactly as witnesses.ts leaves salt persistence to the caller. This module
 * takes a key; it does not derive or store one.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const FIELD_PREFIX = "gcmf1:"; // ciphertext token
const PLAIN_ESCAPE = "gcmf0:"; // escaped plaintext (see escapePlaintext)
const NONCE_LEN = 12;
const KEY_LEN = 32;
const TAG_LEN = 16;

export class FieldCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldCryptoError";
  }
}

/** True if `value` is a token produced by this module. */
export function isEncrypted(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith(FIELD_PREFIX);
}

/**
 * Return a plaintext storage form unambiguous with ciphertext. Plaintext that
 * happens to start with `gcmf1:` or `gcmf0:` is prefixed with `gcmf0:` so it
 * is never mistaken for a real token on read.
 */
export function escapePlaintext(value: string): string {
  if (value.startsWith(FIELD_PREFIX) || value.startsWith(PLAIN_ESCAPE)) {
    return PLAIN_ESCAPE + value;
  }
  return value;
}

/** Reverse escapePlaintext and recover the logical plaintext value. */
export function unescapePlaintext(stored: string): string {
  if (stored.startsWith(PLAIN_ESCAPE)) {
    return stored.slice(PLAIN_ESCAPE.length);
  }
  return stored;
}

/**
 * Encrypt and decrypt values with a 32-byte key. The key is kept only in
 * memory while the vault is open and is never persisted by this module.
 */
export class FieldCipher {
  private readonly key: Buffer;

  constructor(key: Buffer | Uint8Array) {
    const k = Buffer.from(key);
    if (k.length !== KEY_LEN) {
      throw new Error(`The vault key must be ${KEY_LEN} bytes, got ${k.length}.`);
    }
    this.key = k;
  }

  /**
   * Encrypt `plaintext`, binding it to `aad` (the "<peritoId>:<field>"
   * context). Always encrypts — never heuristically skips (R5-001).
   */
  encryptField(plaintext: string, aad: string): string {
    const nonce = randomBytes(NONCE_LEN);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce, { authTagLength: TAG_LEN });
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
    const tag = cipher.getAuthTag();
    // nonce || ciphertext || tag — the same layout continuum's AESGCM.encrypt
    // produces (which appends the tag to the ciphertext).
    const blob = Buffer.concat([nonce, ct, tag]);
    return FIELD_PREFIX + blob.toString("base64url");
  }

  /**
   * Decrypt a token. A non-prefixed value is returned unchanged so a
   * partially migrated store stays readable. A prefixed token that fails
   * authentication (wrong key, wrong AAD, or tampered bytes) raises
   * FieldCryptoError — it NEVER returns partial or garbage plaintext.
   */
  decryptField(token: string, aad: string): string {
    if (!isEncrypted(token)) {
      return token;
    }
    try {
      const blob = Buffer.from(token.slice(FIELD_PREFIX.length), "base64url");
      if (blob.length < NONCE_LEN + TAG_LEN) {
        throw new Error("truncated token");
      }
      const nonce = blob.subarray(0, NONCE_LEN);
      const tag = blob.subarray(blob.length - TAG_LEN);
      const ct = blob.subarray(NONCE_LEN, blob.length - TAG_LEN);
      const decipher = createDecipheriv("aes-256-gcm", this.key, nonce, { authTagLength: TAG_LEN });
      decipher.setAAD(Buffer.from(aad, "utf8"));
      decipher.setAuthTag(tag);
      // `final()` throws if the tag does not verify — this is the fail-closed
      // point. Node accumulates plaintext in update(), but we only return it
      // after final() has confirmed authenticity.
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
      return pt.toString("utf8");
    } catch (exc) {
      throw new FieldCryptoError(
        `Could not decrypt field (incorrect key/AAD or tampered data): ${(exc as Error).message}`,
      );
    }
  }

  /** Decrypt tokens; otherwise return the value unchanged. Preserves null. */
  maybeDecrypt(value: string | null, aad: string): string | null {
    if (value === null) {
      return null;
    }
    return this.decryptField(value, aad);
  }
}

/**
 * The perito-facing wrapper. Binds every field to the "<peritoId>:<field>"
 * context so a value sealed for one perito/field cannot be replayed into
 * another. `field` names which part of the secret is being stored
 * (e.g. "realName", "licenseId", "leafSecretKey").
 */
export class PeritoVault {
  private readonly cipher: FieldCipher;

  constructor(key: Buffer | Uint8Array) {
    this.cipher = new FieldCipher(key);
  }

  private static context(peritoId: string, field: string): string {
    return `${peritoId}:${field}`;
  }

  sealSecret(peritoId: string, field: string, plaintext: string): string {
    return this.cipher.encryptField(plaintext, PeritoVault.context(peritoId, field));
  }

  openSecret(peritoId: string, field: string, token: string): string {
    return this.cipher.decryptField(token, PeritoVault.context(peritoId, field));
  }
}
