/** Mulberry32, with the entire uint32 state returned rather than captured. */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let mixed = Math.imul(next ^ (next >>> 15), next | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return { value: ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296, state: next };
}

/** Independent streams: dealing for one player never advances the other. */
export function playerSeeds(seed: number): [number, number] {
  return [seed >>> 0, (seed ^ 0x9e3779b9) >>> 0];
}
