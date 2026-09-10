import { applyKeystroke, dealOptions, resolveLine, tickRound, triggerSpecial } from "./engine";
import { applyProgressSnapshot } from "./opponent-progress";
import { activeLine, isLineComplete } from "./progress";
import type { Tuning } from "./tuning";
import type { Line, LineOutcome, PlayerSlot, RoundState } from "./types";

export type RoundInput =
  | { type: "key"; slot: PlayerSlot; key: string }
  /**
   * The opponent, at ~10Hz. Same slot, same resolution path, a third of the
   * information — this is the input #14 points at a socket instead of a ghost
   * (SPEC §4.3, invariant 4).
   */
  | { type: "progress"; slot: PlayerSlot; lineId: string; charIndex: number; errors: number }
  | { type: "special"; slot: PlayerSlot }
  | { type: "clock" }
  | { type: "deal"; slot: PlayerSlot; options: [Line, Line, Line] };

export interface DrivenRound {
  round: RoundState;
  /** A completed line remains visible, but its damage can only land once. */
  resolved: [boolean, boolean];
}

/** The live client and replay use exactly the same ordered engine calls. */
export function driveRound(
  state: DrivenRound,
  input: RoundInput,
  at: number,
  tuning: Tuning,
): DrivenRound & { outcome: LineOutcome | null } {
  let round = state.round;
  const resolved: [boolean, boolean] = [...state.resolved];
  if (round.status === "over") return { ...state, outcome: null };

  // Expiration wins over an input at the deadline, even if the browser's
  // boundary timeout has not fired yet. Late keys cannot steal a trigger win.
  round = tickRound(round, at);
  if (round.status === "over") return { round, resolved, outcome: null };

  let outcome: LineOutcome | null = null;
  switch (input.type) {
    case "clock":
      break;
    case "special":
      if (!resolved[input.slot]) round = triggerSpecial(round, input.slot, tuning);
      break;
    case "deal":
      round = dealOptions(round, input.slot, input.options);
      resolved[input.slot] = false;
      break;
    case "key":
    case "progress": {
      if (resolved[input.slot]) break;
      round = tickRound(
        input.type === "key"
          ? applyKeystroke(round, { ...input, t: at })
          : applyProgressSnapshot(round, input.slot, input, at),
        at,
      );
      const landed = resolveIfComplete(round, input.slot, at, tuning);
      round = landed.round;
      outcome = landed.outcome;
      if (landed.outcome) resolved[input.slot] = true;
      break;
    }
  }
  return { round, resolved, outcome };
}

/**
 * Charge a finished line, once. Shared by the local keystroke path and the
 * opponent's snapshots so the two can never disagree about what a line was
 * worth — the only difference between them is how the progress got there.
 */
function resolveIfComplete(
  round: RoundState,
  slot: PlayerSlot,
  at: number,
  tuning: Tuning,
): { round: RoundState; outcome: LineOutcome | null } {
  const player = round.players[slot];
  const line = activeLine(player);
  if (!line || !player.progress || !isLineComplete(line.text, player.progress)) {
    return { round, outcome: null };
  }

  const result = resolveLine(round, { now: at, slot }, tuning);
  return { round: tickRound(result.state, at), outcome: result.outcome };
}
