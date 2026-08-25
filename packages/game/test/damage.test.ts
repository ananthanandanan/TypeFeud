import { describe, expect, it } from "vitest";
import { accuracyMult, computeDamage, speedMult, wpm } from "../src/damage";

describe("accuracyMult", () => {
  it("is 1.0 on a clean line", () => {
    expect(accuracyMult(0)).toBe(1);
  });

  it("loses 15% per uncorrected error", () => {
    expect(accuracyMult(2)).toBeCloseTo(0.7, 5);
  });

  it("floors at 0.4 so a messy line still lands something", () => {
    expect(accuracyMult(99)).toBe(0.4);
  });
});

describe("speedMult", () => {
  it("is 1.0 at par WPM", () => {
    expect(speedMult(60)).toBe(1);
  });

  it("clamps to [0.7, 1.4]", () => {
    expect(speedMult(0)).toBe(0.7);
    expect(speedMult(500)).toBe(1.4);
  });
});

describe("wpm", () => {
  it("uses the 5-characters-per-word convention", () => {
    // 300 chars in 60s = 60 wpm
    expect(wpm(300, 60_000)).toBeCloseTo(60, 5);
  });
});

// The three worked examples from SPEC §2.5. If these move, the spec moves too.
describe("computeDamage — spec worked examples", () => {
  it("clean haymaker at 80 WPM lands ~40", () => {
    const { damage, selfDamage } = computeDamage({
      tier: "haymaker",
      uncorrectedErrors: 0,
      lineWpm: 80,
      special: false,
    });
    expect(damage).toBeCloseTo(40, 0);
    expect(selfDamage).toBe(0);
  });

  it("two-error haymaker at 80 WPM lands ~28 plus 4 self-damage", () => {
    const { damage, selfDamage } = computeDamage({
      tier: "haymaker",
      uncorrectedErrors: 2,
      lineWpm: 80,
      special: false,
    });
    expect(damage).toBeCloseTo(28, 0);
    expect(selfDamage).toBe(4);
  });

  it("clean jab at 60 WPM lands 6", () => {
    const { damage } = computeDamage({
      tier: "jab",
      uncorrectedErrors: 0,
      lineWpm: 60,
      special: false,
    });
    expect(damage).toBeCloseTo(6, 5);
  });
});

describe("computeDamage — special", () => {
  it("multiplies the next completed line by 1.8", () => {
    const plain = computeDamage({ tier: "combo", uncorrectedErrors: 0, lineWpm: 60, special: false });
    const special = computeDamage({ tier: "combo", uncorrectedErrors: 0, lineWpm: 60, special: true });
    expect(special.damage).toBeCloseTo(plain.damage * 1.8, 5);
  });
});
