"use client";

/**
 * Where the match lands. SPEC §2.7.
 *
 * Deliberately plain. #9 is the results screen — clip-first, stats, rematch as
 * the obvious next action (SPEC §6.6) — and will replace this whole file. What
 * it has to do today is prove the flow terminated and show the arithmetic that
 * got it there, so a hand-check can tell a fight won on HP from one won on a
 * knockout.
 */

import { type MatchOutcome, type RoundName } from "@typefeud/game";

const ROUND_TITLE: Record<RoundName, string> = {
  trigger: "TRIGGER",
  debate: "DEBATE",
  roast: "ROAST",
  fight: "FIGHT",
};

export function MatchEnd({ outcome, opponentName }: { outcome: MatchOutcome; opponentName: string }) {
  const { winner, rounds } = outcome;
  const name = winner === null ? "DRAW" : winner === 0 ? "YOU WIN" : `${opponentName} WINS`;
  const tone = winner === 0 ? "text-you" : winner === 1 ? "text-opponent" : "text-muted";

  return (
    <div className="flex flex-col items-center gap-9 py-16">
      <span className={`text-[52px] leading-none font-extrabold tracking-[0.14em] ${tone}`}>
        {name}
      </span>

      <div className="border-edge bg-panel flex flex-col gap-3 border-2 px-10 py-7">
        {rounds.map((result) => (
          <div key={result.round} className="grid grid-cols-[120px_auto_auto] items-baseline gap-8">
            <span className="text-muted text-[11px] tracking-[0.22em]">
              {ROUND_TITLE[result.round]}
            </span>
            <span className="tabular-nums">
              <span className="text-you font-bold">{result.hp[0]}</span>
              <span className="text-muted"> — </span>
              <span className="text-opponent font-bold">{result.hp[1]}</span>
            </span>
            <span
              className={`text-[11px] font-extrabold tracking-[0.18em] ${
                result.winner === 0
                  ? "text-you"
                  : result.winner === 1
                    ? "text-opponent"
                    : "text-muted"
              }`}
            >
              {result.winner === null ? "DRAW" : result.winner === 0 ? "YOU" : "THEM"}
            </span>
          </div>
        ))}
      </div>

      <p className="text-muted text-xs tracking-[0.2em] uppercase">
        results screen pending #9 · reload to run it again
      </p>
    </div>
  );
}
