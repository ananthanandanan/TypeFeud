import type { KeyEvent, LineOutcome, MatchOutcome, RoundResult, RoundState } from "./types.js";

/**
 * The four entry points from SPEC §4.2. Imported by BOTH client and server so
 * they can never disagree about what a haymaker is worth.
 *
 * Not implemented yet — Milestone 1 (Feel) fills these in. The signatures are
 * fixed here first because apps/web and apps/server both code against them.
 *
 * Invariants for every implementation in this file:
 *   - pure: no I/O, no DOM, no network
 *   - deterministic: `now` and randomness are parameters, never Date.now()/Math.random()
 *   - non-mutating: return new state, never edit the argument
 */

export function applyKeystroke(_state: RoundState, _ev: KeyEvent): RoundState {
  throw new Error("not implemented — Milestone 1");
}

export function resolveLine(_state: RoundState, _lineId: string): LineOutcome {
  throw new Error("not implemented — Milestone 1");
}

export function tickRound(_state: RoundState, _now: number): RoundState {
  throw new Error("not implemented — Milestone 2");
}

export function resolveMatch(_rounds: RoundResult[]): MatchOutcome {
  throw new Error("not implemented — Milestone 2");
}
