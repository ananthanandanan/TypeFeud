/**
 * The three-line deal. SPEC §2.3.
 *
 * One line per tier, so the choice is always jab / combo / haymaker and never
 * three of the same thing. Randomness arrives as an `rng` parameter rather than
 * `Math.random`. The session supplies a seeded stream from packages/game.
 * This module owns candidate queries because game must not know the pool
 * exists (invariant 1's layering).
 */

import { linesFor, POOL, type LineQuery } from "./pool";
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
function candidates(query: DealQuery, tier: Tier, source: ContentPool): ContentPool {
  const pools = [
    linesFor({ ...query, tier }, source),
    linesFor({ arena: query.arena, tier }, source),
    linesFor({ arena: query.arena }, source),
    source,
  ];
  return pools.find((pool) => pool.length > 0) ?? [];
}

export interface DealContext {
  recent?: readonly string[];
  /** Injectable authored pool for deterministic selection tests. */
  pool?: ContentPool;
}

/**
 * Prefer unseen lines, relaxing recent-match history before this match's seen
 * set only when a tier runs out. Stable IDs make file ordering irrelevant.
 * Search first-character combinations before conceding a collision; a greedy
 * pick can strand another tier even when a valid three-way choice exists.
 */
export function dealThree(
  query: DealQuery,
  seen: readonly string[],
  rng: () => number,
  context: DealContext = {},
): [Line, Line, Line] {
  const source = context.pool ?? POOL;
  const recent = context.recent ?? [];
  const seenTags = new Set(source.filter((line) => seen.includes(line.id)).flatMap((line) => line.tags));
  const tiers = query.tier ? [query.tier, query.tier, query.tier] : [...TIERS];
  const candidatesBySlot = tiers.map((tier, slot) => {
    const pool = candidates(query, tier, source);
    if (!pool.length) throw new Error(`dealThree: no lines at all for ${tier}`);
    return { slot, pool, draw: rng() };
  });
  const penalty = (line: ContentLine) => seen.includes(line.id) ? 2 : recent.includes(line.id) ? 1 : 0;
  const novelty = (line: ContentLine) => line.tags.filter((tag) => !seenTags.has(tag)).length;
  function choicesFor(relaxation: number) {
    return candidatesBySlot.map(({ slot, pool, draw }) => {
      const outsideMatch = pool.filter((line) => !seen.includes(line.id));
      const fresh = outsideMatch.filter((line) => !recent.includes(line.id));
      const eligible = relaxation === 0 && fresh.length ? fresh
        : relaxation < 2 && outsideMatch.length ? outsideMatch : pool;
      const ordered = [...eligible].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const offset = Math.min(Math.floor(draw * ordered.length), ordered.length - 1);
      const rotated = [...ordered.slice(offset), ...ordered.slice(0, offset)];
      rotated.sort((a, b) => penalty(a) - penalty(b) || novelty(b) - novelty(a));
      // Candidates with the same first character have identical constraints.
      const unique = rotated.filter((line, i) => rotated.findIndex((other) => firstChar(other) === firstChar(line)) === i);
      return { slot, choices: unique };
    }).sort((a, b) => a.choices.length - b.choices.length);
  }
  let slots = choicesFor(0);

  const result: Line[] = [];
  function fill(index: number, taken: Set<string>): boolean {
    if (index === slots.length) return true;
    const { slot, choices } = slots[index]!;
    for (const line of choices) {
      const char = firstChar(line);
      if (taken.has(char)) continue;
      result[slot] = toLine(line);
      if (fill(index + 1, new Set([...taken, char]))) return true;
    }
    return false;
  }
  // A pool is also exhausted when its remaining lines cannot form three
  // selectable choices. Relax history before accepting a lock-in collision.
  for (let relaxation = 0; relaxation < 3; relaxation++) {
    slots = choicesFor(relaxation);
    if (fill(0, new Set())) return result as [Line, Line, Line];
  }
  slots = choicesFor(0);
  const taken = new Set<string>();
  for (const { slot, choices } of slots) {
    const line = choices.find((candidate) => !taken.has(firstChar(candidate))) ?? choices[0]!;
    result[slot] = toLine(line);
    taken.add(firstChar(line));
  }
  return result as [Line, Line, Line];
}
