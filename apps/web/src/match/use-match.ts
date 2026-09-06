"use client";

/**
 * The impure half of the match. SPEC §4.6 — everything that reads a clock,
 * schedules a timer or deals from the pool lives here, so `machine.ts` stays
 * pure and portable to the server at #13.
 *
 * The timing model is the one invariant 8 insists on: deadlines, not ticks.
 * `endsAt` is a number of milliseconds from the round's start, the round ends
 * when `tickRound` is told a `now` past it, and `tickRound` runs on every
 * keystroke plus **one `setTimeout` per round boundary** as the backstop for a
 * round nobody is typing in. Nothing here drives game state on an interval and
 * nothing ever should — the countdown in the HUD is a render that reads the
 * clock and paints a number, which is a different thing entirely.
 */

import { dealThree } from "@typefeud/content";
import {
  activeLine,
  applyKeystroke,
  ARENA_REVEAL_MS,
  BACKSPACE,
  dealOptions,
  isLineComplete,
  resolveLine,
  tickRound,
  triggerSpecial,
  type RoundName,
  type RoundState,
  type Tuning,
} from "@typefeud/game";
import { useEffect, useReducer, useRef } from "react";
import type { DevFlags } from "@/dev/flags";
import { useTuning } from "@/dev/tuning";
import {
  initialMatch,
  intermissionMs,
  matchReducer,
  nextRoundName,
  openRound,
  type DealtOptions,
  type MatchState,
} from "./machine";

/**
 * Selection is unseeded for now: `rng` is a parameter of `dealThree`, and #6
 * replaces this argument with a seeded PRNG plus the cross-match ring buffer of
 * SPEC §3.6. Within a match, `seenLineIds` already prevents repeats.
 */
function dealFor(
  round: RoundName,
  flags: DevFlags,
  seen: readonly [readonly string[], readonly string[]],
  rng: () => number = Math.random,
): DealtOptions {
  // The trigger is one word, not a choice (SPEC §2.2). Pinning the tier makes
  // the dealer fill all three slots from the trigger pool, so whatever the
  // player types can only lock in the word that is on screen.
  const tier = round === "trigger" ? "jab" : flags.tier;
  const query = { round, tier };
  return [dealThree(query, seen[0], rng), dealThree(query, seen[1], rng)];
}

/**
 * The deal that renders on the server and again on the client's first pass.
 *
 * A random deal in the initial state would hand React two different sets of
 * three lines to reconcile and blow up hydration. Dealing the same three both
 * times and then re-dealing for real in an effect keeps the markup identical
 * and costs one commit. #6 makes this unnecessary: with a seed on the state,
 * both sides deal the same three and the effect goes.
 */
const FIRST_DEAL = () => 0;

const NO_SEEN = [[], []] as readonly [readonly string[], readonly string[]];

function openMatch(flags: DevFlags, rng?: () => number): MatchState {
  // `?round=` seeds where the match opens; the sequence runs on from there, so
  // a match started at the roast still ends at the fight.
  const first = flags.round;
  return initialMatch(openRound(first, [], dealFor(first, flags, NO_SEEN, rng), NO_SEEN));
}

const seenOf = (round: RoundState) =>
  [round.players[0].seenLineIds, round.players[1].seenLineIds] as const;

