import { describe, it, expect } from "vitest";
import { shortAddr, formatUsd, formatPrice, formatPct, formatAge, num, parsePairName } from "@/lib/format";

describe("shortAddr", () => {
  it("truncates long addresses", () => {
    expect(shortAddr("0xabc123def45678")).toBe("0xabc1…5678");
  });

  it("handles custom left/right lengths", () => {
    // "0xabc123def4567890" = 18 chars, left=8 right=6, threshold=16 < 18
    // slice(0,8) = "0xabc123", slice(-6) = "567890", result = "0xabc123...567890"
    expect(shortAddr("0xabc123def4567890", 8, 6)).toBe("0xabc123\u2026567890");
  });

  it("returns original for short strings", () => {
    expect(shortAddr("0x1234")).toBe("0x1234");
  });

  it("returns original when too short for custom lengths", () => {
    // 14 chars, left=8 right=6, threshold=16 > 14
    expect(shortAddr("0xabc123def456", 8, 6)).toBe("0xabc123def456");
  });

  it("returns fallback for empty input", () => {
    expect(shortAddr("")).toBe("\u2014");
  });
});

describe("formatUsd", () => {
  it("formats billions", () => {
    expect(formatUsd(1_500_000_000)).toBe("$1.50B");
  });

  it("formats millions", () => {
    expect(formatUsd(2_500_000)).toBe("$2.50M");
  });

  it("formats thousands", () => {
    expect(formatUsd(1_500)).toBe("$1.50K");
  });

  it("formats whole numbers", () => {
    expect(formatUsd(42.5)).toBe("$42.50");
  });

  it("formats small numbers with 6 decimals", () => {
    expect(formatUsd(0.001234)).toBe("$0.001234");
  });

  it("formats zero", () => {
    expect(formatUsd(0)).toBe("$0");
  });

  it("handles exponential for tiny numbers", () => {
    const result = formatUsd(0.00000123);
    expect(result).toMatch(/^\$\d+\.\d{2}e-/);
  });

  it("returns emdash for null", () => {
    expect(formatUsd(null)).toBe("\u2014");
  });

  it("returns emdash for undefined", () => {
    expect(formatUsd(undefined)).toBe("\u2014");
  });

  it("returns emdash for NaN", () => {
    expect(formatUsd(NaN)).toBe("\u2014");
  });
});

describe("formatPrice", () => {
  it("formats prices >= 1 with 4 decimals", () => {
    expect(formatPrice(1.2345)).toBe("$1.2345");
  });

  it("formats prices >= 0.0001 with 6 decimals", () => {
    expect(formatPrice(0.001234)).toBe("$0.001234");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toBe("$0");
  });

  it("handles exponential for tiny prices", () => {
    const result = formatPrice(0.00000123);
    expect(result).toMatch(/^\$\d\.\d{3}e-/);
  });

  it("returns emdash for null", () => {
    expect(formatPrice(null)).toBe("\u2014");
  });
});

describe("formatPct", () => {
  it("adds plus sign for positive", () => {
    expect(formatPct(5.5)).toBe("+5.50%");
  });

  it("adds minus sign for negative", () => {
    expect(formatPct(-3.2)).toBe("-3.20%");
  });

  it("shows zero without sign", () => {
    expect(formatPct(0)).toBe("0.00%");
  });

  it("returns emdash for null", () => {
    expect(formatPct(null)).toBe("\u2014");
  });
});

describe("formatAge", () => {
  it("formats seconds", () => {
    expect(formatAge(30_000)).toBe("30s");
  });

  it("formats minutes", () => {
    expect(formatAge(120_000)).toBe("2m");
  });

  it("formats hours", () => {
    expect(formatAge(7_200_000)).toBe("2h");
  });

  it("formats hours before 48h threshold", () => {
    // 86.4M ms = 24h → still < 48h threshold → shows "24h"
    expect(formatAge(86_400_000)).toBe("24h");
  });

  it("formats days after 48h threshold", () => {
    // 175M ms ≈ 48.6h → > 48h → floor(48.6/24) = 2 → "2d"
    expect(formatAge(175_000_000)).toBe("2d");
  });

  it("returns emdash for null", () => {
    expect(formatAge(null)).toBe("\u2014");
  });

  it("returns emdash for negative", () => {
    expect(formatAge(-1)).toBe("\u2014");
  });
});

describe("num", () => {
  it("converts number strings", () => {
    expect(num("42")).toBe(42);
  });

  it("returns null for empty string", () => {
    expect(num("")).toBe(null);
  });

  it("returns null for null", () => {
    expect(num(null)).toBe(null);
  });

  it("returns null for non-numeric strings", () => {
    expect(num("abc")).toBe(null);
  });
});

describe("parsePairName", () => {
  it("parses simple pair", () => {
    expect(parsePairName("POG / WETH")).toEqual({ base: "POG", quote: "WETH" });
  });

  it("strips fee percentage", () => {
    expect(parsePairName("POG / WETH 1%")).toEqual({ base: "POG", quote: "WETH" });
  });

  it("handles decimal fee", () => {
    expect(parsePairName("TOKEN / USDC 0.3%")).toEqual({ base: "TOKEN", quote: "USDC" });
  });

  it("falls back to WETH when no quote", () => {
    expect(parsePairName("SOLO")).toEqual({ base: "SOLO", quote: "WETH" });
  });
});
