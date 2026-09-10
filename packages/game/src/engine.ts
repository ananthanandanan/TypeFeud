import { computeDamage, wpm } from "./damage";
import { activeLine, createLineProgress, isLineComplete, specialReady, uncorrectedErrors } from "./progress";
import { DEFAULT_TUNING } from "./tuning";
import type { Tuning } from "./tuning";
import type {
  KeyEvent,
  Line,
  LineOutcome,
  LineProgress,
  MatchOutcome,
  PlayerSlot,
  PlayerState,
  RoundName,
  RoundResult,
  RoundState,
} from "./types";

/**
 * The entry points from SPEC §4.2. Imported by BOTH client and server so they
 * can never disagree about what a haymaker is worth.
 *
 * Invariants for every implementation in this file:
 *   - pure: no I/O, no DOM, no network
 *   - deterministic: `now` and randomness are parameters, never Date.now()/Math.random()
 *   - non-mutating: return new state, never edit the argument
 */

/** The key a KeyEvent carries for backspace. Callers map their platform's name to this. */
export const BACKSPACE = "\b";

/**
 * Fold one keystroke into the round. SPEC §2.4 — the single most important
 * interaction in the game.
 *
 * A wrong character marks and advances; it never blocks. Backspace walks back
 * one character and repairs whatever was there, costing only the time it took.
 * An error is therefore charged once, at resolution, and only if it is still
 * standing — never both the error and the correction.
 *
 * With no line locked in, this is the keystroke that chooses one — it hands off
 * to `lockIn` so that both apps have a single keystroke entry point and can
 * never disagree about which line the player committed to (SPEC §2.3).
 *
 * Ignored (returning the argument unchanged, so the caller can skip a render):
 * non-character keys such as modifiers and arrows, characters typed past the
 * end of the line, backspace at the start of one, and backspace or a character
 * matching no option while nothing is locked in.
 */
export function applyKeystroke(state: RoundState, ev: KeyEvent): RoundState {
  const slot = ev.slot ?? 0;
  const player = state.players[slot];
  const progress = player.progress;
  if (!progress) return lockIn(state, ev);

  const line = activeLine(player);
  if (!line) return state;

  const next =
    ev.key === BACKSPACE
      ? applyBackspace(progress)
      : applyCharacter(line.text, progress, ev);

  return next === progress ? state : withProgress(state, slot, next);
}

function applyCharacter(text: string, progress: LineProgress, ev: KeyEvent): LineProgress {
  if (ev.key.length !== 1) return progress;
  if (progress.charIndex >= text.length) return progress;

  const correct = ev.key === text[progress.charIndex];
  return {
    lineId: progress.lineId,
    charIndex: progress.charIndex + 1,
    // Only ever the frontier index, and backspace removes it before it can
    // return — so this stays sorted and duplicate-free without sorting.
    wrongIndices: correct
      ? progress.wrongIndices
      : [...progress.wrongIndices, progress.charIndex],
    typedChars: [...progress.typedChars, ev.key],
    startedAt: progress.startedAt ?? ev.t,
  };
}

function applyBackspace(progress: LineProgress): LineProgress {
  if (progress.charIndex === 0) return progress;

  const repaired = progress.charIndex - 1;
  return {
    lineId: progress.lineId,
    charIndex: repaired,
    wrongIndices: progress.wrongIndices.filter((i) => i !== repaired),
    typedChars: progress.typedChars.slice(0, repaired),
    // A backspace never starts the clock; charIndex > 0 means it already ran.
    startedAt: progress.startedAt,
  };
}

/**
 * Choose a line by typing its first character. SPEC §2.3 — the mechanic that
 * separates this from a speed test.
 *
 * The locking keystroke *is* the line's first character; the player never types
 * it twice. Matching is case-insensitive because a missed shift must not leave
 * the keyboard dead in the middle of a round, but the keystroke is then applied
 * verbatim, so a case slip lands as an ordinary error the player can backspace
 * over rather than as nothing at all (invariant 6).
 *
 * Ties break in the options' own order, which the dealer keeps as jab, combo,
 * haymaker. `dealThree` prefers three distinct first characters precisely so
 * that this is the floor rather than a coin flip the player cannot see coming.
 *
 * A no-op (returning the argument unchanged) when a line is already locked in
 * or the key matches nothing, so the caller can route every key through
 * `applyKeystroke` without guarding.
 */
export function lockIn(state: RoundState, ev: KeyEvent): RoundState {
  const slot = ev.slot ?? 0;
  const player = state.players[slot];
  // BACKSPACE is a one-character key too, and nothing can be locked in with it.
  if (player.progress || ev.key === BACKSPACE || ev.key.length !== 1) return state;

  const chosen = player.options.find(
    (option) => option.text[0]?.toLowerCase() === ev.key.toLowerCase(),
  );
  if (!chosen) return state;

  return applyKeystroke(withProgress(state, slot, createLineProgress(chosen.id)), ev);
}

