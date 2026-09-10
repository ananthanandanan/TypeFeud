import { dealThree, type ContentPool } from "@typefeud/content";
import { nextRandom, type Line, type PlayerSlot, type RecordedDeal, type ReplaySetup, type RoundName } from "@typefeud/game";

/** Selection is a pure transaction: only the committed deal advances a stream. */
export function selectOptions(
  setup: ReplaySetup,
  cursors: readonly [number, number],
  round: RoundName,
  slot: PlayerSlot,
  seen: readonly string[],
  pool?: ContentPool,
): { deal: RecordedDeal; lines: [Line, Line, Line] } {
  let cursor = cursors[slot];
  const lines = dealThree(
    { arena: setup.arena, round, tier: round === "trigger" ? "jab" : setup.tier },
    seen,
    () => {
      const next = nextRandom(cursor);
      cursor = next.state;
      return next.value;
    },
    { recent: setup.recent[slot], pool },
  );
  return {
    lines,
    deal: { slot, lineIds: lines.map((line) => line.id) as [string, string, string], randomState: cursor },
  };
}

/** Line snapshots are immutable for the lifetime of a recording. */
export function rememberLines(existing: readonly Line[], incoming: readonly Line[]): Line[] {
  const lines = new Map(existing.map((line) => [line.id, line]));
  for (const line of incoming) {
    const before = lines.get(line.id);
    if (before && (before.text !== line.text || before.tier !== line.tier || before.wordCount !== line.wordCount)) {
      throw new Error(`Replay: line ${line.id} changed during the match`);
    }
    if (!before) lines.set(line.id, { ...line });
  }
  return [...lines.values()];
}
