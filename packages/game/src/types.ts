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
  /**
   * What the player actually pressed, one entry per typed character
   * (length === charIndex). SPEC §6.2 requires a wrong character to stay
   * visible as typed, never replaced by the expected one — so the surface
   * needs the keys, not just where they went wrong.
   *
   * Local render state only. It never goes on the wire: progress snapshots
   * stay {lineId, charIndex, errors} (SPEC §4.3).
   */
  typedChars: string[];
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
  /** All displayed option IDs this match, including unchosen lines. SPEC §3.6. */
  seenLineIds: string[];
}

/**
 * Whether the round is still being played. SPEC §2.7 — `tickRound` is the only
 * thing that moves it to "over", and nothing moves it back.
 */
export type RoundStatus = "live" | "over";

export interface RoundState {
  round: RoundName;
  /** ms since round start at which the round ends */
  endsAt: number;
  /** "over" once the deadline passed or a player reached 0 HP. SPEC §2.7. */
  status: RoundStatus;
  players: [PlayerState, PlayerState];
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
  /** null on equal HP — a draw carries nothing. SPEC §2.7. */
  winner: PlayerSlot | null;
}

export interface MatchOutcome {
  winner: PlayerSlot | null;
  rounds: RoundResult[];
}

export interface KeyEvent {
  /** ms since round start */
  t: number;
  /** the character typed, or BACKSPACE ("\b") */
  key: string;
  /**
   * Whose keystroke this is. Omitted means slot 0 — a client only ever has its
   * own keystrokes, and the opponent arrives as progress snapshots, never keys
   * (SPEC §4.3). The server sets it when folding a trace for either player.
   */
  slot?: PlayerSlot;
}
