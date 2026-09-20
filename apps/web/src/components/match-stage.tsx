"use client";

/**
 * The match, phase by phase. SPEC §2.1 and the Match flow artboard.
 *
 * All of the state lives in `useMatch`; this decides what is on screen for the
 * phase it is in. The HUD stays mounted across rounds and intermissions so the
 * HP bars and the round title are continuous — only the lower two thirds swap.
 */

import { arenas, tauntsFor, type Taunt } from "@typefeud/content";
import {
  INTERMISSION_DURATION_MS,
  roundResult,
  startingHp,
  type RoundName,
  type RoundResult,
  type RoundState,
} from "@typefeud/game";
import { useEffect, useState } from "react";
import type { DevFlags } from "@/dev/flags";
import { TuningPanel } from "@/dev/tuning";
import { useMatch } from "@/match/use-match";
import { applyTauntKey, emptyTauntProgress } from "@/match/taunt";
import { MatchEnd } from "@/components/match-end";
import { MatchHud } from "@/components/match-hud";
import { TriggerRound } from "@/components/trigger-round";
import { TypingStage } from "@/components/typing-stage";

const TAUNT_OPTIONS = tauntsFor("group_chat").slice(0, 3);

export function MatchStage({ flags }: { flags: DevFlags }) {
  const controller = useMatch(flags);
  if (!controller) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-7 p-5 sm:p-10">
        <TuningPanel />
        <ArenaReveal />
      </main>
    );
  }
  const { match, stats, sendTaunt, rematch } = controller;
  const { phase, round, generation, lineOutcome, lastKeyAt, roundStartedAt } = match;
  // Slot 0 throughout: this is the local player's surface. The opponent's half
  // of every one of these pairs is read by the HUD's activity strip instead.
  const opponentName = flags.bot ? "GHOST" : "OPPONENT";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-7 p-5 sm:p-10">
      <TuningPanel />

      {phase === "arena" ? <ArenaReveal /> : null}

      {phase === "round" || phase === "intermission" ? (
        <MatchHud
          round={round}
          startedAt={roundStartedAt}
          opponentName={opponentName}
          live={phase === "round"}
          opponentOutcome={lineOutcome[1]}
          showOpponentActivity={flags.bot && phase === "round"}
        />
      ) : null}

      {phase === "round" ? (
        round.round === "trigger" ? (
          <TriggerRound round={round} />
        ) : (
          <TypingStage
            key={generation[0]}
            round={round}
            outcome={lineOutcome[0]}
            lastKeyAt={lastKeyAt[0]}
            flags={flags}
          />
        )
      ) : null}

      {phase === "intermission" ? (
        <Intermission
          round={round}
          results={match.results}
          next={match.pending?.round ?? null}
          opponentName={opponentName}
          sentTaunt={match.taunts[0]}
          onSend={sendTaunt}
        />
      ) : null}

      {phase === "results" && match.outcome ? (
        <MatchEnd outcome={match.outcome} opponentName={opponentName} playerStats={stats} onRematch={rematch} />
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
 * a three-line canned taunt exchange.
 *
 * The carry line matters more than it looks: it is the only place the player
 * learns why round 3 opens above 100 HP.
 */
function Intermission({
  round,
  results,
  next,
  opponentName,
  sentTaunt,
  onSend,
}: {
  round: RoundState;
  results: RoundResult[];
  next: RoundName | null;
  opponentName: string;
  sentTaunt: { id: string; text: string } | null;
  onSend: (taunt: Taunt) => void;
}) {
  const result = roundResult(round);
  if (!result) return null;

  const carry = startingHp("fight", results, 0) - startingHp("fight", [], 0);
  const took = result.winner === null ? "NOBODY TAKES IT" : result.winner === 0 ? "YOU TAKE IT" : "THEY TAKE IT";

  return (
    <div className="flex flex-col items-center gap-3 py-8">
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
      <TauntExchange options={TAUNT_OPTIONS} sent={sentTaunt} opponentName={opponentName} onSend={onSend} />
      {next ? <NextRoundIn next={next} /> : null}
    </div>
  );
}

function TauntExchange({
  options,
  sent,
  opponentName,
  onSend,
}: {
  options: Taunt[];
  sent: { id: string; text: string } | null;
  opponentName: string;
  onSend: (taunt: Taunt) => void;
}) {
  const [progress, setProgress] = useState(emptyTauntProgress);

  useEffect(() => {
    if (sent) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLElement && event.target.matches("input, textarea, button")) return;
      const key = event.key === "Backspace" ? "\b" : event.key;
      const result = applyTauntKey(options, progress, key);
      if (result.progress === progress) return;
      event.preventDefault();
      setProgress(result.progress);
      if (result.sent) onSend(result.sent);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSend, options, progress, sent]);

  if (sent) {
    return (
      <div className="mt-6 grid w-full grid-cols-1 sm:grid-cols-2" aria-live="polite">
        <div className="border-you bg-panel relative col-start-1 border-2 p-5 sm:col-start-2 sm:p-6">
          <span className="text-you mb-3 block text-[10px] font-bold tracking-[0.18em]">
            DELIVERED TO {opponentName}
          </span>
          <p className="text-base leading-relaxed sm:text-lg">{sent.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 flex w-full flex-col gap-3">
      <span className="text-muted text-center text-[10px] tracking-[0.2em]">PICK A TAUNT · TYPE TO SEND</span>
      {options.map((option, optionIndex) => {
        const selected = progress.selected === optionIndex;
        const dimmed = progress.selected !== null && !selected;
        return (
          <div
            key={option.id}
            className={`border-edge bg-panel flex gap-4 border-2 px-4 py-3 transition-opacity sm:px-5 sm:py-4 ${dimmed ? "opacity-25" : ""}`}
          >
            <span className="text-muted text-xs font-bold tabular-nums">{optionIndex + 1}</span>
            <p className="text-sm leading-relaxed sm:text-base">
              {option.text.split("").map((character, index) => {
                const typed = selected && index < progress.typed.length;
                const wrong = typed && progress.wrongIndices.includes(index);
                const current = selected && index === progress.typed.length;
                return (
                  <span
                    key={index}
                    className={
                      wrong
                        ? "text-error underline"
                        : typed
                          ? "text-you"
                          : current
                            ? "text-text border-momentum border-b-2"
                            : progress.selected === null
                              ? "text-text"
                              : "text-muted"
                    }
                  >
                    {typed ? progress.typed[index] : character}
                  </span>
                );
              })}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/**
 * How long until the next round. Counted from mount rather than from a
 * timestamp on the state, because this component mounts exactly when the
 * intermission begins and unmounts when it ends — the same beat `useMatch`
 * has already scheduled the transition for.
 *
 * Like the round clock, this paints a number and touches nothing.
 */
function NextRoundIn({ next }: { next: RoundName }) {
  const [remaining, setRemaining] = useState(INTERMISSION_DURATION_MS);

  useEffect(() => {
    const startedAt = performance.now();
    const id = window.setInterval(
      () => setRemaining(Math.max(0, INTERMISSION_DURATION_MS - (performance.now() - startedAt))),
      100,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="text-muted mt-6 text-[11px] tracking-[0.2em] uppercase">
      {next} in {Math.ceil(remaining / 1000)}
    </span>
  );
}
