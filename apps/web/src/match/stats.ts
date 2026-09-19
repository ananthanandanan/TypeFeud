import { wpm, type LineOutcome, type PlayerSlot, type RoundName } from "@typefeud/game";

export interface BiggestHit {
  damage: number;
  round: RoundName;
  tier: LineOutcome["tier"];
}

export interface PlayerMatchStats {
  completedLines: number;
  characters: number;
  uncorrectedErrors: number;
  activeMs: number;
  biggestHit: BiggestHit | null;
}

export type MatchStats = [PlayerMatchStats, PlayerMatchStats];

export interface ResultStats {
  wpm: number;
  accuracy: number;
  biggestHit: BiggestHit | null;
}

function emptyPlayerStats(): PlayerMatchStats {
  return {
    completedLines: 0,
    characters: 0,
    uncorrectedErrors: 0,
    activeMs: 0,
    biggestHit: null,
  };
}

export function emptyMatchStats(): MatchStats {
  return [emptyPlayerStats(), emptyPlayerStats()];
}

/** Fold one resolved line into the match totals. Replay calls this same path. */
export function recordLineStats(
  stats: MatchStats,
  slot: PlayerSlot,
  round: RoundName,
  characterCount: number,
  activeMs: number,
  outcome: LineOutcome,
): MatchStats {
  const previous = stats[slot];
  const biggestHit = !previous.biggestHit || outcome.damage > previous.biggestHit.damage
    ? { damage: outcome.damage, round, tier: outcome.tier }
    : previous.biggestHit;
  const next: PlayerMatchStats = {
    completedLines: previous.completedLines + 1,
    characters: previous.characters + characterCount,
    uncorrectedErrors: previous.uncorrectedErrors + outcome.uncorrectedErrors,
    activeMs: previous.activeMs + Math.max(0, activeMs),
    biggestHit,
  };
  const players: MatchStats = [...stats];
  players[slot] = next;
  return players;
}

/** Gross WPM and final, uncorrected accuracy follow the same rules as damage. */
export function resultStats(stats: PlayerMatchStats): ResultStats {
  const correct = Math.max(0, stats.characters - stats.uncorrectedErrors);
  return {
    wpm: Math.round(wpm(stats.characters, stats.activeMs)),
    accuracy: stats.characters === 0 ? 100 : Math.round((correct / stats.characters) * 100),
    biggestHit: stats.biggestHit,
  };
}
