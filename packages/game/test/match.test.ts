import { describe, expect, it } from "vitest";
import { resolveMatch, roundResult, startingHp, tickRound } from "../src/engine";
import { createLineProgress } from "../src/progress";
import { DEFAULT_TUNING } from "../src/tuning";
import type { Line, PlayerState, RoundName, RoundResult, RoundState } from "../src/types";

const LINE: Line = {
  id: "groupchat-debate-jab-001",
  tier: "jab",
  text: "you left me on read again okay",
  wordCount: 7,
};

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    slot: 0,
    hp: 100,
    options: [LINE, LINE, LINE],
    progress: createLineProgress(LINE.id),
    momentum: 0,
    specialArmed: false,
    seenLineIds: [],
    ...overrides,
  };
}

function round(overrides: Partial<RoundState> = {}): RoundState {
  return {
    round: "debate",
    endsAt: 45_000,
    status: "live",
    players: [player(), player({ slot: 1 })],
    rngCursor: 0,
    ...overrides,
  };
}

/** HP for both slots at once, the pair `tickRound` and `roundResult` read. */
function hp(you: number, them: number): Pick<RoundState, "players"> {
  return { players: [player({ hp: you }), player({ slot: 1, hp: them })] };
}

const result = (name: RoundName, winner: 0 | 1 | null): RoundResult => ({
  round: name,
  hp: winner === 0 ? [80, 40] : winner === 1 ? [40, 80] : [60, 60],
  winner,
});

describe("tickRound", () => {
  it("leaves a live round untouched, so the caller can skip a render", () => {
    const state = round();
    expect(tickRound(state, 44_999)).toBe(state);
  });

  it("ends the round once the deadline passes", () => {
    expect(tickRound(round(), 45_000).status).toBe("over");
    expect(tickRound(round(), 90_000).status).toBe("over");
  });

  it("ends the round on a knockout, well before the deadline", () => {
    expect(tickRound(round(hp(60, 0)), 1_000).status).toBe("over");
  });

  // SPEC §2.7 as amended by #5: HP never rises and the carry is binary, so a
  // 0-HP player fixes the round result — the remaining seconds cannot move it.
  it("ends rounds 1 and 2 on a knockout too, not only round 3", () => {
    for (const name of ["trigger", "debate", "roast", "fight"] as const) {
      const state = round({ round: name, ...hp(0, 55) });
      expect(tickRound(state, 0).status).toBe("over");
    }
  });

  it("is idempotent — a round already over stays the state it was", () => {
    const over = tickRound(round(), 45_000);
    expect(tickRound(over, 90_000)).toBe(over);
  });

  it("does not mutate its argument (invariant 2)", () => {
    const state = round();
    tickRound(state, 45_000);
    expect(state.status).toBe("live");
  });
});

describe("roundResult", () => {
  it("is null while the round is live", () => {
    expect(roundResult(round())).toBeNull();
  });

  it("gives the round to whoever has more HP left", () => {
    const you = roundResult(tickRound(round(hp(72, 31)), 45_000));
    expect(you).toEqual({ round: "debate", hp: [72, 31], winner: 0 });

    const them = roundResult(tickRound(round(hp(12, 40)), 45_000));
    expect(them?.winner).toBe(1);
  });

  it("calls equal HP a draw, which carries nothing to either player", () => {
    expect(roundResult(tickRound(round(hp(50, 50)), 45_000))?.winner).toBeNull();
  });

  it("gives the round to the player still standing after a knockout", () => {
    expect(roundResult(tickRound(round(hp(0, 3)), 900))?.winner).toBe(1);
  });
});

describe("startingHp", () => {
  const { roundBaseHp: BASE, roundWinHpBonus: ROUND, triggerWinHpBonus: TRIGGER } = DEFAULT_TUNING;

  it("opens rounds 1 and 2 at the base pool, whatever came before", () => {
    const won = [result("trigger", 0), result("debate", 0)];
    expect(startingHp("debate", won, 0)).toBe(BASE);
    expect(startingHp("roast", won, 0)).toBe(BASE);
  });

  it("carries +10 per round won into the fight", () => {
    expect(startingHp("fight", [result("debate", 0)], 0)).toBe(BASE + ROUND);
    expect(startingHp("fight", [result("debate", 0), result("roast", 0)], 0)).toBe(
      BASE + 2 * ROUND,
    );
  });

  it("carries the trigger's +5, deliberately less than a round", () => {
    expect(startingHp("fight", [result("trigger", 0)], 0)).toBe(BASE + TRIGGER);
    expect(TRIGGER).toBeLessThan(ROUND);
  });

  // SPEC §2.7's stated ceiling: +20 from the rounds, plus the trigger bonus.
  it("tops out at +25 for a player who swept everything", () => {
    const swept = [result("trigger", 0), result("debate", 0), result("roast", 0)];
    expect(startingHp("fight", swept, 0)).toBe(BASE + TRIGGER + 2 * ROUND);
    expect(startingHp("fight", swept, 1)).toBe(BASE);
  });

  it("carries nothing out of a drawn round", () => {
    const drawn = [result("debate", null), result("roast", null)];
    expect(startingHp("fight", drawn, 0)).toBe(BASE);
    expect(startingHp("fight", drawn, 1)).toBe(BASE);
  });

  it("splits the carry when the players took a round each", () => {
    const split = [result("debate", 0), result("roast", 1)];
    expect(startingHp("fight", split, 0)).toBe(BASE + ROUND);
    expect(startingHp("fight", split, 1)).toBe(BASE + ROUND);
  });
});

describe("resolveMatch", () => {
  it("gives the match to whoever took the fight", () => {
    const rounds = [result("debate", 1), result("roast", 1), result("fight", 0)];
    expect(resolveMatch(rounds)).toEqual({ winner: 0, rounds });
  });

  // The whole point of §2.7: rounds 1-2 pay out as HP, never as a clinch.
  it("does not let a player clinch by winning rounds 1 and 2", () => {
    const swept = [result("debate", 0), result("roast", 0), result("fight", 1)];
    expect(resolveMatch(swept).winner).toBe(1);
  });

  it("calls a level fight a draw", () => {
    expect(resolveMatch([result("fight", null)]).winner).toBeNull();
  });

  it("has no winner when the fight never happened", () => {
    expect(resolveMatch([result("debate", 0)]).winner).toBeNull();
  });
});
