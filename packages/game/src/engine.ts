import { computeDamage, wpm } from "./damage";
import { activeLine, isLineComplete, specialReady, uncorrectedErrors } from "./progress";
import { DEFAULT_TUNING } from "./tuning";
import type { Tuning } from "./tuning";
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

/**
 * What a completed line did: the round after resolution, and the outcome that
 * drives the impact beat locally and goes on the wire as `line.resolved`.
 */
export interface LineResolution {
  state: RoundState;
  outcome: LineOutcome;
}

export interface ResolveInput {
  /** ms since round start at the keystroke that completed the line */
  now: number;
  /** whose line this is; omitted means slot 0, matching applyKeystroke */
  slot?: PlayerSlot;
}

/**
 * Turn a finished line into damage, momentum and HP. SPEC §2.5, §2.6.
 *
 * Only errors still standing are charged — a repaired character already cost
 * the player the time it took to repair it, and invariant 6 says never both.
 *
 * Momentum is the counterweight to raw speed: speed alone caps at
 * `speedMultMax`, but four clean lines in a row unlock a Special worth
 * `specialDamageMult` on top. Any uncorrected error empties the meter.
 *
 * `progress` is deliberately left standing. The line the player just finished
 * is still the line on screen, and clearing it here would blank the surface at
 * the exact moment the impact beat plays. The caller advances to the next line
 * by locking one in, and must call this once per completed line — resolving the
 * same progress twice charges the damage twice.
 */
export function resolveLine(
  state: RoundState,
  input: ResolveInput,
  tuning: Tuning = DEFAULT_TUNING,
): LineResolution {
  const slot = input.slot ?? 0;
  const player = state.players[slot];
  const progress = player.progress;
  if (!progress) throw new Error(`resolveLine: player ${slot} has no line locked in`);

  const line = activeLine(player);
  if (!line) throw new Error(`resolveLine: ${progress.lineId} is not among player ${slot}'s options`);
  if (!isLineComplete(line.text, progress)) {
    throw new Error(`resolveLine: ${line.id} is only ${progress.charIndex}/${line.text.length} typed`);
  }

  const errors = uncorrectedErrors(progress);
  const specialConsumed = player.specialArmed;
  const lineWpm = wpm(line.text.length, input.now - (progress.startedAt ?? input.now));

  const raw = computeDamage(
    { tier: line.tier, uncorrectedErrors: errors, lineWpm, special: specialConsumed },
    tuning,
  );
  // Rounded once, here, so the number the burst shows is exactly the number HP
  // loses. computeDamage itself stays exact — SPEC §2.5's worked examples are
  // tested against it directly.
  const damage = Math.round(raw.damage);
  const selfDamage = Math.round(raw.selfDamage);

  // A spent Special empties the meter before this line charges it, so firing on
  // a clean line leaves you at one charge rather than back at zero.
  const carried = specialConsumed ? 0 : player.momentum;
  const momentum = errors === 0 ? Math.min(carried + 1, tuning.momentumChargesForSpecial) : 0;

  const opponent = (1 - slot) as PlayerSlot;
  const players = [...state.players] as [PlayerState, PlayerState];
  players[slot] = {
    ...player,
    hp: Math.max(0, player.hp - selfDamage),
    momentum,
    specialArmed: false,
    seenLineIds: player.seenLineIds.includes(line.id)
      ? player.seenLineIds
      : [...player.seenLineIds, line.id],
  };
  players[opponent] = {
    ...players[opponent],
    hp: Math.max(0, players[opponent].hp - damage),
  };

  return {
    state: { ...state, players },
    outcome: {
      lineId: line.id,
      tier: line.tier,
      damage,
      selfDamage,
      uncorrectedErrors: errors,
      lineWpm,
      specialConsumed,
    },
  };
}

/**
 * Spend a full momentum meter to arm the Special. SPEC §2.6 — the meter unlocks
 * it, the player triggers it, and the next completed line is the one multiplied.
 *
 * A no-op (returning the argument unchanged) when the meter is not full or the
 * Special is already armed, so the caller can bind it to a key without guarding.
 */
export function triggerSpecial(
  state: RoundState,
  slot: PlayerSlot = 0,
  tuning: Tuning = DEFAULT_TUNING,
): RoundState {
  const player = state.players[slot];
  if (player.specialArmed || !specialReady(player, tuning)) return state;

  const players = [...state.players] as [PlayerState, PlayerState];
  players[slot] = { ...player, specialArmed: true };
  return { ...state, players };
}

export function tickRound(_state: RoundState, _now: number): RoundState {
  throw new Error("not implemented — Milestone 2");
}

export function resolveMatch(_rounds: RoundResult[]): MatchOutcome {
  throw new Error("not implemented — Milestone 2");
}
