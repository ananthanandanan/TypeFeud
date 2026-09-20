/**
 * The contact beat: one damage number in a starburst, on line completion.
 *
 * It renders in its own fixed-height band above the typing panel and never
 * overlaps it — rule 2 of the design system, and SPEC §6.5: effects must be
 * physically unable to obscure the text the player is reading. The band holds
 * its height whether or not a burst is showing, so nothing reflows mid-line.
 */

import type { LineOutcome } from "@typefeud/game";

/** The starburst from the impact artboard — 24 points, drawn once. */
const STARBURST =
  "132,70 99,78 124,101 91,91 101,124 78,99 70,132 62,99 39,124 49,91 16,101 41,78 8,70 41,62 16,39 49,49 39,16 62,41 70,8 78,41 101,16 91,49 124,39 99,62";

export function ImpactBurst({ outcome }: { outcome: LineOutcome | null }) {
  return (
    <div className="flex h-[104px] items-center justify-center gap-6">
      {outcome ? (
        <>
          <div className="animate-impact relative flex h-[104px] w-[104px] items-center justify-center">
            <svg viewBox="0 0 140 140" className="absolute inset-0 h-full w-full" aria-hidden="true">
              <polygon points={STARBURST} fill="var(--momentum)" />
            </svg>
            <span className="text-ground relative text-[34px] leading-none font-extrabold tabular-nums">
              {outcome.damage}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            {outcome.specialConsumed ? (
              <span className="text-momentum text-[13px] font-extrabold tracking-[0.16em]">SPECIAL ×1.8</span>
            ) : null}
            <span className="text-muted text-[11px] tracking-[0.16em]">
              {Math.round(outcome.lineWpm)} WPM · {outcome.tier.toUpperCase()}
            </span>
            {outcome.uncorrectedErrors > 0 ? (
              <span className="text-error text-[11px] tracking-[0.16em] underline">
                {outcome.uncorrectedErrors} ERROR{outcome.uncorrectedErrors > 1 ? "S" : ""} · −{outcome.selfDamage} SELF
              </span>
            ) : (
              <span className="text-you text-[11px] tracking-[0.16em]">CLEAN · +1 MOMENTUM</span>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
