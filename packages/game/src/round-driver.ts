import { applyKeystroke, dealOptions, resolveLine, tickRound, triggerSpecial } from "./engine";
import { activeLine, isLineComplete } from "./progress";
import type { Tuning } from "./tuning";
import type { Line, LineOutcome, PlayerSlot, RoundState } from "./types";

export type RoundInput =
  | { type: "key"; slot: PlayerSlot; key: string }
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
    case "key": {
      if (resolved[input.slot]) break;
      round = tickRound(applyKeystroke(round, { ...input, t: at }), at);
      const player = round.players[input.slot];
      const line = activeLine(player);
      if (line && player.progress && isLineComplete(line.text, player.progress)) {
        const result = resolveLine(round, { now: at, slot: input.slot }, tuning);
        round = tickRound(result.state, at);
        outcome = result.outcome;
        resolved[input.slot] = true;
      }
      break;
    }
  }
  return { round, resolved, outcome };
}
