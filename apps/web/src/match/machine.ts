/**
 * The match as a state machine. SPEC §2.1, §2.7, and the Match flow artboard.
 *
 *   arena → trigger → debate → intermission → roast → intermission → fight → results
 *
 * Pure and React-free on purpose. At Milestone 3 the server owns this sequence
 * (#13, room lifecycle) and the client becomes a renderer of it, so keeping the
 * transitions out of a component means that issue moves this file rather than
 * rewriting it. The pure session layer supplies driven rounds and dealt options.
 * Browser I/O stays in `use-match.ts`; relative timestamps arrive as action
 * parameters, the same way `packages/game` takes `now` rather than reading it.
 *
 * It holds the round-scoped view state (`lineOutcome`, `lastKeyAt`,
 * `generation`) as well as the sequence, so opening a round clears all of it in
 * one transition rather than in a chain of effects racing each other.
 *
 * All three are per slot. They started out as the local player's alone, but
 * the opponent needs every one of them for the same reasons: an impact beat to
 * wait through before their next three are dealt, a time to measure it from,
 * and a generation to make a stale timer harmless. Indexing by slot rather
 * than adding a second set of opponent-shaped fields is what keeps the ghost's
 * scheduling a parameterized copy of the local one instead of a fork of it —
 * and it is the shape #14 needs, where both sides arrive from the server.
 */

import {
  INTERMISSION_DURATION_MS,
  ROUND_DURATION_MS,
  resolveMatch,
  roundResult,
  startingHp,
  type Line,
  type LineOutcome,
  type MatchOutcome,
  type PlayerSlot,
  type PlayerState,
  type RoundName,
  type RoundResult,
  type RoundState,
  type Tuning,
} from "@typefeud/game";

/**
 * Where the match is. `round` means a round is being played; `intermission` is
 * the beat between two of them, holding the result that just landed.
 */
export type Phase = "arena" | "round" | "intermission" | "results";

export interface MatchState {
  phase: Phase;
  /** the round being played, or the one just finished while in `intermission` */
  round: RoundState;
  /** the round waiting behind an intermission — already dealt, not yet started */
  pending: RoundState | null;
  /** every round that has finished, in order */
  results: RoundResult[];
  /** set once the fight is over */
  outcome: MatchOutcome | null;

  /**
   * Session-relative time when the round began. `RoundState.endsAt` is relative
   * to this start. The browser hook translates this value to performance.now()
   * coordinates for the HUD only. Null until the first round starts.
   */
  roundStartedAt: number | null;
  /** per slot: what the last completed line did; cleared when the next three are dealt */
  lineOutcome: [LineOutcome | null, LineOutcome | null];
  /** per slot: ms since round start at that player's most recent input */
  lastKeyAt: [number, number];
  /**
   * Per slot, bumped by every deal. Slot 0's is the typing surface's remount
   * key, which is what resets the per-line clock without an effect clearing
   * the old one; both are the guard that makes a late impact-beat timer from a
   * previous line land on nothing.
   */
  generation: [number, number];
}

/** One slot of a per-slot pair, replaced without touching the other. */
function replace<T>(pair: [T, T], slot: PlayerSlot, value: T): [T, T] {
  const next: [T, T] = [...pair];
  next[slot] = value;
  return next;
}

/** One deal per player, in slot order. */
export type DealtOptions = [[Line, Line, Line], [Line, Line, Line]];

/** SPEC §2.1. The trigger is round 0 and counts as a round for carry purposes. */
export const ROUND_SEQUENCE: readonly RoundName[] = ["trigger", "debate", "roast", "fight"];

export function nextRoundName(after: RoundName): RoundName | null {
  return ROUND_SEQUENCE[ROUND_SEQUENCE.indexOf(after) + 1] ?? null;
}

/**
 * How long the beat after a round lasts. SPEC §2.1 puts a 10s intermission
 * between the debate and the roast and between the roast and the fight, and
 * none after the trigger — the trigger runs straight into the debate, which is
 * what makes it read as a quick-draw rather than a round.
 */
export function intermissionMs(after: RoundName): number {
  return after === "trigger" ? 0 : INTERMISSION_DURATION_MS;
}

function player(
  slot: PlayerSlot,
  hp: number,
  options: [Line, Line, Line],
  seenLineIds: readonly string[],
): PlayerState {
  return {
    slot,
    hp,
    options,
    // Null until the player types: choosing the line is the first keystroke.
    progress: null,
    // SPEC §2.7 — a fresh HP pool gets a fresh meter. Momentum does not carry.
    momentum: 0,
    specialArmed: false,
    // Displayed options carry across rounds; the dealer owns exhaustion fallback.
    seenLineIds: [...new Set([...seenLineIds, ...options.map((line) => line.id)])],
  };
}

