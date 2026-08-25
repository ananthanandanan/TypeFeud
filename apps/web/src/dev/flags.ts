/**
 * Dev shortcuts from SPEC §7.2. Built early on purpose — every later milestone
 * is faster for being able to jump straight to the state under test.
 *
 *   ?bot=1     start against a ghost, skipping the queue
 *   ?round=3   jump straight to a round (0 trigger, 1 debate, 2 roast, 3 fight)
 *   ?tier=     which tier of line to serve (jab | combo | haymaker)
 *   ?tuning=1  open the tuning panel on load (it also toggles with `)
 */

import type { RoundName, Tier } from "@typefeud/game";

export const ROUND_BY_NUMBER: readonly RoundName[] = ["trigger", "debate", "roast", "fight"];

export interface DevFlags {
  bot: boolean;
  round: RoundName;
  tier: Tier;
  tuning: boolean;
}

export const DEFAULT_FLAGS: DevFlags = {
  bot: false,
  round: "debate",
  tier: "haymaker",
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
    tier:
      tier === "jab" || tier === "combo" || tier === "haymaker" ? tier : DEFAULT_FLAGS.tier,
    tuning: boolFlag(params.tuning),
  };
}
