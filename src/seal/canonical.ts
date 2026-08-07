/**
 * Deterministic canonical serialization. The same logical value must always
 * produce the exact same bytes, on any machine, so its hash is reproducible.
 *
 * Rules:
 *  - Type-tagged: 1, "1", 1.0, true are never confusable — check `boolean`
 *    before `number` (JS's `typeof` would otherwise be enough, but the tag
 *    is written explicitly so a canonical string is self-describing).
 *  - Object keys recursively sorted.
 *  - Strings normalized to NFC.
 *  - No floats anywhere — a non-integer number throws rather than silently
 *    losing precision or diverging between platforms.
 *  - Version-stamped, so a future format change can't silently produce a
 *    different hash for what used to canonicalize the same way.
 */

export const CANONICALIZE_VERSION = 1;

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
    if (!Number.isInteger(value)) {
      throw new Error(
        `canonicalize: non-integer number ${value} is not allowed in the decision path — use a Fraction or a bigint`,
      );
    }
    if (!Number.isFinite(value)) {
      throw new Error(`canonicalize: non-finite number ${value} is not allowed`);
    }
    return value.toString();
  }
  if (typeof value === "string") {
    return JSON.stringify(value.normalize("NFC"));
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeValue).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
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
