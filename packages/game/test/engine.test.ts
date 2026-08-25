import { describe, expect, it } from "vitest";
import { BACKSPACE, applyKeystroke } from "../src/engine";
import {
  createLineProgress,
  displayLine,
  lineCharStates,
  uncorrectedErrors,
} from "../src/progress";
import type { KeyEvent, Line, PlayerState, RoundState } from "../src/types";

const LINE: Line = {
  id: "groupchat-debate-jab-001",
  tier: "jab",
  text: "you left me on read",
  wordCount: 5,
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
    players: [player(), player({ slot: 1 })],
    rngCursor: 0,
    ...overrides,
  };
}

/** Type a string one key at a time, one millisecond apart, starting at t. */
function type(state: RoundState, keys: string, t = 0, slot: 0 | 1 = 0): RoundState {
  return Array.from(keys).reduce(
    (acc, key, i) => applyKeystroke(acc, { t: t + i, key, slot } satisfies KeyEvent),
    state,
  );
}

const progressOf = (state: RoundState, slot: 0 | 1 = 0) => state.players[slot].progress!;

describe("applyKeystroke — correct characters", () => {
  it("advances one character at a time", () => {
    const after = type(round(), "you");
    expect(progressOf(after).charIndex).toBe(3);
    expect(progressOf(after).wrongIndices).toEqual([]);
  });

  it("starts the clock on the first keystroke and never resets it", () => {
    const after = type(round(), "you", 800);
    expect(progressOf(after).startedAt).toBe(800);
  });

  it("stops at the end of the line", () => {
    const after = type(round(), LINE.text + "!!!");
    expect(progressOf(after).charIndex).toBe(LINE.text.length);
    expect(progressOf(after).wrongIndices).toEqual([]);
  });
});

describe("applyKeystroke — errors never block (SPEC §2.4)", () => {
  it("marks a wrong character and advances past it", () => {
    const after = type(round(), "yiu");
    expect(progressOf(after).charIndex).toBe(3);
    expect(progressOf(after).wrongIndices).toEqual([1]);
  });

  it("lets the player finish the line with errors standing", () => {
    const after = type(round(), "yiu left me on reax");
    expect(progressOf(after).charIndex).toBe(LINE.text.length);
    expect(uncorrectedErrors(progressOf(after))).toBe(2);
  });

  it("keeps the character the player actually typed visible", () => {
    // The engine records where the error is; the surface renders the typed
    // character there and never replaces it (SPEC §6.2).
    const after = type(round(), "yiu");
    expect(lineCharStates(LINE.text, progressOf(after))).toEqual([
      "correct",
      "wrong",
      "correct",
      "current",
      ...Array(LINE.text.length - 4).fill("pending"),
    ]);
  });
});

describe("applyKeystroke — backspace costs time only", () => {
  it("repairs an error rather than charging for it twice", () => {
    const after = type(round(), "yiu" + BACKSPACE + BACKSPACE + "ou");
    expect(progressOf(after).charIndex).toBe(3);
    expect(progressOf(after).wrongIndices).toEqual([]);
  });

  it("does not rewind the clock, so the repair shows up as lost time", () => {
    const after = type(round(), "yiu" + BACKSPACE, 500);
    expect(progressOf(after).startedAt).toBe(500);
  });

  it("walks back over correct characters too, making them pending again", () => {
    const after = type(round(), "you" + BACKSPACE);
    expect(progressOf(after).charIndex).toBe(2);
    expect(lineCharStates(LINE.text, progressOf(after))[2]).toBe("current");
  });

  it("re-marks a character repaired and then mistyped again", () => {
    const after = type(round(), "yi" + BACKSPACE + "a");
    expect(progressOf(after).wrongIndices).toEqual([1]);
  });

  it("is a no-op at the start of a line and never starts the clock", () => {
    const state = round();
    const after = applyKeystroke(state, { t: 40, key: BACKSPACE });
    expect(after).toBe(state);
    expect(progressOf(after).startedAt).toBeNull();
  });
});

describe("applyKeystroke — purity (SPEC §11)", () => {
  it("does not mutate the state it was given", () => {
    const state = round();
    const before = structuredClone(state);
    type(state, "yiu" + BACKSPACE);
    expect(state).toEqual(before);
  });

  it("touches only the slot that typed", () => {
    const state = round();
    const after = type(state, "you", 0, 1);
    expect(after.players[0]).toBe(state.players[0]);
    expect(progressOf(after, 1).charIndex).toBe(3);
    expect(progressOf(after, 0).charIndex).toBe(0);
  });

  it("returns the same object for keystrokes it ignores, so no render is triggered", () => {
    const state = round();
    expect(applyKeystroke(state, { t: 1, key: "Shift" })).toBe(state);
    expect(applyKeystroke(state, { t: 1, key: "ArrowLeft" })).toBe(state);
  });

  it("ignores keystrokes before a line is locked in", () => {
    const state = round({ players: [player({ progress: null }), player({ slot: 1 })] });
    expect(applyKeystroke(state, { t: 1, key: "y" })).toBe(state);
  });
});

describe("displayLine — what the surface draws (SPEC §6.2)", () => {
  it("shows the key the player pressed at a wrong character, not the expected one", () => {
    const after = type(round(), "yiu");
    const drawn = displayLine(LINE.text, progressOf(after));
    expect(drawn.slice(0, 3).map((c) => c.char).join("")).toBe("yiu");
    expect(drawn[1]!.state).toBe("wrong");
  });

  it("lays out the whole line from the first frame, so nothing can reflow", () => {
    const drawn = displayLine(LINE.text, createLineProgress(LINE.id));
    expect(drawn).toHaveLength(LINE.text.length);
    expect(drawn.map((c) => c.char).join("")).toBe(LINE.text);
  });

  it("drops the typed character again once it is backspaced away", () => {
    const after = type(round(), "yiu" + BACKSPACE + BACKSPACE);
    const drawn = displayLine(LINE.text, progressOf(after));
    expect(drawn.map((c) => c.char).join("")).toBe(LINE.text);
  });
});
