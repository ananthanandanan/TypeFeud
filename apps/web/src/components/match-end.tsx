"use client";

import { type MatchOutcome, type RoundName } from "@typefeud/game";
import { resultStats, type PlayerMatchStats } from "@/match/stats";

const ROUND_TITLE: Record<RoundName, string> = {
  trigger: "TRIGGER",
  debate: "DEBATE",
  roast: "ROAST",
  fight: "FIGHT",
};

const STARBURST =
  "132,70 99,78 124,101 91,91 101,124 78,99 70,132 62,99 39,124 49,91 16,101 41,78 8,70 41,62 16,39 49,49 39,16 62,41 70,8 78,41 101,16 91,49 124,39 99,62";

export function MatchEnd({
  outcome,
  opponentName,
  playerStats,
  onRematch,
}: {
  outcome: MatchOutcome;
  opponentName: string;
  playerStats: PlayerMatchStats;
  onRematch: () => void;
}) {
  const stats = resultStats(playerStats);
  const verdict = outcome.winner === null
    ? "DRAW"
    : outcome.winner === 0
      ? "YOU WON"
      : `${opponentName} WON`;
  const tone = outcome.winner === 0
    ? "text-you"
    : outcome.winner === 1
      ? "text-opponent"
      : "text-text";

  return (
    <section className="flex w-full flex-col items-center gap-7 py-5 sm:py-8" aria-labelledby="match-verdict">
      <div className="flex items-center gap-4 sm:gap-5">
        <Fighter color={outcome.winner === 1 ? "var(--opponent)" : "var(--you)"} pose="victory" small />
        <h1
          id="match-verdict"
          className={`text-[clamp(2rem,6vw,3.4rem)] leading-none font-extrabold tracking-[0.12em] sm:tracking-[0.18em] ${tone}`}
        >
          {verdict}
        </h1>
      </div>

      <div className="border-edge bg-panel w-full border-2">
        <div
          className="relative flex min-h-[260px] items-center justify-between overflow-hidden px-[7%] sm:min-h-[360px] sm:px-[9%]"
          aria-label={stats.biggestHit
            ? `Match highlight: ${stats.biggestHit.damage} damage in the ${ROUND_TITLE[stats.biggestHit.round].toLowerCase()}`
            : "Match highlight: no completed hits"}
        >
          <div className="match-reel-grid absolute inset-0" aria-hidden="true" />
          <span className="text-muted absolute top-4 left-4 text-[10px] tracking-[0.2em] sm:top-5 sm:left-6 sm:text-[11px] sm:tracking-[0.24em]">
            MATCH REEL · {stats.biggestHit ? ROUND_TITLE[stats.biggestHit.round] : "NO HITS"}
          </span>

          <div className="relative z-10 w-[28%] max-w-36">
            <Fighter color="var(--you)" pose="strike" />
          </div>

          <div className="relative z-10 flex h-28 w-28 items-center justify-center sm:h-40 sm:w-40">
            <svg viewBox="0 0 140 140" className="absolute inset-0 h-full w-full" aria-hidden="true">
              <polygon points={STARBURST} fill="var(--momentum)" />
            </svg>
            <span className="text-ground relative text-4xl leading-none font-extrabold tabular-nums sm:text-5xl">
              {stats.biggestHit?.damage ?? 0}
            </span>
          </div>

          <div className="relative z-10 w-[28%] max-w-36 -scale-x-100">
            <Fighter color="var(--opponent)" pose="hit" />
          </div>
        </div>

        <div className="border-edge-soft flex items-center justify-between gap-4 border-t-2 px-4 py-3 sm:px-6 sm:py-4">
          <span className="text-text text-[11px] font-bold tracking-[0.14em] sm:text-xs">
            {stats.biggestHit
              ? `${stats.biggestHit.tier.toUpperCase()} · BIGGEST HIT`
              : "THE NEXT ONE LANDS"}
          </span>
          <span className="text-muted text-right text-[10px] tracking-[0.12em] sm:text-[11px] sm:tracking-[0.16em]">
            REPLAY EXPORT · MILESTONE 6
          </span>
        </div>
      </div>

      <div className="grid w-full grid-cols-3 gap-3 sm:gap-5">
        <ResultStat label="WPM" value={stats.wpm} />
        <ResultStat label="ACCURACY" value={`${stats.accuracy}%`} />
        <ResultStat label="BIGGEST HIT" value={stats.biggestHit?.damage ?? 0} highlight />
      </div>

      <button
        type="button"
        onClick={onRematch}
        className="bg-you text-ground mt-2 w-full max-w-md cursor-pointer px-8 py-5 text-xl font-extrabold tracking-[0.2em] shadow-[0_0_40px_rgba(86,180,233,0.28)] outline-none hover:bg-[#8ecbf0] focus-visible:ring-4 focus-visible:ring-white sm:py-6 sm:text-2xl sm:tracking-[0.24em]"
      >
        REMATCH
      </button>
    </section>
  );
}

function ResultStat({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`border-t-[3px] pt-3 sm:pt-4 ${highlight ? "border-momentum" : "border-you"}`}>
      <div className="text-muted text-[9px] tracking-[0.12em] sm:text-[11px] sm:tracking-[0.22em]">{label}</div>
      <div className={`mt-1 text-2xl leading-none font-extrabold tabular-nums sm:text-[40px] ${highlight ? "text-momentum" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Fighter({ color, pose, small = false }: { color: string; pose: "victory" | "strike" | "hit"; small?: boolean }) {
  const paths = pose === "victory"
    ? ["M60 37 L60 80", "M60 50 L84 22", "M60 50 L42 62", "M60 80 L48 118", "M60 80 L74 116"]
    : pose === "strike"
      ? ["M67 41 L54 78", "M64 52 L108 47", "M64 55 L44 67", "M54 78 L30 112", "M54 78 L80 118"]
      : ["M47 44 L62 80", "M50 54 L32 38", "M52 56 L72 40", "M62 80 L50 118", "M62 80 L82 112"];
  return (
    <svg
      viewBox="0 0 120 140"
      className={small ? "h-[62px] w-[54px] sm:h-[74px] sm:w-16" : "h-auto w-full"}
      fill="none"
      aria-hidden="true"
    >
      <circle cx={pose === "hit" ? 44 : pose === "strike" ? 68 : 60} cy={pose === "hit" ? 30 : pose === "strike" ? 26 : 22} r="15" fill={color} />
      <g stroke={color} strokeWidth="13" strokeLinecap="round">
        {paths.map((path) => <path d={path} key={path} />)}
      </g>
    </svg>
  );
}
