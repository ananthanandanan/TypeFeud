/**
 * Dev shortcuts from SPEC §7.2. Built early on purpose — every later milestone
 * is faster for being able to jump straight to the state under test.
 *
 *   ?bot=0     turn the ghost OFF and leave the opponent idle. The ghost is
 *              the default: since #7 there is a real opponent to play against,
 *              and an idle one makes a bare localhost:3000 look broken rather
 *              than unimplemented. Matchmaking (Milestone 4) is what decides
 *              this for real, with a ghost as the queue-empty fallback.
 *   ?round=3   open the match at a round (0 trigger, 1 debate, 2 roast, 3 fight).
 *              The sequence runs on from there, so ?round=2 still ends at the
 *              fight — it seeds where the match starts, it does not pin it.
 *   ?tier=     deal all three options from one tier (jab | combo | haymaker),
 *              for testing a tier in isolation. Unset means a real choice.
 *   ?tuning=1  open the tuning panel on load (it also toggles with `)
 */

import type { RoundName, Tier } from "@typefeud/game";

export const ROUND_BY_NUMBER: readonly RoundName[] = ["trigger", "debate", "roast", "fight"];

export interface DevFlags {
  bot: boolean;
  round: RoundName;
  /** unset in normal play — the three-line choice deals one of each tier */
  tier?: Tier;
  tuning: boolean;
}

export const DEFAULT_FLAGS: DevFlags = {
  bot: true,
  round: "debate",
  tier: undefined,
  tuning: false,
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * `?flag`, `?flag=1` and `?flag=true` all mean on; anything else means off.
 * `whenAbsent` is what an unmentioned flag means, so a flag can default on and
 * still be turned off explicitly with `?flag=0`.
 */
function boolFlag(raw: string | string[] | undefined, whenAbsent = false): boolean {
  const value = first(raw);
  if (value === undefined) return whenAbsent;
  return value === "" || value === "1" || value === "true";
}

export function parseDevFlags(params: RawParams): DevFlags {
  const round = ROUND_BY_NUMBER[Number(first(params.round))];
  const tier = first(params.tier);

  return {
    bot: boolFlag(params.bot, DEFAULT_FLAGS.bot),
    round: round ?? DEFAULT_FLAGS.round,
    tier: tier === "jab" || tier === "combo" || tier === "haymaker" ? tier : undefined,
    tuning: boolFlag(params.tuning),
  };
}
