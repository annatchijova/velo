/**
 * Deterministic canonical serialization. The same logical value must always
 * produce the exact same bytes, on any machine, so its hash is reproducible.
 *
 * Rules:
 *  - Type-tagged: 1, "1", 1.0, true are never confusable — check `boolean`
 *    before `number` (JS's `typeof` would otherwise be enough, but the tag
 *    is written explicitly so a canonical string is self-describing).
 *  - Object keys recursively sorted BY UNICODE CODE POINT (see below).
 *  - Strings normalized to NFC.
 *  - No floats anywhere — a non-integer number throws rather than silently
 *    losing precision or diverging between platforms.
 *  - Integers must be exactly representable (safe integers only).
 *  - Version-stamped, so a future format change can't silently produce a
 *    different hash for what used to canonicalize the same way.
 *
 * VERSION 2 (red team F9): v1 used `Array.prototype.sort()`, which orders
 * strings by UTF-16 code unit. Astral-plane characters (emoji, CJK
 * ext-B) are stored as surrogate pairs and sort *before* characters in
 * the U+E000–U+FFFF private-use/BMP range under that rule, but *after*
 * them under code-point ordering, which is what almost every other
 * language's default sort gives you. A counter-expert reimplementing
 * this verifier in Python — the explicitly intended use case — would
 * compute a different hash for an intact bundle and conclude "evidence
 * altered". A false negative on integrity is nearly as damaging as a
 * false positive in a courtroom. Ordering is now specified and
 * implemented explicitly instead of inherited from the language.
 */

export const CANONICALIZE_VERSION = 2;

/**
 * Compares by Unicode code point, not UTF-16 code unit. `[...s]` iterates
 * code points, so this is portable to any language that sorts by code
 * point (Python, Go, Rust) rather than matching a JS-specific quirk.
 */
function compareByCodePoint(a: string, b: string): number {
  const ca = [...a];
  const cb = [...b];
  const len = Math.min(ca.length, cb.length);
  for (let i = 0; i < len; i++) {
    const pa = ca[i]!.codePointAt(0)!;
    const pb = cb[i]!.codePointAt(0)!;
    if (pa !== pb) return pa < pb ? -1 : 1;
  }
  return ca.length === cb.length ? 0 : ca.length < cb.length ? -1 : 1;
}

/**
 * Documents the shape this function accepts. The exported functions take
 * `unknown` instead — real-world call sites pass typed interfaces
 * (EvidenceManifest, etc.) whose structural shape doesn't literally match
 * this recursive union, even though every value in them is JSON-safe.
 * Runtime checks below are the actual enforcement; this type is documentation.
 */
type Canonicalizable =
  | null
  | boolean
  | number
  | bigint
  | string
  | Canonicalizable[]
  | { [key: string]: Canonicalizable };

function canonicalizeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "bigint") {
    return `${value.toString()}n`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`canonicalize: non-finite number ${value} is not allowed`);
    }
    if (!Number.isInteger(value)) {
      throw new Error(
        `canonicalize: non-integer number ${value} is not allowed in the decision path — use a Fraction or a bigint`,
      );
    }
    // Red team F11: Number.isInteger accepts values above 2^53, where JSON
    // parsing has already silently rounded — the sealed hash would certify
    // a number the source document never contained. The comment on this
    // module promises to throw rather than lose precision silently; this
    // makes that true for large integers too.
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        `canonicalize: integer ${value} exceeds the safe range (2^53-1) and may already have lost precision — use a bigint`,
      );
    }
    // Red team F11: -0 and 0 are distinct under Object.is but stringify
    // identically. Normalized explicitly so the collision is a decision,
    // not an accident.
    return Object.is(value, -0) ? "0" : value.toString();
  }
  if (typeof value === "string") {
    return JSON.stringify(value.normalize("NFC"));
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeValue).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareByCodePoint);
    const entries = keys.map((k) => `${JSON.stringify(k.normalize("NFC"))}:${canonicalizeValue(record[k])}`);
    return `{${entries.join(",")}}`;
  }
  throw new Error(`canonicalize: unsupported value of type ${typeof value}`);
}

export function canonicalize(value: unknown): string {
  return `v${CANONICALIZE_VERSION}:${canonicalizeValue(value)}`;
}

export function canonicalizeToBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
