/**
 * Dev shortcuts from SPEC §7.2. Built early on purpose — every later milestone
 * is faster for being able to jump straight to the state under test.
 *
 *   ?bot=1     start against a ghost, skipping the queue
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
  bot: false,
  round: "debate",
  tier: undefined,
  tuning: false,
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** `?flag`, `?flag=1` and `?flag=true` all mean on; anything else means off. */
function boolFlag(raw: string | string[] | undefined): boolean {
  const value = first(raw);
  if (value === undefined) return false;
  return value === "" || value === "1" || value === "true";
}

export function parseDevFlags(params: RawParams): DevFlags {
  const round = ROUND_BY_NUMBER[Number(first(params.round))];
  const tier = first(params.tier);

  return {
    bot: boolFlag(params.bot),
    round: round ?? DEFAULT_FLAGS.round,
    tier: tier === "jab" || tier === "combo" || tier === "haymaker" ? tier : undefined,
    tuning: boolFlag(params.tuning),
  };
}