/**
 * Build the round about to be played. SPEC §2.7 — only the fight carries an
 * advantage, and `startingHp` is what knows that.
 */
export function openRound(
  round: RoundName,
  results: readonly RoundResult[],
  options: DealtOptions,
  seen: readonly [readonly string[], readonly string[]],
  tuning?: Tuning,
): RoundState {
  return {
    round,
    endsAt: ROUND_DURATION_MS[round],
    status: "live",
    players: [
      player(0, startingHp(round, results, 0, tuning), options[0], seen[0]),
      player(1, startingHp(round, results, 1, tuning), options[1], seen[1]),
    ],
  };
}

export function initialMatch(round: RoundState): MatchState {
  return {
    phase: "arena",
    round,
    pending: null,
    results: [],
    outcome: null,
    roundStartedAt: null,
    lineOutcome: [null, null],
    lastKeyAt: [0, 0],
    generation: [0, 0],
  };
}

/** Everything a new round has to forget. One place, so no transition misses it. */
function starting(state: MatchState, round: RoundState, now: number): MatchState {
  return {
    ...state,
    phase: "round",
    round,
    pending: null,
    roundStartedAt: now,
    lineOutcome: [null, null],
    lastKeyAt: [0, 0],
    generation: [state.generation[0] + 1, state.generation[1] + 1],
  };
}

export type MatchAction =
  /** the arena reveal is over; play the round already built into state */
  | { type: "arena.done"; now: number }
  /**
   * The shared driver has applied a serializable input to this round. `at`
   * moves the acting player's clock; input that changed nothing omits it.
   */
  | { type: "round.changed"; round: RoundState; slot?: PlayerSlot; at?: number }
  /** a line landed: the round after resolution, and what the line was worth */
  | { type: "line.resolved"; round: RoundState; slot: PlayerSlot; outcome: LineOutcome }
  /** the impact beat is over and the next three are up */
  | { type: "line.dealt"; round: RoundState; slot: PlayerSlot }
  /** the round is over — `options` are the deal for whatever comes next */
  | { type: "round.end"; options: DealtOptions; now: number; tuning?: Tuning }
  /** the beat between rounds has run its course */
  | { type: "intermission.done"; now: number };

/**
 * The whole sequence, in one place.
 *
 * `round.end` carries the next round's options rather than dealing them later,
 * because the trigger has no intermission behind it and would otherwise need a
 * second path into `openRound`. Dealing eagerly and parking the result in
 * `pending` gives every transition the same shape.
 */
export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case "arena.done":
      return state.phase === "arena" ? starting(state, state.round, action.now) : state;

    case "round.changed": {
      if (state.phase !== "round") return state;
      const round = action.round;
      // Ignored input preserves the logical match state.
      if (round === state.round && action.at === undefined) return state;
      return {
        ...state,
        round,
        lastKeyAt:
          action.at === undefined ? state.lastKeyAt : replace(state.lastKeyAt, action.slot ?? 0, action.at),
      };
    }

    case "line.resolved":
      return state.phase === "round"
        ? {
            ...state,
            round: action.round,
            lineOutcome: replace(state.lineOutcome, action.slot, action.outcome),
          }
        : state;

    case "line.dealt":
      return state.phase === "round"
        ? {
            ...state,
            round: action.round,
            lineOutcome: replace(state.lineOutcome, action.slot, null),
            generation: replace(state.generation, action.slot, state.generation[action.slot] + 1),
          }
        : state;

    case "round.end": {
      // Null only if the round is still live — `tickRound` has to have closed
      // it before this is dispatched.
      const result = roundResult(state.round);
      if (!result) return state;

      const results = [...state.results, result];
      const next = nextRoundName(state.round.round);

      if (!next) {
        return { ...state, phase: "results", results, outcome: resolveMatch(results) };
      }

      const seen = [state.round.players[0].seenLineIds, state.round.players[1].seenLineIds] as const;
      const pending = openRound(next, results, action.options, seen, action.tuning);

      // No beat after the trigger — it runs straight into the debate.
      return intermissionMs(state.round.round) === 0
        ? starting({ ...state, results }, pending, action.now)
        : { ...state, phase: "intermission", pending, results };
    }

    case "intermission.done":
      return state.phase === "intermission" && state.pending
        ? starting(state, state.pending, action.now)
        : state;
  }
}
