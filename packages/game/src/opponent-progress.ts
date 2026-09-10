/**
 * The opponent's side of a round, folded in from progress snapshots. SPEC §4.3.
 *
 * Invariant 4 forbids streaming keystrokes: the opponent arrives as
 * `{lineId, charIndex, errors}` at ~10Hz and nothing else. That is lossy on
 * purpose — it is a third of the bytes and it removes an entire class of
 * desync bug — so this file's job is to turn a lossy snapshot back into the
 * `LineProgress` the engine already knows how to resolve, without inventing
 * anything the wire did not carry.
 *
 * Two things are synthesized, and both are safe for a reason worth stating:
 *
 *   `typedChars` is empty. `types.ts` documents `typedChars.length ===
 *   charIndex`, which a snapshot cannot satisfy — the keys never left the
 *   opponent's machine. It holds because `typedChars` exists for exactly one
 *   consumer, `displayLine`, and the opponent's characters are never rendered
 *   (SPEC §6.2 is about the local surface). Nothing in the damage path reads
 *   it: `resolveLine` takes `charIndex`, `wrongIndices.length` and `startedAt`.
 *
 *   `wrongIndices` is a count wearing an array's clothes — the last `errors`
 *   indices before the frontier. Which characters they were is not on the wire
 *   and nothing downstream asks: `uncorrectedErrors` is a length, and that
 *   length is the whole of what damage charges (SPEC §2.5).
 *
 * Pure, non-mutating and time-as-a-parameter like everything else here.
 */

import { activeLine, createLineProgress } from "./progress";
import type { LineProgress, PlayerSlot, PlayerState, RoundState } from "./types";

/** What crosses the wire, and all of it. SPEC §4.3. */
export interface ProgressSnapshot {
  lineId: string;
  /** how many characters of the line have been typed */
  charIndex: number;
  /** errors still standing, not errors ever made */
  errors: number;
}

/**
 * Fold one opponent snapshot into the round.
 *
 * Returns the argument unchanged — so the caller can skip a render — when the
 * snapshot cannot be believed:
 *
 *   - it names a line that is not among that player's three current options,
 *     which is what a snapshot from a deal that has already been replaced
 *     looks like;
 *   - it names a different line than the one they have locked in, since a
 *     player commits with their first character and cannot switch (SPEC §2.3);
 *   - `charIndex` runs past the end of the line, or `errors` past `charIndex`.
 *
 * A snapshot that moves `charIndex` *backwards* is not rejected: that is a
 * backspace, and invariant 6 says a repair is real and costs only time. Out of
 * order delivery would be indistinguishable from one, so ordering stays the
 * transport's job — in-process today, an ordered socket at #14 — rather than
 * something guessed at here from the numbers alone.
 */
export function applyProgressSnapshot(
  state: RoundState,
  slot: PlayerSlot,
  snapshot: ProgressSnapshot,
  at: number,
): RoundState {
  const player = state.players[slot];
  const line = player.options.find((option) => option.id === snapshot.lineId);
  if (!line) return state;

  // Locked in on something else: one line per deal, chosen by the first key.
  const current = player.progress;
  if (current && current.lineId !== snapshot.lineId) return state;
  if (current && activeLine(player) === null) return state;

  if (!Number.isInteger(snapshot.charIndex) || !Number.isInteger(snapshot.errors)) return state;
  if (snapshot.charIndex < 0 || snapshot.charIndex > line.text.length) return state;
  if (snapshot.errors < 0 || snapshot.errors > snapshot.charIndex) return state;

  const progress = fold(current ?? createLineProgress(line.id), snapshot, at);
  if (current && same(current, progress)) return state;

  const players = [...state.players] as [PlayerState, PlayerState];
  players[slot] = { ...player, progress };
  return { ...state, players };
}

/**
 * The clock starts at the first character and never restarts — `startedAt` is
 * what WPM is measured from, so a later snapshot must not move it. A snapshot
 * still at zero characters has not started anything.
 */
function fold(base: LineProgress, snapshot: ProgressSnapshot, at: number): LineProgress {
  return {
    lineId: snapshot.lineId,
    charIndex: snapshot.charIndex,
    wrongIndices: Array.from(
      { length: snapshot.errors },
      (_index, i) => snapshot.charIndex - snapshot.errors + i,
    ),
    typedChars: [],
    startedAt: base.startedAt ?? (snapshot.charIndex > 0 ? at : null),
  };
}

function same(a: LineProgress, b: LineProgress): boolean {
  return (
    a.lineId === b.lineId &&
    a.charIndex === b.charIndex &&
    a.wrongIndices.length === b.wrongIndices.length &&
    a.startedAt === b.startedAt
  );
}
