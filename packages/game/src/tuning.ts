/**
 * Every tunable number in the game. SPEC §2.5, §2.6, §2.7.
 *
 * These are starting values and are expected to move during Milestone 2.
 * They live in one file so the dev tuning panel (SPEC §7.2) can drive them
 * and so no magic numbers leak into the resolution code.
 */

export const TIER_BASE_DAMAGE = {
  jab: 6,
  combo: 13,
  haymaker: 30,
} as const;

/** Word-count bounds per tier, enforced by the content validator. SPEC §2.3. */
export const TIER_WORD_BOUNDS = {
  jab: { min: 4, max: 8 },
  combo: { min: 10, max: 16 },
  haymaker: { min: 20, max: 30 },
} as const;

/** Damage lost per uncorrected error, and the floor it clamps to. SPEC §2.4. */
export const ERROR_DAMAGE_PENALTY = 0.15;
export const ACCURACY_MULT_FLOOR = 0.4;

/** Self-damage per uncorrected error — the figure stumbles. SPEC §2.4. */
export const SELF_DAMAGE_PER_ERROR = 2;

/** speedMult = clamp(lineWPM / PAR_WPM, MIN, MAX). SPEC §2.5. */
export const PAR_WPM = 60;
export const SPEED_MULT_MIN = 0.7;
export const SPEED_MULT_MAX = 1.4;

/** Momentum meter. SPEC §2.6. */
export const MOMENTUM_CHARGES_FOR_SPECIAL = 4;
export const SPECIAL_DAMAGE_MULT = 1.8;

/** HP pools and carried advantage. SPEC §2.7. */
export const ROUND_BASE_HP = 100;
export const ROUND_WIN_HP_BONUS = 10;
export const TRIGGER_WIN_HP_BONUS = 5;

/** Round durations in ms. SPEC §2.1. */
export const ROUND_DURATION_MS = {
  trigger: 2_000,
  debate: 45_000,
  roast: 45_000,
  fight: 60_000,
} as const;

export const INTERMISSION_DURATION_MS = 10_000;
export const ARENA_REVEAL_MS = 3_000;

/** Sabotage — Round 3 only. SPEC §2.8. */
export const SABOTAGE_DURATION_MS = 1_500;
export const SABOTAGE_COOLDOWN_MS = 8_000;

/** Anti-cheat ceiling. SPEC §4.7. */
export const MAX_PLAUSIBLE_WPM = 220;
