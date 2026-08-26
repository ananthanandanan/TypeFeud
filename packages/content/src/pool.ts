/**
 * The committed pool, loaded and validated at import. SPEC §3.6.
 *
 * The read side only. Which three lines a player is offered is `deal.ts`, and
 * the seeded no-repeat rule that will drive it lands with T-06 (#6). This
 * module hands out what has been authored, filtered.
 */

import groupchatDebate from "../pool/groupchat-debate.json";
import { contentPoolSchema } from "./schema";
import type { ContentLine, ContentPool } from "./schema";

export const POOL: ContentPool = contentPoolSchema.parse(groupchatDebate);

/** Every field is optional and narrows independently; no query means the pool. */
export interface LineQuery {
  arena?: ContentLine["arena"];
  round?: ContentLine["round"];
  tier?: ContentLine["tier"];
}

export function linesFor(query: LineQuery = {}, pool: ContentPool = POOL): ContentPool {
  return pool.filter(
    (line) =>
      (query.arena === undefined || line.arena === query.arena) &&
      (query.round === undefined || line.round === query.round) &&
      (query.tier === undefined || line.tier === query.tier),
  );
}

/** Which arenas the committed pool can actually stage. */
export function arenas(pool: ContentPool = POOL): string[] {
  return [...new Set(pool.map((line) => line.arena))];
}
