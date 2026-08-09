/**
 * Core game types. SPEC §4.2.
 *
 * Nothing in this package reads Date.now() or Math.random(). Time and
 * randomness arrive as parameters so a match replays identically from a trace.
 */

export type Tier = "jab" | "combo" | "haymaker";
export type RoundName = "trigger" | "debate" | "roast" | "fight";
export type PlayerSlot = 0 | 1;

export interface Line {
  id: string;
  tier: Tier;
  text: string;
  wordCount: number;
}

/** A single keystroke, timestamped relative to round start. */
export interface Keystroke {
  /** ms since round start */
  t: number;
  /** the character typed, or "\b" for backspace */
  key: string;
}

export type KeystrokeTrace = Keystroke[];

/** Per-character render state for the typing surface. SPEC §6.2. */
export type CharState = "pending" | "correct" | "wrong" | "current";

/** In-flight progress on the line a player has locked in. */
export interface LineProgress {
  lineId: string;
  /** index of the next character to type */
  charIndex: number;
  /** indices of characters currently typed wrong and not yet repaired */
  wrongIndices: number[];
  /** ms since round start at first keystroke — null until locked in */
  startedAt: number | null;
}

export interface PlayerState {
  slot: PlayerSlot;
  hp: number;
  /** the three options currently on offer. SPEC §2.3. */
  options: [Line, Line, Line];
  progress: LineProgress | null;
  /** consecutive clean lines; SPECIAL unlocks at MOMENTUM_CHARGES_FOR_SPECIAL */
  momentum: number;
  specialArmed: boolean;
  /** line ids already served this match — never repeat. SPEC §3.6. */
  seenLineIds: string[];
}

export interface RoundState {
  round: RoundName;
  /** ms since round start at which the round ends */
  endsAt: number;
  players: [PlayerState, PlayerState];
  /** seeded PRNG cursor — advanced only through pure helpers */
  rngCursor: number;
}

export interface LineOutcome {
  lineId: string;
  tier: Tier;
  damage: number;
  selfDamage: number;
  uncorrectedErrors: number;
  lineWpm: number;
  specialConsumed: boolean;
}

export interface RoundResult {
  round: RoundName;
  hp: [number, number];
  winner: PlayerSlot | null;
}

export interface MatchOutcome {
  winner: PlayerSlot | null;
  rounds: RoundResult[];
}

export interface KeyEvent {
  /** ms since round start */
  t: number;
  key: string;
}
