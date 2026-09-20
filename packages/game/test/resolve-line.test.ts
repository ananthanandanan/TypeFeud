import { describe, expect, it } from "vitest";
import { BACKSPACE, applyKeystroke, resolveLine, triggerSpecial } from "../src/engine";
import { createLineProgress, specialReady } from "../src/progress";
import { DEFAULT_TUNING } from "../src/tuning";
import type { KeyEvent, Line, PlayerState, RoundState } from "../src/types";

/** 30 characters, so a whole number of ms per character makes WPM exact. */
const LINE: Line = {
  id: "groupchat-debate-jab-001",
  tier: "jab",
  text: "you left me on read again okay",
  wordCount: 7,
};

const HAYMAKER: Line = { ...LINE, id: "groupchat-debate-haymaker-001", tier: "haymaker" };

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

/**
 * Type `keys` at a fixed pace and resolve on the last keystroke. `msPerChar`
 * is what sets the line's WPM: 5 chars per word, so 200ms/char is exactly
 * 60 WPM and lands speedMult on 1.0.
 */
function typeAndResolve(state: RoundState, keys: string, msPerChar = 200, slot: 0 | 1 = 0) {
  const start = msPerChar;
  const typed = Array.from(keys).reduce(
    (acc, key, i) => applyKeystroke(acc, { t: start + i * msPerChar, key, slot } satisfies KeyEvent),
    state,
  );
  const now = start + (keys.length - 1) * msPerChar;
  return resolveLine(typed, { now, slot });
}

/** The line typed perfectly, one keystroke at a time. */
const clean = (state: RoundState, msPerChar = 200) => typeAndResolve(state, LINE.text, msPerChar);

describe("resolveLine — damage (SPEC §2.5)", () => {
  it("a clean jab at par speed is base damage", () => {
    // 30 chars at 200ms = 5.8s from first to last keystroke, but WPM is measured
    // from the clock start, so 29 intervals — just under par, still clamped above.
    const { outcome } = clean(round());
    expect(outcome.uncorrectedErrors).toBe(0);
    expect(outcome.lineWpm).toBeCloseTo(62.07, 2);
    expect(outcome.damage).toBe(6);
    expect(outcome.selfDamage).toBe(0);
  });

  it("scales with the tier", () => {
    const state = round({
      players: [
        player({ options: [HAYMAKER, HAYMAKER, HAYMAKER], progress: createLineProgress(HAYMAKER.id) }),
        player({ slot: 1 }),
      ],
    });
    const { outcome } = clean(state);
    expect(outcome.tier).toBe("haymaker");
    expect(outcome.damage).toBe(31);
  });

  it("charges uncorrected errors once, in damage and in self-damage", () => {
    const wrong = LINE.text.slice(0, 3) + "XX" + LINE.text.slice(5);
    const { outcome } = typeAndResolve(round(), wrong);
    expect(outcome.uncorrectedErrors).toBe(2);
    // 6 × (1 − 0.15×2) × 1.03 ≈ 4.3
    expect(outcome.damage).toBe(4);
    expect(outcome.selfDamage).toBe(2 * DEFAULT_TUNING.selfDamagePerError);
  });

  it("never charges a repaired error — backspace costs time, not damage", () => {
    // Type one wrong character, walk it back, type it right, then finish.
    let state = round();
    state = applyKeystroke(state, { t: 100, key: "X" });
    state = applyKeystroke(state, { t: 200, key: BACKSPACE });
    const rest = Array.from(LINE.text).reduce((acc, key, i) => applyKeystroke(acc, { t: 300 + i * 200, key }), state);
    const { outcome } = resolveLine(rest, { now: 300 + (LINE.text.length - 1) * 200 });
    expect(outcome.uncorrectedErrors).toBe(0);
    expect(outcome.selfDamage).toBe(0);
  });

  it("takes its tunables from the argument, not the module constants", () => {
    const tuned = resolveLine(
      Array.from(LINE.text).reduce((acc, key, i) => applyKeystroke(acc, { t: 200 + i * 200, key }), round()),
      { now: 200 + (LINE.text.length - 1) * 200 },
      { ...DEFAULT_TUNING, tierBaseDamage: { ...DEFAULT_TUNING.tierBaseDamage, jab: 60 } },
    );
    expect(tuned.outcome.damage).toBe(62);
  });
});

