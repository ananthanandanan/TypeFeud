import {
  ACCURACY_MULT_FLOOR,
  ERROR_DAMAGE_PENALTY,
  PAR_WPM,
  SELF_DAMAGE_PER_ERROR,
  SPEED_MULT_MAX,
  SPEED_MULT_MIN,
  SPECIAL_DAMAGE_MULT,
  TIER_BASE_DAMAGE,
} from "./tuning.js";
import type { Tier } from "./types.js";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** SPEC §2.5. Uncorrected errors only — repaired characters cost time, not damage. */
export function accuracyMult(uncorrectedErrors: number): number {
  return clamp(1 - ERROR_DAMAGE_PENALTY * uncorrectedErrors, ACCURACY_MULT_FLOOR, 1);
}

/** SPEC §2.5. */
export function speedMult(lineWpm: number): number {
  return clamp(lineWpm / PAR_WPM, SPEED_MULT_MIN, SPEED_MULT_MAX);
}

/**
 * Standard WPM: a "word" is 5 characters, including the ones typed wrong —
 * the player pressed those keys, so they count toward gross speed. Accuracy
 * is penalised separately by accuracyMult, not twice here.
 */
export function wpm(charCount: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return charCount / 5 / (elapsedMs / 60_000);
}

export interface DamageInput {
  tier: Tier;
  uncorrectedErrors: number;
  lineWpm: number;
  special: boolean;
}

export interface DamageResult {
  damage: number;
  selfDamage: number;
}

/** SPEC §2.5, §2.6. damage = base × accuracy × speed (× 1.8 if special). */
export function computeDamage(input: DamageInput): DamageResult {
  const base = TIER_BASE_DAMAGE[input.tier];
  const multiplier = input.special ? SPECIAL_DAMAGE_MULT : 1;
  return {
    damage: base * accuracyMult(input.uncorrectedErrors) * speedMult(input.lineWpm) * multiplier,
    selfDamage: input.uncorrectedErrors * SELF_DAMAGE_PER_ERROR,
  };
}
