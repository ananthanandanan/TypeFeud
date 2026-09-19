import { describe, expect, it } from "vitest";
import { emptyMatchStats, recordLineStats, resultStats } from "../src/match/stats";

describe("match result stats", () => {
  it("aggregates gross WPM, final accuracy, and the biggest hit", () => {
    let stats = emptyMatchStats();
    stats = recordLineStats(stats, 0, "debate", 30, 6_000, {
      lineId: "first",
      tier: "combo",
      damage: 13,
      selfDamage: 2,
      uncorrectedErrors: 1,
      lineWpm: 60,
      specialConsumed: false,
    });
    stats = recordLineStats(stats, 0, "fight", 30, 4_000, {
      lineId: "second",
      tier: "haymaker",
      damage: 40,
      selfDamage: 0,
      uncorrectedErrors: 0,
      lineWpm: 90,
      specialConsumed: true,
    });

    expect(resultStats(stats[0])).toEqual({
      wpm: 72,
      accuracy: 98,
      biggestHit: { damage: 40, round: "fight", tier: "haymaker" },
    });
    expect(resultStats(stats[1])).toEqual({ wpm: 0, accuracy: 100, biggestHit: null });
  });

  it("does not mutate an earlier snapshot", () => {
    const before = emptyMatchStats();
    const after = recordLineStats(before, 1, "roast", 10, 2_000, {
      lineId: "line",
      tier: "jab",
      damage: 6,
      selfDamage: 0,
      uncorrectedErrors: 0,
      lineWpm: 60,
      specialConsumed: false,
    });
    expect(before[1].completedLines).toBe(0);
    expect(after[1].completedLines).toBe(1);
  });
});
