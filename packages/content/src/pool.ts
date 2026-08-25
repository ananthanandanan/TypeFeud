/**
 * The committed pool, loaded and validated at import. SPEC §3.6.
 *
 * Selection — which three lines a player is offered, and the no-repeat rule —
 * is seeded and lives in `packages/game` (T-06). This module only hands out
 * what has been authored.
 */

import groupchatDebate from "../pool/groupchat-debate.json";
import { contentPoolSchema } from "./schema";
import type { ContentLine, ContentPool } from "./schema";

export const POOL: ContentPool = contentPoolSchema.parse(groupchatDebate);

export function linesForRound(round: ContentLine["round"], pool: ContentPool = POOL): ContentPool {
  return pool.filter((line) => line.round === round);
}
