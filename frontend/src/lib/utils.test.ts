import { describe, it, expect } from "vitest";
import { fractionToNumber, truncateAddress, shortHash } from "./utils";

describe("fractionToNumber", () => {
  it("parses a fraction string into a number", () => {
    expect(fractionToNumber("3/10")).toBe(0.3);
  });

  it("parses a plain number string", () => {
    expect(fractionToNumber("0.75")).toBe(0.75);
  });

  it("returns 0 for empty input", () => {
    expect(fractionToNumber("")).toBe(0);
  });

  it("returns 0 for malformed fractions", () => {
    expect(fractionToNumber("3/")).toBe(0);
    expect(fractionToNumber("abc")).toBe(0);
  });
});

describe("truncateAddress", () => {
  it("shortens a long address with ellipsis", () => {
    expect(truncateAddress("0x1234567890abcdef", 4)).toBe("0x12…cdef");
  });

  it("returns short addresses unchanged", () => {
    expect(truncateAddress("0xabc")).toBe("0xabc");
  });
});

describe("shortHash", () => {
  it("shortens a hash with ellipsis", () => {
    expect(shortHash("deadbeef1234567890deadbeef", 6)).toBe("deadbe…adbeef");
  });
});
