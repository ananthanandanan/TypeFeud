"use client";

/**
 * The match, phase by phase. SPEC §2.1 and the Match flow artboard.
 *
 * All of the state lives in `useMatch`; this decides what is on screen for the
 * phase it is in. The HUD stays mounted across rounds and intermissions so the
 * HP bars and the round title are continuous — only the lower two thirds swap.
 */

import { arenas } from "@typefeud/content";
import { roundResult, startingHp, type RoundResult, type RoundState } from "@typefeud/game";
import type { DevFlags } from "@/dev/flags";
import { TuningPanel } from "@/dev/tuning";
import { useMatch } from "@/match/use-match";
import { MatchEnd } from "@/components/match-end";
import { MatchHud } from "@/components/match-hud";
import { TriggerRound } from "@/components/trigger-round";
import { TypingStage } from "@/components/typing-stage";

export function MatchStage({ flags }: { flags: DevFlags }) {
  const match = useMatch(flags);
  const { phase, round, generation, lineOutcome, lastKeyAt, roundStartedAt } = match;
  const opponentName = flags.bot ? "GHOST" : "OPPONENT";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-7 p-10">
      <TuningPanel />

      {phase === "arena" ? <ArenaReveal /> : null}

      {phase === "round" || phase === "intermission" ? (
        <MatchHud round={round} startedAt={roundStartedAt} opponentName={opponentName} />
      ) : null}

      {phase === "round" ? (
        round.round === "trigger" ? (
          <TriggerRound round={round} />
        ) : (
          <TypingStage
            key={generation}
            round={round}
            outcome={lineOutcome}
            lastKeyAt={lastKeyAt}
            flags={flags}
          />
        )
      ) : null}

      {phase === "intermission" ? <Intermission round={round} results={match.results} /> : null}

      {phase === "results" && match.outcome ? (
        <MatchEnd outcome={match.outcome} opponentName={opponentName} />
      ) : null}
    </main>
  );
}

/** SPEC §2.1 — 3 seconds that set the topic before anyone types. */
function ArenaReveal() {
  const arena = arenas()[0] ?? "group chat";

  return (
    <div className="flex flex-col items-center gap-4 py-24">
      <span className="text-muted text-xs tracking-[0.32em] uppercase">arena</span>
      <span className="text-[44px] leading-none font-extrabold tracking-[0.16em] uppercase">
        {arena.replace(/_/g, " ")}
      </span>
    </div>
  );
}

/**
 * The beat between rounds. SPEC §2.1 gives it 10 seconds and SPEC §2.9 gives it
 * a taunt exchange — the taunts are #8, and this holds the round that just
 * landed in the meantime.
 *
 * The carry line matters more than it looks: it is the only place the player
 * learns why round 3 opens above 100 HP.
 */
function Intermission({ round, results }: { round: RoundState; results: RoundResult[] }) {
  const result = roundResult(round);
  if (!result) return null;

  const carry = startingHp("fight", results, 0) - startingHp("fight", [], 0);
  const took =
    result.winner === null
      ? "NOBODY TAKES IT"
      : result.winner === 0
        ? "YOU TAKE IT"
        : "THEY TAKE IT";

  return (
    <div className="flex flex-col items-center gap-3 py-16">
      <span
        className={`text-[26px] font-extrabold tracking-[0.16em] ${
          result.winner === 0 ? "text-you" : result.winner === 1 ? "text-opponent" : "text-muted"
        }`}
      >
        {took}
      </span>
      <span className="text-muted tabular-nums">
        {result.hp[0]} — {result.hp[1]}
        {carry > 0 ? ` · +${carry} HP into the fight` : ""}
      </span>
      <span className="text-muted mt-4 text-[11px] tracking-[0.2em] uppercase">
        taunt exchange pending #8
      </span>
    </div>
  );
}
