import { DEFAULT_TUNING } from "./tuning";
import type { Tuning } from "./tuning";
import type { Tier } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** SPEC §2.5. Uncorrected errors only — repaired characters cost time, not damage. */
export function accuracyMult(uncorrectedErrors: number, tuning: Tuning = DEFAULT_TUNING): number {
  return clamp(1 - tuning.errorDamagePenalty * uncorrectedErrors, tuning.accuracyMultFloor, 1);
}

/** SPEC §2.5. */
export function speedMult(lineWpm: number, tuning: Tuning = DEFAULT_TUNING): number {
  return clamp(lineWpm / tuning.parWpm, tuning.speedMultMin, tuning.speedMultMax);
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
export function computeDamage(input: DamageInput, tuning: Tuning = DEFAULT_TUNING): DamageResult {
  const base = tuning.tierBaseDamage[input.tier];
  const multiplier = input.special ? tuning.specialDamageMult : 1;
  return {
    damage:
      base *
      accuracyMult(input.uncorrectedErrors, tuning) *
      speedMult(input.lineWpm, tuning) *
      multiplier,
    selfDamage: input.uncorrectedErrors * tuning.selfDamagePerError,
  };
}
