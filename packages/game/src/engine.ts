import { activeLine } from "./progress";
import type {
  KeyEvent,
  LineOutcome,
  LineProgress,
  MatchOutcome,
  PlayerSlot,
  PlayerState,
  RoundResult,
  RoundState,
} from "./types";

/**
 * The four entry points from SPEC §4.2. Imported by BOTH client and server so
 * they can never disagree about what a haymaker is worth.
 *
 * Invariants for every implementation in this file:
 *   - pure: no I/O, no DOM, no network
 *   - deterministic: `now` and randomness are parameters, never Date.now()/Math.random()
 *   - non-mutating: return new state, never edit the argument
 */

/** The key a KeyEvent carries for backspace. Callers map their platform's name to this. */
export const BACKSPACE = "\b";

/**
 * Fold one keystroke into the round. SPEC §2.4 — the single most important
 * interaction in the game.
 *
 * A wrong character marks and advances; it never blocks. Backspace walks back
 * one character and repairs whatever was there, costing only the time it took.
 * An error is therefore charged once, at resolution, and only if it is still
 * standing — never both the error and the correction.
 *
 * Ignored (returning the argument unchanged, so the caller can skip a render):
 * keystrokes before a line is locked in, non-character keys such as modifiers
 * and arrows, characters typed past the end of the line, and backspace at the
 * start of one.
 */
export function applyKeystroke(state: RoundState, ev: KeyEvent): RoundState {
  const slot = ev.slot ?? 0;
  const player = state.players[slot];
  const progress = player.progress;
  if (!progress) return state;

  const line = activeLine(player);
  if (!line) return state;

  const next =
    ev.key === BACKSPACE
      ? applyBackspace(progress)
      : applyCharacter(line.text, progress, ev);

  return next === progress ? state : withProgress(state, slot, next);
}

function applyCharacter(text: string, progress: LineProgress, ev: KeyEvent): LineProgress {
  if (ev.key.length !== 1) return progress;
  if (progress.charIndex >= text.length) return progress;

  const correct = ev.key === text[progress.charIndex];
  return {
    lineId: progress.lineId,
    charIndex: progress.charIndex + 1,
    // Only ever the frontier index, and backspace removes it before it can
    // return — so this stays sorted and duplicate-free without sorting.
    wrongIndices: correct
      ? progress.wrongIndices
      : [...progress.wrongIndices, progress.charIndex],
    typedChars: [...progress.typedChars, ev.key],
    startedAt: progress.startedAt ?? ev.t,
  };
}

function applyBackspace(progress: LineProgress): LineProgress {
  if (progress.charIndex === 0) return progress;

  const repaired = progress.charIndex - 1;
  return {
    lineId: progress.lineId,
    charIndex: repaired,
    wrongIndices: progress.wrongIndices.filter((i) => i !== repaired),
    typedChars: progress.typedChars.slice(0, repaired),
    // A backspace never starts the clock; charIndex > 0 means it already ran.
    startedAt: progress.startedAt,
  };
}

function withProgress(state: RoundState, slot: PlayerSlot, progress: LineProgress): RoundState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[slot] = { ...players[slot], progress };
  return { ...state, players };
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
