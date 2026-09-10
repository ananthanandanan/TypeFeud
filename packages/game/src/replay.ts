import type { RoundInput } from "./round-driver";
import type { Tuning } from "./tuning";
import type { Line, PlayerSlot, RoundName, Tier } from "./types";

export interface RecordedDeal {
  slot: PlayerSlot;
  lineIds: [string, string, string];
  /** Stream state AFTER this committed deal. */
  randomState: number;
}

export type ReplayAction =
  | { type: "arena.done" }
  | { type: "intermission.done" }
  | { type: "round.end"; deals: [RecordedDeal, RecordedDeal] | null }
  | { type: "input"; input: Exclude<RoundInput, { type: "deal" }> }
  | { type: "deal"; deal: RecordedDeal }
  | { type: "tuning"; tuning: Tuning };

export interface ReplayEvent {
  seq: number;
  round: RoundName;
  /** Milliseconds from session initialization; ties retain sequence order. */
  at: number;
  action: ReplayAction;
}

export interface ReplaySetup {
  sessionId: string;
  seed: number;
  arena: string;
  firstRound: RoundName;
  tier?: Tier;
  tuning: Tuning;
  /** Fixed at match start. Playback never consults browser storage. */
  recent: [string[], string[]];
}

/** Internal v1 recording. No recorded damage, HP or winner is trusted. */
export interface ReplayRecord {
  version: 1;
  setup: ReplaySetup;
  /** Snapshots make old recordings independent of later pool edits. */
  lines: Line[];
  initialDeals: [RecordedDeal, RecordedDeal];
  events: ReplayEvent[];
}

export function recordedOptions(lines: readonly Line[], deal: RecordedDeal): [Line, Line, Line] {
  return deal.lineIds.map((id) => {
    const line = lines.find((candidate) => candidate.id === id);
    if (!line) throw new Error(`Replay: missing line ${id}`);
    return { ...line };
  }) as [Line, Line, Line];
}
