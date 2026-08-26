/**
 * Derivations over LineProgress. SPEC §2.4, §6.2.
 *
 * These are the read side of `applyKeystroke` — everything the typing surface
 * needs to render a line, computed from state rather than tracked alongside it.
 * Pure and non-mutating like the rest of this package.
 */

import { DEFAULT_TUNING } from "./tuning";
import type { Tuning } from "./tuning";
import type { CharState, Line, LineProgress, PlayerState } from "./types";

/** One character of the typing surface: what to draw, and how. SPEC §6.2. */
export interface DisplayChar {
  /** the character to render — what the player typed, once they have typed it */
  char: string;
  state: CharState;
}

/** A locked-in line with no keystrokes yet. The clock starts on the first one. */
export function createLineProgress(lineId: string): LineProgress {
  return { lineId, charIndex: 0, wrongIndices: [], typedChars: [], startedAt: null };
}

/** The line a player has locked in, or null if they have not locked one in. */
export function activeLine(player: PlayerState): Line | null {
  if (!player.progress) return null;
  return player.options.find((option) => option.id === player.progress!.lineId) ?? null;
}

/** Errors still standing at this instant. Repaired characters are not counted. */
export function uncorrectedErrors(progress: LineProgress): number {
  return progress.wrongIndices.length;
}

/**
 * Whether the momentum meter is full and a Special can be triggered. SPEC §2.6.
 *
 * Derived rather than stored: `momentum` is the one number that moves, and
 * `specialArmed` records only that the player has actually spent the meter's
 * readiness on a trigger.
 */
export function specialReady(player: PlayerState, tuning: Tuning = DEFAULT_TUNING): boolean {
  return player.momentum >= tuning.momentumChargesForSpecial;
}

export function isLineComplete(text: string, progress: LineProgress): boolean {
  return progress.charIndex >= text.length;
}

/**
 * One state per character, for the typing surface (SPEC §6.2).
 *
 * `current` is the caret position, not a character the player has typed — the
 * character underneath it is still pending. It is returned as its own state so
 * the surface can position the caret without a second pass over the line.
 */
/**
 * The line as it should be drawn right now.
 *
 * A wrong character renders as the key the player pressed, not the one the
 * line wanted — they have to be able to see their own mistake. Everything
 * ahead of the caret renders as the line, so the full width is laid out
 * before the first keystroke and nothing ever reflows.
 */
export function displayLine(text: string, progress: LineProgress): DisplayChar[] {
  const states = lineCharStates(text, progress);
  return states.map((state, i) => ({
    char: (state === "correct" || state === "wrong" ? progress.typedChars[i] : undefined) ?? text[i] ?? "",
    state,
  }));
}

export function lineCharStates(text: string, progress: LineProgress): CharState[] {
  const wrong = new Set(progress.wrongIndices);
  return Array.from(text, (_char, i) => {
    if (i === progress.charIndex) return "current";
    if (i > progress.charIndex) return "pending";
    return wrong.has(i) ? "wrong" : "correct";
  });
}
