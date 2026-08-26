/**
 * One fighter's HP bar and momentum meter. SPEC §2.6, §6.3.
 *
 * Colours come from docs/design/README.md via the tokens in globals.css. You
 * are always on the left in `you` blue and the opponent on the right in
 * `opponent` orange — position carries the same signal as hue, which is rule 1
 * of the design system (SPEC §6.7). The opponent's side mirrors so both meters
 * fill away from the centre.
 */

import { MOMENTUM_CHARGES_FOR_SPECIAL } from "@typefeud/game";

export function FighterBar({
  name,
  hp,
  momentum,
  specialArmed,
  side,
}: {
  name: string;
  hp: number;
  momentum: number;
  specialArmed: boolean;
  side: "you" | "opponent";
}) {
  const mirrored = side === "opponent";
  const accent = mirrored ? "text-opponent" : "text-you";
  const fill = mirrored ? "bg-opponent" : "bg-you";

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className={`flex items-baseline justify-between ${mirrored ? "flex-row-reverse" : ""}`}
      >
        <span className={`text-xl font-extrabold tracking-[0.14em] ${accent}`}>{name}</span>
        <span className={`text-[15px] font-bold tabular-nums ${accent}`}>{Math.round(hp)}</span>
      </div>

      <div
        className={`border-edge-soft bg-panel flex h-5 border-2 ${mirrored ? "flex-row-reverse" : ""}`}
      >
        <div
          className={`${fill} transition-[width] duration-300 ease-out`}
          style={{ width: `${Math.max(0, Math.min(100, hp))}%` }}
        />
      </div>

      <MomentumMeter
        momentum={momentum}
        specialArmed={specialArmed}
        mirrored={mirrored}
      />
    </div>
  );
}

/**
 * Four pips, filled one per clean line. It moves on line completion only —
 * per-keystroke feedback is noise at speed (SPEC §6.3).
 */
function MomentumMeter({
  momentum,
  specialArmed,
  mirrored,
}: {
  momentum: number;
  specialArmed: boolean;
  mirrored: boolean;
}) {
  const full = momentum >= MOMENTUM_CHARGES_FOR_SPECIAL;

  return (
    <div className={`flex items-center gap-1.5 ${mirrored ? "flex-row-reverse" : ""}`}>
      <span className="text-muted text-[11px] tracking-[0.18em]">MOMENTUM</span>
      <div className={`flex gap-[5px] ${mirrored ? "flex-row-reverse" : ""}`}>
        {Array.from({ length: MOMENTUM_CHARGES_FOR_SPECIAL }, (_pip, i) => (
          <div
            key={i}
            className={`h-[7px] w-[22px] transition-colors duration-200 ${
              i < momentum ? "bg-momentum" : "bg-edge-soft"
            }`}
          />
        ))}
      </div>
      {/* Never hue alone: the meter reads as full from the pips, and the label
          spells out what it unlocked and how to spend it. */}
      {full || specialArmed ? (
        <span className="text-momentum text-[11px] font-extrabold tracking-[0.18em]">
          {specialArmed ? "SPECIAL ARMED ×1.8" : "SPECIAL · TAB"}
        </span>
      ) : null}
    </div>
  );
}
