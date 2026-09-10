"use client";

/**
 * The HUD from the fight-screen artboard. SPEC §6.1.
 *
 * Three columns: you top-left, the opponent top-right and mirrored, the round
 * and its countdown down the middle. You are always on the left and always in
 * `you` blue, so the two players are told apart by position as well as hue —
 * rule 1 of the design system (SPEC §6.7).
 *
 * The countdown here is a **render**, not a tick. It reads the clock every
 * 100ms and paints a number; it never touches game state, which is what
 * `tickRound` is for. SPEC §4.6 puts the countdown on the client for exactly
 * this reason, so the interval below is not the tick loop invariant 8 forbids.
 */

import {
  activeLine, uncorrectedErrors,
  type LineOutcome, type RoundName, type RoundState,
} from "@typefeud/game";
import { useEffect, useState } from "react";
import { FighterBar } from "@/components/fighter-bar";

/** SPEC §2.1. The trigger is round 0 — a pacing beat, not a numbered round. */
const ROUND_TITLE: Record<RoundName, string> = {
  trigger: "THE TRIGGER",
  debate: "THE DEBATE",
  roast: "THE ROAST",
  fight: "THE FIGHT",
};

const ROUND_NUMBER: Record<RoundName, number> = { trigger: 0, debate: 1, roast: 2, fight: 3 };

export function MatchHud({
  round,
  startedAt,
  opponentName,
  live,
  opponentOutcome,
  showOpponentActivity,
}: {
  round: RoundState;
  /** performance.now() when this round began, or null before it has */
  startedAt: number | null;
  opponentName: string;
  /** the opponent's last landed line, for the beat after it lands */
  opponentOutcome: LineOutcome | null;
  /** false with no opponent driving progress — an idle strip is a lie */
  showOpponentActivity: boolean;
  /**
   * Whether the round is being played right now. False across the intermission,
   * where the HUD stays mounted showing the round that just ended — its clock
   * has nothing left to count and its Special cannot be armed, so neither is
   * offered rather than sitting there expired.
   */
  live: boolean;
}) {
  const [you, them] = round.players;
  // Round 3 opens above the base pool (SPEC §2.7), so the bar has to be scaled
  // against what this round actually started with or a carried advantage would
  // render as a bar that cannot move until it has been spent.
  const max = Math.max(you.hp, them.hp, 100);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-10">
      <FighterBar
        name="YOU"
        hp={you.hp}
        max={max}
        momentum={you.momentum}
        specialArmed={you.specialArmed}
        showSpecialHint={live}
        side="you"
      />

      <div className="flex flex-col items-center gap-1.5">
        <span className="text-muted text-xs tracking-[0.32em]">
          ROUND {ROUND_NUMBER[round.round]}
        </span>
        <span className="text-[26px] font-extrabold tracking-[0.22em]">
          {ROUND_TITLE[round.round]}
        </span>
        {/* The slot keeps its height either way, so the HUD does not jump
            when a round ends (SPEC §6.2's no-layout-shift rule). */}
        <div className="flex h-11 items-center">
          {live ? <RoundClock round={round} startedAt={startedAt} /> : null}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <FighterBar
          name={opponentName}
          hp={them.hp}
          max={max}
          momentum={them.momentum}
          specialArmed={them.specialArmed}
          showSpecialHint={live}
          side="opponent"
        />
        {showOpponentActivity ? <OpponentActivity player={them} outcome={opponentOutcome} /> : null}
      </div>
    </div>
  );
}

/**
 * That the opponent is typing, and roughly how far in. SPEC §4.3 — this is a
 * render of progress snapshots and nothing more, which is the point: it can
 * only ever show what multiplayer will actually have.
 *
 * What it deliberately does not show is their text. TypeRacer can put a car on
 * a shared track because both players race the same passage; here the opponent
 * holds three lines you were not dealt, and painting them would have the
 * player reading the wrong half of the screen at speed. So the strip carries
 * position and the HP bar above it carries the contest — the stick figures do
 * the rest at Milestone 5 (SPEC §6.4), and this is the stand-in until they do.
 *
 * It lives outside the typing panel's bounding box, on the opponent's side, so
 * rule 2 of the design system holds: nothing here can reach the player's text.
 */
function OpponentActivity({
  player,
  outcome,
}: {
  player: RoundState["players"][number];
  outcome: LineOutcome | null;
}) {
  const line = activeLine(player);
  const progress = player.progress;
  const landed = outcome !== null;
  const typed = line && progress ? Math.min(progress.charIndex, line.text.length) : 0;
  const errors = progress ? uncorrectedErrors(progress) : 0;
  // A landed line reads as full regardless of rounding — the beat is showing
  // what it was worth, not where the caret got to.
  const filled = landed ? 100 : line ? (typed / line.text.length) * 100 : 0;

  return (
    <div className="border-opponent/50 flex flex-col items-end gap-1.5 border-t-2 pt-2">
      <span className="text-muted text-[11px] tracking-[0.18em] tabular-nums">
        {landed ? (
          <>
            <span className="text-momentum font-extrabold">LANDED {outcome.damage}</span>
            {" · RELOADING"}
          </>
        ) : line ? (
          <>
            {`TYPING · ${typed} / ${line.text.length}`}
            {/* Never hue alone (SPEC §6.7): the count says it, not the colour. */}
            {errors > 0 ? (
              <span className="text-error"> · {errors} ERROR{errors > 1 ? "S" : ""}</span>
            ) : null}
          </>
        ) : (
          "CHOOSING"
        )}
      </span>
      <div className="border-edge-soft bg-panel flex h-[6px] w-full flex-row-reverse border-2">
        <div
          className={`${landed ? "bg-momentum" : "bg-opponent"} transition-[width] duration-100 ease-linear`}
          style={{ width: `${Math.max(0, Math.min(100, filled))}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The countdown. Derived from `endsAt` and the round's start rather than
 * counted down, so it cannot drift away from the deadline the engine will
 * actually be judged against — and so a backgrounded tab that throttles the
 * interval catches up the moment it is looked at again.
 */
function RoundClock({ round, startedAt }: { round: RoundState; startedAt: number | null }) {
  const [remaining, setRemaining] = useState(round.endsAt);

  useEffect(() => {
    if (startedAt === null || round.status === "over") return;

    const paint = () =>
      setRemaining(Math.max(0, round.endsAt - (performance.now() - startedAt)));

    paint();
    const id = window.setInterval(paint, 100);
    return () => window.clearInterval(id);
  }, [round.endsAt, round.status, startedAt]);

  const over = round.status === "over";
  const seconds = Math.ceil((over ? 0 : remaining) / 1000);
  // Under ten seconds the tenths start moving, which is the whole point of the
  // last stretch of a round; above it they are noise.
  const label =
    seconds >= 10
      ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
      : (Math.max(0, over ? 0 : remaining) / 1000).toFixed(1);

  return (
    <span
      className={`text-[44px] leading-none font-extrabold tabular-nums tracking-[0.04em] ${
        seconds <= 5 ? "text-error" : "text-momentum"
      }`}
    >
      {label}
    </span>
  );
}
