import { describe, expect, it } from "vitest";
import { applyProgressSnapshot } from "../src/opponent-progress";
import { driveRound, type DrivenRound } from "../src/round-driver";

import { DEFAULT_TUNING } from "../src/tuning";
import type { Line, PlayerState, RoundState } from "../src/types";

const jab: Line = { id: "jab", text: "Alpha", tier: "jab", wordCount: 1 };
const combo: Line = { id: "combo", text: "Bravo two", tier: "combo", wordCount: 2 };
const haymaker: Line = { id: "haymaker", text: "Charlie three four", tier: "haymaker", wordCount: 3 };
// Speed out of the way, so a snapshot's damage is its tier and its errors.
const tuning = { ...DEFAULT_TUNING, speedMultMin: 1, speedMultMax: 1 };

function player(slot: 0 | 1): PlayerState {
  return {
    slot, hp: 100, options: [jab, combo, haymaker], progress: null,
    momentum: 0, specialArmed: false, seenLineIds: [],
  };
}
function round(): RoundState {
  return { round: "debate", endsAt: 45_000, status: "live", players: [player(0), player(1)] };
}
function snap(state: RoundState, charIndex: number, errors = 0, at = 100, lineId = jab.id) {
  return applyProgressSnapshot(state, 1, { lineId, charIndex, errors }, at);
}

describe("opponent progress snapshots", () => {
  it("selects an offered line and starts the clock on the first character", () => {
    const state = snap(round(), 2, 0, 250);
    const progress = state.players[1].progress!;
    expect(progress.lineId).toBe(jab.id);
    expect(progress.charIndex).toBe(2);
    expect(progress.startedAt).toBe(250);
    // The wire carried no keys, so there are none. SPEC §6.2 is local-only.
    expect(progress.typedChars).toEqual([]);
    // Untouched: a snapshot is one player's business.
    expect(state.players[0].progress).toBeNull();
  });

  it("never restarts the clock, so WPM measures the whole line", () => {
    let state = snap(round(), 1, 0, 200);
    state = snap(state, 4, 0, 900);
    expect(state.players[1].progress?.startedAt).toBe(200);
  });

  it("carries errors as a count, not as characters", () => {
    const state = snap(round(), 4, 2);
    expect(state.players[1].progress?.wrongIndices).toHaveLength(2);
    expect(state.players[1].progress?.wrongIndices.every((i) => i < 4)).toBe(true);
  });

  it("rejects a line that is not on offer, and one it is not locked into", () => {
    const before = round();
    expect(snap(before, 2, 0, 100, "not-dealt")).toBe(before);

    const locked = snap(before, 2);
    expect(snap(locked, 1, 0, 200, combo.id)).toBe(locked);
    expect(locked.players[1].progress?.lineId).toBe(jab.id);
  });

  it("rejects impossible counts rather than clamping them", () => {
    const before = round();
    expect(snap(before, jab.text.length + 1)).toBe(before);
    expect(snap(before, -1)).toBe(before);
    expect(snap(before, 3, 4)).toBe(before);
    expect(snap(before, 2.5)).toBe(before);
  });

  it("accepts a backspace, because a repair is real and costs only time", () => {
    let state = snap(round(), 4, 1);
    state = snap(state, 3, 0, 300);
    expect(state.players[1].progress?.charIndex).toBe(3);
    expect(state.players[1].progress?.wrongIndices).toHaveLength(0);
  });

  it("returns the same state for a snapshot that says nothing new", () => {
    const state = snap(round(), 2);
    expect(snap(state, 2, 0, 400)).toBe(state);
  });
});

describe("snapshots through the shared driver", () => {
  type Driven = ReturnType<typeof driveRound>;
  const drive = (state: DrivenRound, charIndex: number, at: number, errors = 0, lineId = jab.id) =>
    driveRound(state, { type: "progress", slot: 1, lineId, charIndex, errors }, at, tuning);

  it("charges a completed line once, on the same path as a keystroke", () => {
    let state: Driven = { round: round(), resolved: [false, false], outcome: null };
    state = drive(state, 3, 300);
    expect(state.outcome).toBeNull();
    expect(state.round.players[0].hp).toBe(100);

    state = drive(state, jab.text.length, 500);
    expect(state.outcome?.lineId).toBe(jab.id);
    expect(state.round.players[0].hp).toBeLessThan(100);
    expect(state.round.players[1].momentum).toBe(1);

    // A duplicate final snapshot must not charge the damage twice.
    const landed = state.round.players[0].hp;
    state = drive(state, jab.text.length, 600);
    expect(state.outcome).toBeNull();
    expect(state.round.players[0].hp).toBe(landed);
  });

  it("cannot land damage at or after the deadline", () => {
    let state: Driven = { round: round(), resolved: [false, false], outcome: null };
    state = drive(state, 3, 44_900);
    state = drive(state, jab.text.length, 45_000);
    expect(state.round.status).toBe("over");
    expect(state.outcome).toBeNull();
    expect(state.round.players[0].hp).toBe(100);
  });

  it("charges standing errors and empties the meter, exactly like a keystroke would", () => {
    let state: Driven = { round: round(), resolved: [false, false], outcome: null };
    state = drive(state, jab.text.length, 400, 2);
    expect(state.outcome?.uncorrectedErrors).toBe(2);
    expect(state.outcome?.selfDamage).toBe(2 * tuning.selfDamagePerError);
    expect(state.round.players[1].momentum).toBe(0);
  });

  it("takes a fresh line only after a deal, and the deal clears the guard", () => {
    let state: Driven = { round: round(), resolved: [false, false], outcome: null };
    state = drive(state, jab.text.length, 400);
    const afterFirst = state.round.players[0].hp;

    // Still resolved: nothing the ghost sends can land until it is dealt again.
    state = drive(state, 2, 500, 0, combo.id);
    expect(state.round.players[1].progress?.lineId).toBe(jab.id);

    state = driveRound(state, { type: "deal", slot: 1, options: [jab, combo, haymaker] }, 600, tuning);
    state = drive(state, combo.text.length, 1_200, 0, combo.id);
    expect(state.outcome?.lineId).toBe(combo.id);
    expect(state.round.players[0].hp).toBeLessThan(afterFirst);
  });
});
