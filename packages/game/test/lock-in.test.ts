import { describe, expect, it } from "vitest";
import { applyKeystroke, BACKSPACE, dealOptions, lockIn } from "../src/engine";
import { createLineProgress, uncorrectedErrors } from "../src/progress";
import type { KeyEvent, Line, PlayerState, RoundState } from "../src/types";

const JAB: Line = {
  id: "groupchat-debate-jab-002",
  tier: "jab",
  text: "Four hours. I counted them.",
  wordCount: 5,
};
const COMBO: Line = {
  id: "groupchat-debate-combo-002",
  tier: "combo",
  text: "A thumbs up is not a response, it is a verdict.",
  wordCount: 11,
};
const HAYMAKER: Line = {
  id: "groupchat-debate-haymaker-002",
  tier: "haymaker",
  text: "You had time to react to a reel, rate a restaurant, and change your profile picture twice.",
  wordCount: 17,
};

const OPTIONS: [Line, Line, Line] = [JAB, COMBO, HAYMAKER];

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    slot: 0,
    hp: 100,
    options: OPTIONS,
    /** nothing locked in — the state a player is in at the start of every line */
    progress: null,
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

const key = (k: string, t = 0): KeyEvent => ({ t, key: k });
const progressOf = (state: RoundState, slot: 0 | 1 = 0) => state.players[slot].progress;

describe("lockIn", () => {
  it("chooses the option whose first character was typed", () => {
    expect(progressOf(lockIn(round(), key("F")))!.lineId).toBe(JAB.id);
    expect(progressOf(lockIn(round(), key("A")))!.lineId).toBe(COMBO.id);
    expect(progressOf(lockIn(round(), key("Y")))!.lineId).toBe(HAYMAKER.id);
  });

  it("counts the locking keystroke as the line's first character", () => {
    const after = lockIn(round(), key("F", 700));
    const progress = progressOf(after)!;
    expect(progress.charIndex).toBe(1);
    expect(progress.typedChars).toEqual(["F"]);
    expect(uncorrectedErrors(progress)).toBe(0);
    expect(progress.startedAt).toBe(700);
  });

  it("locks in on a case slip, and charges it as a repairable error", () => {
    const after = lockIn(round(), key("f"));
    const progress = progressOf(after)!;
    expect(progress.lineId).toBe(JAB.id);
    expect(uncorrectedErrors(progress)).toBe(1);

    const repaired = applyKeystroke(after, key(BACKSPACE, 1));
    expect(uncorrectedErrors(progressOf(repaired)!)).toBe(0);
  });

  it("breaks a tie in options order", () => {
    const collide: [Line, Line, Line] = [JAB, { ...COMBO, text: "Four in a row, actually." }, HAYMAKER];
    const state = round({ players: [player({ options: collide }), player({ slot: 1 })] });
    expect(progressOf(lockIn(state, key("F")))!.lineId).toBe(JAB.id);
  });

  it("is a no-op when the key matches no option", () => {
    const state = round();
    expect(lockIn(state, key("z"))).toBe(state);
    expect(lockIn(state, key(BACKSPACE))).toBe(state);
    expect(lockIn(state, key("Shift"))).toBe(state);
  });

  it("is a no-op once a line is locked in", () => {
    const state = round({
      players: [player({ progress: createLineProgress(JAB.id) }), player({ slot: 1 })],
    });
    expect(lockIn(state, key("Y"))).toBe(state);
  });

  it("locks in for the slot the keystroke names", () => {
    const after = lockIn(round(), { t: 0, key: "Y", slot: 1 });
    expect(progressOf(after, 0)).toBeNull();
    expect(progressOf(after, 1)!.lineId).toBe(HAYMAKER.id);
  });

  it("does not mutate the state it was given", () => {
    const state = round();
    lockIn(state, key("F"));
    expect(state.players[0].progress).toBeNull();
  });
});

describe("applyKeystroke — before a line is locked in", () => {
  it("routes the first keystroke through lock-in", () => {
    const after = applyKeystroke(round(), key("Y"));
    expect(progressOf(after)!.lineId).toBe(HAYMAKER.id);
    expect(progressOf(after)!.charIndex).toBe(1);
  });

  it("keeps typing the locked line once one is chosen", () => {
    const after = Array.from("You had").reduce((state, k, i) => applyKeystroke(state, key(k, i)), round());
    expect(progressOf(after)!.lineId).toBe(HAYMAKER.id);
    expect(progressOf(after)!.charIndex).toBe(7);
    expect(uncorrectedErrors(progressOf(after)!)).toBe(0);
  });
});

describe("dealOptions", () => {
  const next: [Line, Line, Line] = [
    { ...JAB, id: "groupchat-debate-jab-001" },
    { ...COMBO, id: "groupchat-debate-combo-001" },
    { ...HAYMAKER, id: "groupchat-debate-haymaker-001" },
  ];

  it("replaces the three options and clears whatever was being typed", () => {
    const typed = applyKeystroke(round(), key("F"));
    const dealt = dealOptions(typed, 0, next);
    expect(dealt.players[0].options).toEqual(next);
    expect(dealt.players[0].progress).toBeNull();
  });

  it("leaves HP, momentum and the other player alone", () => {
    const state = round({
      players: [player({ hp: 42, momentum: 3, specialArmed: true }), player({ slot: 1, hp: 58 })],
    });
    const dealt = dealOptions(state, 0, next);
    expect(dealt.players[0].hp).toBe(42);
    expect(dealt.players[0].momentum).toBe(3);
    expect(dealt.players[0].specialArmed).toBe(true);
    expect(dealt.players[1]).toBe(state.players[1]);
  });

  it("does not mutate the state it was given", () => {
    const state = round();
    dealOptions(state, 0, next);
    expect(state.players[0].options).toEqual(OPTIONS);
  });
});