export function useMatch(flags: DevFlags): MatchState {
  const { tuning } = useTuning();
  const [match, dispatch] = useReducer(matchReducer, flags, (f) => openMatch(f, FIRST_DEAL));

  const dealtOnce = useRef(false);
  // resolveLine leaves the finished line standing, so nothing in the state says
  // "already resolved" — this is what keeps one line from being charged twice.
  const resolved = useRef(false);

  // Timers fire long after the render that armed them. These keep what a timer
  // reads current without putting a new object in its dependency array, which
  // would tear the timer down and rebuild it on every keystroke. Assigned in an
  // effect rather than during render, so a discarded render cannot leak.
  const live = useRef<{ round: RoundState; tuning: Tuning; startedAt: number | null }>({
    round: match.round,
    tuning,
    startedAt: match.roundStartedAt,
  });
  useEffect(() => {
    live.current = { round: match.round, tuning, startedAt: match.roundStartedAt };
  });

  const { phase, round, lineOutcome, roundStartedAt } = match;
  const you = round.players[0];
  const complete =
    you.progress !== null && isLineComplete(activeLine(you)?.text ?? "", you.progress);

  // The real opening deal, once the markup the server sent has been adopted.
  useEffect(() => {
    if (dealtOnce.current) return;
    dealtOnce.current = true;
    dispatch({ type: "match.reset", match: openMatch(flags) });
  }, [flags]);

  // A new round is a new line to resolve.
  useEffect(() => {
    resolved.current = false;
  }, [round.round, match.generation]);

  // ── the arena reveal, and the beat between rounds ────────────────────────
  useEffect(() => {
    if (phase !== "arena") return;
    const id = window.setTimeout(
      () => dispatch({ type: "arena.done", now: performance.now() }),
      ARENA_REVEAL_MS,
    );
    return () => window.clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "intermission") return;
    const id = window.setTimeout(
      () => dispatch({ type: "intermission.done", now: performance.now() }),
      intermissionMs(round.round),
    );
    return () => window.clearTimeout(id);
  }, [phase, round.round]);

  // ── the one timer per round boundary (SPEC §4.6) ─────────────────────────
  //
  // A backstop, not a clock. A round with someone typing in it ends on their
  // keystroke, because every keystroke runs `tickRound`; this fires for the
  // round nobody finishes.
  useEffect(() => {
    if (phase !== "round" || round.status === "over" || roundStartedAt === null) return;
    const remaining = round.endsAt - (performance.now() - roundStartedAt);

    const id = window.setTimeout(
      () => dispatch({ type: "round.apply", apply: (r) => tickRound(r, r.endsAt) }),
      Math.max(0, remaining),
    );
    return () => window.clearTimeout(id);
  }, [phase, round.status, round.endsAt, roundStartedAt]);

  // ── a round that has ended moves the match on ────────────────────────────
  //
  // Every way a round can end — the deadline above, or a knockout landing on a
  // keystroke — sets `status` to over, so this is the single place that has to
  // deal for what comes next and hand it to the machine.
  useEffect(() => {
    if (phase !== "round" || round.status !== "over") return;
    // A line that is finished but not yet paid out has to land first. The
    // trigger's quick-draw (SPEC §2.2) closes the round on the completing
    // keystroke, and advancing here before resolution would bank the round at
    // level HP and hand the +5 to nobody.
    if (complete && !resolved.current) return;
    const { round: current, tuning: t } = live.current;
    // The fight has nothing behind it; the machine throws these options away.
    const upcoming = nextRoundName(current.round) ?? current.round;
    dispatch({
      type: "round.end",
      options: dealFor(upcoming, flags, seenOf(current)),
      now: performance.now(),
      tuning: t,
    });
  }, [phase, round.status, complete, flags]);

  // ── resolution, and the deal that follows the impact beat ────────────────
  //
  // Resolution fires once, on the keystroke that finished the line — not per
  // keystroke, which SPEC §6.3 rules out as noise at speed.
  useEffect(() => {
    if (phase !== "round" || !complete || resolved.current) return;
    resolved.current = true;

    const { round: current, tuning: t } = live.current;
    const { state, outcome } = resolveLine(current, { now: match.lastKeyAt }, t);
    // A line that takes the last of an opponent's HP ends the round here rather
    // than waiting for the boundary timer (SPEC §2.7).
    dispatch({ type: "line.resolved", round: tickRound(state, match.lastKeyAt), outcome });
  }, [phase, complete, match.lastKeyAt]);

  /**
   * The deal that used to be the enter key (#4). SPEC §6.3 puts the damage on
   * line completion, and the impact beat needs its recoil before the text under
   * it changes — so the next three arrive `impactBeatMs` after contact rather
   * than when the player asks for them.
   */
  useEffect(() => {
    if (phase !== "round" || !lineOutcome || round.status === "over") return;

    const id = window.setTimeout(() => {
      const { round: current } = live.current;
      const [options] = dealFor(current.round, flags, seenOf(current));
      dispatch({ type: "line.dealt", round: dealOptions(current, 0, options) });
    }, live.current.tuning.impactBeatMs);

    return () => window.clearTimeout(id);
  }, [phase, lineOutcome, round.status, flags]);

  // ── keystrokes ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "round") return;

    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.target instanceof HTMLElement && ev.target.matches("input, textarea")) return;

      // Tab spends a full meter (SPEC §2.6 — the player triggers the Special).
      // triggerSpecial is a no-op below four charges, so there is nothing to guard.
      if (ev.key === "Tab") {
        ev.preventDefault();
        dispatch({
          type: "round.apply",
          apply: (r) => triggerSpecial(r, 0, live.current.tuning),
        });
        return;
      }

      const key = ev.key === "Backspace" ? BACKSPACE : ev.key;
      if (key !== BACKSPACE && key.length !== 1) return;
      ev.preventDefault();

      const started = live.current.startedAt ?? performance.now();
      const t = performance.now() - started;
      dispatch({
        type: "round.apply",
        at: t,
        // Before a line is locked in this is the choice; after it, a character.
        // The same keystroke then asks whether the round is still live, which is
        // how a round ends without anything having to poll it.
        apply: (r) => tickRound(applyKeystroke(r, { t, key }), t),
      });
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  return match;
}
