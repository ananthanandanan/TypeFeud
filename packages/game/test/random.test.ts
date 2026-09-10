import { describe, expect, it } from "vitest";
import { nextRandom, playerSeeds } from "../src/random";

describe("seeded random state", () => {
  it("matches the fixed Mulberry32 vector for seed 1", () => {
    let state = 1;
    const values: number[] = [];
    for (let i = 0; i < 3; i++) {
      const next = nextRandom(state);
      values.push(next.value);
      state = next.state;
    }
    expect(values).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  });

  it("supports zero and uint32 overflow with explicit, repeatable state", () => {
    for (const seed of [0, 1, 0xffffffff]) {
      const result = nextRandom(seed);
      expect(nextRandom(seed)).toEqual(result);
      expect(result.state).toBeGreaterThanOrEqual(0);
      expect(result.state).toBeLessThanOrEqual(0xffffffff);
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.value).toBeLessThan(1);
      expect(playerSeeds(seed)[0]).not.toBe(playerSeeds(seed)[1]);
    }
  });
});
