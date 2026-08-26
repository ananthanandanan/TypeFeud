/**
 * The three-line deal. SPEC §2.3.
 *
 * One line per tier, so the choice is always jab / combo / haymaker and never
 * three of the same thing. Randomness arrives as an `rng` parameter rather than
 * `Math.random`, which is what lets T-06 (#6) drop a seeded PRNG in here without
 * touching a call site — and it keeps this file as replayable as
 * `packages/game` even though it lives outside it.
 *
 * It lives in content rather than game because game must not know the pool
 * exists (invariant 1's layering). #6 moves the PRNG proper into game and
 * leaves this as the candidate query.
 */

import { linesFor, type LineQuery } from "./pool";
import type { ContentLine, ContentPool } from "./schema";
import type { Line, RoundName, Tier } from "@typefeud/game";

export const TIERS: readonly Tier[] = ["jab", "combo", "haymaker"];

export function toLine(line: ContentLine): Line {
  return { id: line.id, tier: line.tier, text: line.text, wordCount: line.wordCount };
}

const firstChar = (line: ContentLine): string => (line.text[0] ?? "").toLowerCase();

export interface DealQuery extends LineQuery {
  round: RoundName;
  /** dev override (SPEC §7.2 `?tier=`) — deal all three slots from one tier */
  tier?: Tier;
}

/**
 * Not every round has authored lines yet (T-11 writes the rest), and a tier can
 * run out of unseen lines mid-match long before then. Rather than deal an empty
 * slot, widen: this round's tier, then the tier anywhere, then anything at all.
 */
function candidates(query: DealQuery, tier: Tier): ContentPool {
  const pools = [
    linesFor({ ...query, tier }),
    linesFor({ arena: query.arena, tier }),
    linesFor({ arena: query.arena }),
    linesFor(),
  ];
  return pools.find((pool) => pool.length > 0) ?? [];
}

/**
 * Deal three. Skips lines the player has already been served this match, and
 * prefers three distinct first characters so that lock-in is unambiguous —
 * `lockIn`'s tie-break is the floor for a pool too thin to avoid a collision,
 * not something a player should meet in normal play.
 *
 * Tiers are filled most-constrained-first rather than jab-first. Taking them in
 * tier order lets a tier with plenty of choices spend the one first character a
 * nearly-exhausted tier still had — which the debate pool, three of whose six
 * lines start with "Y", does on the second deal of a match.
 *
 * Both preferences yield rather than fail: a tier with nothing unseen left
 * repeats before it deals nothing.
 */
export function dealThree(
  query: DealQuery,
  seen: readonly string[],
  rng: () => number,
): [Line, Line, Line] {
  const tiers = query.tier ? [query.tier, query.tier, query.tier] : [...TIERS];

  const slots = tiers.map((tier, slot) => {
    const pool = candidates(query, tier);
    if (pool.length === 0) throw new Error(`dealThree: no lines at all for ${tier}`);
    const unseen = pool.filter((line) => !seen.includes(line.id));
    return { slot, fresh: unseen.length > 0 ? unseen : pool };
  });

  const taken = new Set<string>();
  const dealt: Line[] = [];

  for (const { slot, fresh } of [...slots].sort((a, b) => a.fresh.length - b.fresh.length)) {
    const distinct = fresh.filter((line) => !taken.has(firstChar(line)));
    const from = distinct.length > 0 ? distinct : fresh;

    const line = from[Math.min(Math.floor(rng() * from.length), from.length - 1)]!;
    taken.add(firstChar(line));
    dealt[slot] = toLine(line);
  }

  return dealt as [Line, Line, Line];
}