describe("resolveLine — HP", () => {
  it("applies damage to the opponent and self-damage to the player", () => {
    const wrong = LINE.text.slice(0, 3) + "XX" + LINE.text.slice(5);
    const { state } = typeAndResolve(round(), wrong);
    expect(state.players[1].hp).toBe(100 - 4);
    expect(state.players[0].hp).toBe(100 - 4);
  });

  it("resolves for slot 1 against slot 0", () => {
    const { state } = typeAndResolve(round(), LINE.text, 200, 1);
    expect(state.players[0].hp).toBe(94);
    expect(state.players[1].hp).toBe(100);
  });

  it("floors HP at zero rather than going negative", () => {
    const state = round({ players: [player(), player({ slot: 1, hp: 2 })] });
    const { state: after } = clean(state);
    expect(after.players[1].hp).toBe(0);
  });

  it("records the line as seen, so it can never be served again (SPEC §3.6)", () => {
    const { state } = clean(round());
    expect(state.players[0].seenLineIds).toEqual([LINE.id]);
  });

  it("leaves progress standing — the finished line stays on screen", () => {
    const { state } = clean(round());
    expect(state.players[0].progress?.charIndex).toBe(LINE.text.length);
  });

  it("does not mutate the round it was given", () => {
    const before = round();
    const snapshot = JSON.stringify(before);
    clean(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("resolveLine — momentum (SPEC §2.6)", () => {
  it("charges one per clean line", () => {
    const { state } = clean(round({ players: [player({ momentum: 2 }), player({ slot: 1 })] }));
    expect(state.players[0].momentum).toBe(3);
  });

  it("resets to zero on any uncorrected error", () => {
    const wrong = LINE.text.slice(0, 3) + "X" + LINE.text.slice(4);
    const { state } = typeAndResolve(round({ players: [player({ momentum: 3 }), player({ slot: 1 })] }), wrong);
    expect(state.players[0].momentum).toBe(0);
  });

  it("caps at the charges a Special costs", () => {
    const full = DEFAULT_TUNING.momentumChargesForSpecial;
    const { state } = clean(round({ players: [player({ momentum: full }), player({ slot: 1 })] }));
    expect(state.players[0].momentum).toBe(full);
  });

  it("unlocks the Special at four charges and not before", () => {
    expect(specialReady(player({ momentum: 3 }))).toBe(false);
    expect(specialReady(player({ momentum: 4 }))).toBe(true);
  });
});

describe("resolveLine — the Special (SPEC §2.6)", () => {
  it("multiplies the next completed line and consumes the meter", () => {
    const armed = round({ players: [player({ momentum: 4, specialArmed: true }), player({ slot: 1 })] });
    const { state, outcome } = clean(armed);

    expect(outcome.specialConsumed).toBe(true);
    expect(outcome.damage).toBe(11); // 6 × 1.03 × 1.8
    expect(state.players[0].specialArmed).toBe(false);
    // Meter emptied, then this clean line charged it once.
    expect(state.players[0].momentum).toBe(1);
  });

  it("empties the meter even when the line it fires on is dirty", () => {
    const wrong = LINE.text.slice(0, 3) + "X" + LINE.text.slice(4);
    const armed = round({ players: [player({ momentum: 4, specialArmed: true }), player({ slot: 1 })] });
    const { state } = typeAndResolve(armed, wrong);
    expect(state.players[0].momentum).toBe(0);
    expect(state.players[0].specialArmed).toBe(false);
  });
});

describe("triggerSpecial", () => {
  it("arms the Special when the meter is full", () => {
    const state = triggerSpecial(round({ players: [player({ momentum: 4 }), player({ slot: 1 })] }));
    expect(state.players[0].specialArmed).toBe(true);
  });

  it("is a no-op below a full meter, so it can be bound to a key unguarded", () => {
    const before = round({ players: [player({ momentum: 3 }), player({ slot: 1 })] });
    expect(triggerSpecial(before)).toBe(before);
  });

  it("is a no-op when it is already armed", () => {
    const before = round({ players: [player({ momentum: 4, specialArmed: true }), player({ slot: 1 })] });
    expect(triggerSpecial(before)).toBe(before);
  });
});

describe("resolveLine — refuses to resolve what is not finished", () => {
  it("throws on a half-typed line", () => {
    const half = Array.from(LINE.text.slice(0, 5)).reduce(
      (acc, key, i) => applyKeystroke(acc, { t: 100 + i, key }),
      round(),
    );
    expect(() => resolveLine(half, { now: 200 })).toThrow(/only 5\/30 typed/);
  });

  it("throws when no line is locked in", () => {
    const idle = round({ players: [player({ progress: null }), player({ slot: 1 })] });
    expect(() => resolveLine(idle, { now: 0 })).toThrow(/no line locked in/);
  });
});