/**
 * Put three fresh options in front of a player and clear whatever they were
 * typing. SPEC §2.3 — all three refresh on completion.
 *
 * This is the other half of `resolveLine` leaving `progress` standing: the
 * finished line stays on screen through the impact beat, and the deal is what
 * ends it. Dealing does not resolve, so dealing over an unfinished line simply
 * abandons it, undamaged either way.
 */
export function dealOptions(
  state: RoundState,
  slot: PlayerSlot,
  options: [Line, Line, Line],
): RoundState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[slot] = {
    ...players[slot], options, progress: null,
    seenLineIds: [...new Set([...players[slot].seenLineIds, ...options.map((line) => line.id)])],
  };
  return { ...state, players };
}

function withProgress(state: RoundState, slot: PlayerSlot, progress: LineProgress): RoundState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[slot] = { ...players[slot], progress };
  return { ...state, players };
}

/**
 * What a completed line did: the round after resolution, and the outcome that
 * drives the impact beat locally and goes on the wire as `line.resolved`.
 */
export interface LineResolution {
  state: RoundState;
  outcome: LineOutcome;
}

export interface ResolveInput {
  /** ms since round start at the keystroke that completed the line */
  now: number;
  /** whose line this is; omitted means slot 0, matching applyKeystroke */
  slot?: PlayerSlot;
}

/**
 * Turn a finished line into damage, momentum and HP. SPEC §2.5, §2.6.
 *
 * Only errors still standing are charged — a repaired character already cost
 * the player the time it took to repair it, and invariant 6 says never both.
 *
 * Momentum is the counterweight to raw speed: speed alone caps at
 * `speedMultMax`, but four clean lines in a row unlock a Special worth
 * `specialDamageMult` on top. Any uncorrected error empties the meter.
 *
 * `progress` is deliberately left standing. The line the player just finished
 * is still the line on screen, and clearing it here would blank the surface at
 * the exact moment the impact beat plays. The caller advances to the next line
 * by locking one in, and must call this once per completed line — resolving the
 * same progress twice charges the damage twice.
 */
export function resolveLine(
  state: RoundState,
  input: ResolveInput,
  tuning: Tuning = DEFAULT_TUNING,
): LineResolution {
  const slot = input.slot ?? 0;
  const player = state.players[slot];
  const progress = player.progress;
  if (!progress) throw new Error(`resolveLine: player ${slot} has no line locked in`);

  const line = activeLine(player);
  if (!line) throw new Error(`resolveLine: ${progress.lineId} is not among player ${slot}'s options`);
  if (!isLineComplete(line.text, progress)) {
    throw new Error(`resolveLine: ${line.id} is only ${progress.charIndex}/${line.text.length} typed`);
  }

  const errors = uncorrectedErrors(progress);
  const specialConsumed = player.specialArmed;
  const lineWpm = wpm(line.text.length, input.now - (progress.startedAt ?? input.now));

  const raw = computeDamage(
    { tier: line.tier, uncorrectedErrors: errors, lineWpm, special: specialConsumed },
    tuning,
  );
  // Rounded once, here, so the number the burst shows is exactly the number HP
  // loses. computeDamage itself stays exact — SPEC §2.5's worked examples are
  // tested against it directly.
  const damage = Math.round(raw.damage);
  const selfDamage = Math.round(raw.selfDamage);

  // A spent Special empties the meter before this line charges it, so firing on
  // a clean line leaves you at one charge rather than back at zero.
  const carried = specialConsumed ? 0 : player.momentum;
  const momentum = errors === 0 ? Math.min(carried + 1, tuning.momentumChargesForSpecial) : 0;

  const opponent = (1 - slot) as PlayerSlot;
  const players = [...state.players] as [PlayerState, PlayerState];
  players[slot] = {
    ...player,
    hp: Math.max(0, player.hp - selfDamage),
    momentum,
    specialArmed: false,
    seenLineIds: player.seenLineIds.includes(line.id)
      ? player.seenLineIds
      : [...player.seenLineIds, line.id],
  };
  players[opponent] = {
    ...players[opponent],
    hp: Math.max(0, players[opponent].hp - damage),
  };

  return {
    state: { ...state, players },
    outcome: {
      lineId: line.id,
      tier: line.tier,
      damage,
      selfDamage,
      uncorrectedErrors: errors,
      lineWpm,
      specialConsumed,
    },
  };
}

