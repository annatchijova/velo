/**
 * Exact rational arithmetic. No floats anywhere on the decision path —
 * a verdict threshold compared with floating point is a verdict that can
 * differ between machines. Every Fraction is kept in lowest terms.
 */

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a === 0n ? 1n : a;
}

export class Fraction {
  readonly num: bigint;
  readonly den: bigint;

  constructor(num: bigint | number, den: bigint | number = 1n) {
    let n = typeof num === "number" ? BigInt(num) : num;
    let d = typeof den === "number" ? BigInt(den) : den;
    if (d === 0n) {
      throw new Error("Fraction: denominator cannot be zero");
    }
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    this.num = n / g;
    this.den = d / g;
  }

  static zero(): Fraction {
    return new Fraction(0n, 1n);
  }

  add(other: Fraction): Fraction {
    return new Fraction(this.num * other.den + other.num * this.den, this.den * other.den);
  }

  compare(other: Fraction): -1 | 0 | 1 {
    const left = this.num * other.den;
    const right = other.num * this.den;
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  greaterThan(other: Fraction): boolean {
    return this.compare(other) > 0;
  }

  lessOrEqual(other: Fraction): boolean {
    return this.compare(other) <= 0;
  }

  toString(): string {
    return `${this.num}/${this.den}`;
  }

  /** Only for display — never for a decision. */
  toDisplayString(decimals = 4): string {
    const scaled = (this.num * 10n ** BigInt(decimals)) / this.den;
    const s = scaled.toString().padStart(decimals + 1, "0");
    return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
  }
}
