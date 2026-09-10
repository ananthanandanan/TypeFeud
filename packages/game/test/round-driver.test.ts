import { describe, expect, it } from "vitest";
import { driveRound, type DrivenRound, type RoundInput } from "../src/round-driver";
import { DEFAULT_TUNING } from "../src/tuning";
import { roundResult } from "../src/engine";
import type { Line, PlayerState } from "../src/types";

const line: Line = { id: "jab", text: "Alpha", tier: "jab", wordCount: 1 };
const tuning = { ...DEFAULT_TUNING, speedMultMin: 1, speedMultMax: 1 };
function initial(): DrivenRound {
  const player = (slot: 0 | 1): PlayerState => ({
    slot, hp: 100, options: [line, line, line], progress: null,
    momentum: 0, specialArmed: false, seenLineIds: [],
  });
  return { round: { round: "debate", endsAt: 45000, status: "live", players: [player(0), player(1)] }, resolved: [false, false] };
}
function key(state: DrivenRound, key: string, at: number, slot: 0 | 1 = 0) {
  return driveRound(state, { type: "key", key, slot }, at, tuning);
}

describe("shared live/replay round driver", () => {
  it("resolves once, holds the text, and resets the guard only when dealing", () => {
    const before = initial();
    let state: DrivenRound = before;
    for (const [i, char] of [...line.text].entries()) state = key(state, char, 100 + i * 100);
    expect(state.round.players[1].hp).toBe(94);
    expect(state.round.players[0].momentum).toBe(1);
    expect(state.round.players[0].progress?.typedChars.join("")).toBe(line.text);
    const duplicate = key(state, "x", 600);
    expect(duplicate.outcome).toBeNull();
    expect(duplicate.round.players[1].hp).toBe(94);
    const next = driveRound(duplicate, { type: "deal", slot: 0, options: [line, line, line] }, 900, tuning);
    expect(next.resolved).toEqual([false, false]);
    expect(next.round.players[0].progress).toBeNull();
    expect(before.round.players[0].progress).toBeNull();
    expect(before.round.players[1].hp).toBe(100);
  });

  it("charges a repaired error only through time, for either slot", () => {
    for (const slot of [0, 1] as const) {
      let state = initial();
      for (const [i, char] of [..."Ax\blpha"].entries()) state = key(state, char, 100 + i * 100, slot);
      expect(state.round.players[slot].hp).toBe(100);
      expect(state.round.players[1 - slot]!.hp).toBe(94);
      expect(state.round.players[slot].progress?.wrongIndices).toEqual([]);
    }
  });

  it("ends the trigger on completion even though resolution leaves progress visible", () => {
    let state = initial();
    state.round.round = "trigger";
    for (const [i, char] of [...line.text].entries()) state = key(state, char, 100 + i * 100, 1);
    expect(state.round.status).toBe("over");
    expect(roundResult(state.round)?.winner).toBe(1);
    expect(state.resolved).toEqual([false, true]);
  });

  it("gives the deadline priority over the completing key and later inputs", () => {
    let state = initial();
    state.round.round = "trigger";
    state.round.endsAt = 500;
    for (const [i, char] of [..."Alph"].entries()) state = key(state, char, 100 + i * 100);
    state = key(state, "a", 500);
    expect(state.round.players[0].progress?.charIndex).toBe(4);
    expect(roundResult(state.round)?.winner).toBeNull();
    for (const input of [{ type: "key", slot: 0, key: "a" }, { type: "special", slot: 0 },
      { type: "deal", slot: 0, options: [line, line, line] }] satisfies RoundInput[]) {
      expect(driveRound(state, input, 600, tuning).round).toBe(state.round);
    }
  });

  it("retains incomplete text when a clock evaluation closes the round", () => {
    const state = key(initial(), "A", 100);
    const ended = driveRound(state, { type: "clock" }, 45001, tuning);
    expect(ended.round.status).toBe("over");
    expect(ended.round.players[0].progress).toEqual(state.round.players[0].progress);
    expect(ended.round.players.map((player) => player.hp)).toEqual([100, 100]);
  });
});