/**
 * Spend a full momentum meter to arm the Special. SPEC §2.6 — the meter unlocks
 * it, the player triggers it, and the next completed line is the one multiplied.
 *
 * A no-op (returning the argument unchanged) when the meter is not full or the
 * Special is already armed, so the caller can bind it to a key without guarding.
 */
export function triggerSpecial(
  state: RoundState,
  slot: PlayerSlot = 0,
  tuning: Tuning = DEFAULT_TUNING,
): RoundState {
  const player = state.players[slot];
  if (player.specialArmed || !specialReady(player, tuning)) return state;

  const players = [...state.players] as [PlayerState, PlayerState];
  players[slot] = { ...player, specialArmed: true };
  return { ...state, players };
}

/**
 * Has the round ended? SPEC §4.6 — deadline-based, called on every keystroke
 * and once at the round boundary. This is not a loop and must never become one
 * (invariant 8).
 *
 * Two ways to end. The deadline is the ordinary one. A player at 0 HP is the
 * other, and it applies in EVERY round rather than only round 3: HP never
 * rises and the carry is binary, so the moment someone reaches 0 the round's
 * winner is arithmetically fixed and the remaining seconds cannot change it.
 * Round 3 differs only in what happens next — it ends the match rather than the
 * round (SPEC §2.7).
 *
 * A no-op (returning the argument unchanged) while the round is still live or
 * already over, so the caller can skip a render.
 */
export function tickRound(state: RoundState, now: number): RoundState {
  if (state.status === "over") return state;

  const expired = now >= state.endsAt;
  const knockout = state.players.some((player) => player.hp <= 0);
  // SPEC §2.2 — the trigger is a quick-draw: first to type the word correctly
  // takes it, so a completed line ends it rather than the clock running out.
  const quickDraw = state.round === "trigger" && state.players.some(hasCompletedLine);
  if (!expired && !knockout && !quickDraw) return state;

  return { ...state, status: "over" };
}

function hasCompletedLine(player: PlayerState): boolean {
  const line = activeLine(player);
  return line !== null && player.progress !== null && isLineComplete(line.text, player.progress);
}

/**
 * Who won the round, once it is over. SPEC §2.7 — more HP remaining takes it.
 *
 * The read side of `tickRound`, in the same spirit as `progress.ts` being the
 * read side of `LineProgress`: null while the round is live, so a caller can
 * poll it without first asking whether the round has ended. Equal HP is a draw
 * and carries nothing to either player.
 */
export function roundResult(state: RoundState): RoundResult | null {
  if (state.status !== "over") return null;

  const [you, them] = state.players;
  return { round: state.round, hp: [you.hp, them.hp], winner: winnerOf(state) };
}

function winnerOf(state: RoundState): PlayerSlot | null {
  const [you, them] = state.players;

  // SPEC §2.2 — the trigger is won by finishing the word, not by out-damaging.
  // Reading it from progress rather than HP is what makes the result the same
  // whether the caller resolved the completing line before ticking or after:
  // the quick-draw closes the round on that keystroke, and a winner derived
  // from HP would depend on whether the damage had landed yet.
  if (state.round === "trigger") {
    const first = hasCompletedLine(you);
    const second = hasCompletedLine(them);
    return first === second ? null : first ? 0 : 1;
  }

  return you.hp === them.hp ? null : you.hp > them.hp ? 0 : 1;
}

/**
 * What a player starts a round with. SPEC §2.7.
 *
 * Only round 3 carries anything. Rounds 1 and 2 each open at the base pool,
 * which is the whole point of them not being a best-of-three: a player cannot
 * clinch before the fight, they can only walk into it ahead. The trigger is
 * worth deliberately less than a round (SPEC §2.2) — it sets the topic, it does
 * not swing the match.
 */
export function startingHp(
  round: RoundName,
  rounds: readonly RoundResult[],
  slot: PlayerSlot,
  tuning: Tuning = DEFAULT_TUNING,
): number {
  if (round !== "fight") return tuning.roundBaseHp;

  const won = (name: RoundName) => rounds.find((result) => result.round === name)?.winner === slot;
  const trigger = won("trigger") ? tuning.triggerWinHpBonus : 0;
  const carried = (["debate", "roast"] as const).filter(won).length * tuning.roundWinHpBonus;

  return tuning.roundBaseHp + trigger + carried;
}

/**
 * Fold the rounds into a match. SPEC §2.7.
 *
 * Round 3 is the decider and the only round that names the winner — the
 * earlier rounds have already paid out, as the HP round 3 opened with. A fight
 * that ends level is a draw, and a match whose fight never happened has no
 * winner rather than a defaulted one.
 */
export function resolveMatch(rounds: RoundResult[]): MatchOutcome {
  const fight = rounds.find((result) => result.round === "fight");
  return { winner: fight?.winner ?? null, rounds };
}
