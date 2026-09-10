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
    ...overrides,
  };
}

/** A player who has typed `chars` of their locked-in line, correctly. */
function typedTo(slot: 0 | 1, chars: number): PlayerState {
  return player({
    slot,
    progress: {
      lineId: LINE.id,
      charIndex: chars,
      wrongIndices: [],
      typedChars: [...LINE.text.slice(0, chars)],
      startedAt: 0,
    },
  });
}

const completed = (slot: 0 | 1): Pick<RoundState, "players"> => ({
  players: slot === 0
    ? [typedTo(0, LINE.text.length), player({ slot: 1, progress: null })]
    : [player({ progress: null }), typedTo(1, LINE.text.length)],
});

const partial = (slot: 0 | 1): Pick<RoundState, "players"> => ({
  players: slot === 0
    ? [typedTo(0, 3), player({ slot: 1, progress: null })]
    : [player({ progress: null }), typedTo(1, 3)],
});

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

  // SPEC §2.2 — the trigger is a quick-draw, not a 2s damage round.
  it("ends the trigger the moment a line is finished", () => {
    const typed = round({ round: "trigger", ...completed(0) });
    expect(tickRound(typed, 1).status).toBe("over");
  });

  it("ends the trigger on either player's word", () => {
    const typed = round({ round: "trigger", ...completed(1) });
    expect(tickRound(typed, 1).status).toBe("over");
  });

  it("leaves the trigger alone while the word is half typed", () => {
    const half = round({ round: "trigger", ...partial(0) });
    expect(tickRound(half, 1).status).toBe("live");
  });

  it("does not end an ordinary round on a finished line", () => {
    for (const name of ["debate", "roast", "fight"] as const) {
      expect(tickRound(round({ round: name, ...completed(0) }), 1).status).toBe("live");
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

  // SPEC §2.2. Read from progress rather than HP, so the answer does not depend
  // on whether the caller resolved the completing line before ticking or after.
  it("gives the trigger to whoever finished the word", () => {
    expect(roundResult(tickRound(round({ round: "trigger", ...completed(0) }), 1))?.winner).toBe(0);
    expect(roundResult(tickRound(round({ round: "trigger", ...completed(1) }), 1))?.winner).toBe(1);
  });

  it("gives the trigger to nobody when it timed out unfinished", () => {
    const nobody = round({ round: "trigger", endsAt: 2_000, ...partial(0) });
    expect(roundResult(tickRound(nobody, 2_000))?.winner).toBeNull();
  });

  it("ignores trigger damage — the word is what wins it", () => {
    // Slot 1 is ahead on HP and has still lost the trigger.
    const behind = round({
      round: "trigger",
      players: [typedTo(0, LINE.text.length), player({ slot: 1, hp: 100, progress: null })],
    });
    const state = { ...behind, players: [{ ...behind.players[0], hp: 40 }, behind.players[1]] } as RoundState;
    expect(roundResult(tickRound(state, 1))?.winner).toBe(0);
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
