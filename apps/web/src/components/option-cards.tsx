/**
 * The three-line choice. SPEC §2.3 and the fight screen on the design canvas.
 *
 * Purely presentational: the keyboard stays in one listener up in `LineRun`,
 * because the choice is made by typing, never by clicking. Nothing here is
 * focusable for the same reason.
 *
 * The rejected lines dim rather than disappear or recolour — they stay legible,
 * the layout never moves under the player mid-line, and lock-in is signalled by
 * the border and the label as well as by hue (SPEC §6.7).
 */

import { TIER_BASE_DAMAGE, type Line, type Tuning } from "@typefeud/game";

const TIER_LABEL: Record<Line["tier"], string> = {
  jab: "JAB",
  combo: "COMBO",
  haymaker: "HAYMAKER",
};

export function OptionCards({
  options,
  lockedId,
  tuning,
}: {
  options: readonly [Line, Line, Line];
  /** the line the player has committed to, or null while all three are live */
  lockedId: string | null;
  tuning?: Tuning;
}) {
  const baseDamage = tuning?.tierBaseDamage ?? TIER_BASE_DAMAGE;

  return (
    <div className="grid grid-cols-3 gap-4">
      {options.map((option, slot) => {
        const locked = option.id === lockedId;
        const dimmed = lockedId !== null && !locked;

        return (
          <div
            // Two slots can hold the same line when a tier runs out of unseen
            // ones, so the slot is part of the key.
            key={`${slot}-${option.id}`}
            className={`bg-panel flex flex-col gap-2 border-2 px-[18px] py-4 transition-opacity duration-150 ${
              locked ? "border-you" : "border-edge-soft"
            } ${dimmed ? "opacity-40" : "opacity-100"}`}
            style={locked ? { boxShadow: "0 0 28px rgba(86,180,233,0.28)" } : undefined}
          >
            <div className="flex items-baseline justify-between">
              <span
                className={`text-xs font-extrabold tracking-[0.22em] ${
                  locked ? "text-you" : "text-muted"
                }`}
              >
                {TIER_LABEL[option.tier]}
              </span>
              <span
                className={`text-[11px] tracking-[0.14em] ${
                  locked ? "text-you font-bold" : "text-muted"
                }`}
              >
                {locked ? "LOCKED IN" : `${baseDamage[option.tier]} DMG`}
              </span>
            </div>

            <p className={`text-[15px] leading-normal ${locked ? "text-text" : "text-muted"}`}>
              {option.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
