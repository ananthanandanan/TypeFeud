"use client";

/**
 * Milestone 1's whole exit criterion: one line, typed, in the browser.
 *
 * Everything here that looks like match flow is scaffolding for the real thing
 * — the three-line choice (T-04), damage resolution (T-03) and the round clock
 * (T-05) land later. What has to be right *now* is how a keystroke feels.
 */

import { linesForRound, POOL, type ContentLine } from "@typefeud/content";
import {
  applyKeystroke,
  BACKSPACE,
  computeDamage,
  createLineProgress,
  ROUND_DURATION_MS,
  uncorrectedErrors,
  wpm,
  type Line,
  type PlayerState,
  type RoundState,
} from "@typefeud/game";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DevFlags } from "@/dev/flags";
import { TuningPanel, useTuning } from "@/dev/tuning";
import { TypingSurface } from "@/components/typing-surface";

const toLine = (line: ContentLine): Line => ({
  id: line.id,
  tier: line.tier,
  text: line.text,
  wordCount: line.wordCount,
});

/**
 * Only the Group Chat debate pool is authored so far (T-11 writes the rest), so
 * a round with no lines yet falls back rather than showing an empty stage.
 */
function candidates(flags: DevFlags): Line[] {
  const forRound = linesForRound(flags.round);
  const pools = [
    forRound.filter((line) => line.tier === flags.tier),
    forRound,
    POOL.filter((line) => line.tier === flags.tier),
    POOL,
  ];
  return (pools.find((pool) => pool.length > 0) ?? []).map(toLine);
}

function player(slot: 0 | 1, options: [Line, Line, Line], lineId: string): PlayerState {
  return {
    slot,
    hp: 100,
    options,
    progress: createLineProgress(lineId),
    momentum: 0,
    specialArmed: false,
    seenLineIds: [],
  };
}

function newRound(flags: DevFlags, line: Line): RoundState {
  const options: [Line, Line, Line] = [line, line, line];
  return {
    round: flags.round,
    endsAt: ROUND_DURATION_MS[flags.round],
    players: [player(0, options, line.id), player(1, options, line.id)],
    rngCursor: 0,
  };
}

export function TypingStage({ flags }: { flags: DevFlags }) {
  const lines = useMemo(() => candidates(flags), [flags]);
  const [run, setRun] = useState({ index: 0, attempt: 0 });
  const line = lines[run.index % lines.length]!;

  const next = useCallback(() => setRun((r) => ({ index: r.index + 1, attempt: 0 })), []);
  const restart = useCallback(() => setRun((r) => ({ ...r, attempt: r.attempt + 1 })), []);

  // Remounting on the key is the reset: a fresh line is a fresh RoundState and
  // a fresh clock, with no effect reaching in to clear the old one.
  return (
    <LineRun
      key={`${line.id}-${run.attempt}`}
      flags={flags}
      line={line}
      onNext={next}
      onRestart={restart}
    />
  );
}

function LineRun({
  flags,
  line,
  onNext,
  onRestart,
}: {
  flags: DevFlags;
  line: Line;
  onNext: () => void;
  onRestart: () => void;
}) {
  const [state, setState] = useState<RoundState>(() => newRound(flags, line));
  const [lastKeyAt, setLastKeyAt] = useState(0);
  const [now, setNow] = useState(0);
  // Set on the first keystroke rather than at mount: it is only ever a base for
  // differences, and reading the clock during render is not allowed.
  const roundStart = useRef<number | null>(null);

  const { tuning } = useTuning();
  const progress = state.players[0].progress!;
  const complete = progress.charIndex >= line.text.length;

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.target instanceof HTMLElement && ev.target.matches("input, textarea")) return;

      if (ev.key === "Enter" || ev.key === "Escape") {
        ev.preventDefault();
        if (ev.key === "Enter") onNext();
        else onRestart();
        return;
      }

      const key = ev.key === "Backspace" ? BACKSPACE : ev.key;
      if (key !== BACKSPACE && key.length !== 1) return;
      ev.preventDefault();

      roundStart.current ??= performance.now();
      const t = performance.now() - roundStart.current;
      setLastKeyAt(t);
      setState((current) => applyKeystroke(current, { t, key }));
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onRestart]);

  // The live WPM readout has to move between keystrokes too — 10Hz is the same
  // rate progress goes on the wire (SPEC §4.3), and is plenty for a number.
  useEffect(() => {
    const base = roundStart.current;
    if (base === null || progress.startedAt === null || complete) return;
    const id = window.setInterval(() => setNow(performance.now() - base), 100);
    return () => window.clearInterval(id);
  }, [progress.startedAt, complete]);

  const elapsed =
    progress.startedAt === null
      ? 0
      : Math.max(complete ? lastKeyAt : now, lastKeyAt) - progress.startedAt;
  const started = progress.startedAt !== null;
  const errors = uncorrectedErrors(progress);
  const lineWpm = wpm(progress.charIndex, elapsed);
  const { damage, selfDamage } = computeDamage(
    { tier: line.tier, uncorrectedErrors: errors, lineWpm, special: false },
    tuning,
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-7 p-10">
      <TuningPanel />

      <header className="flex items-baseline justify-between">
        <span className="text-muted text-xs tracking-[0.3em] uppercase">
          Round · {state.round} · {line.tier}
        </span>
        <span className="text-muted text-xs tracking-[0.24em] uppercase">{line.id}</span>
      </header>

      <TypingSurface text={line.text} progress={progress} />

      <div className="grid grid-cols-4 gap-5">
        <Stat label="WPM" value={started ? Math.round(lineWpm) : "—"} tone="you" />
        <Stat label="Errors" value={errors} tone={errors > 0 ? "error" : "muted"} />
        {/* A readout, not a resolution — resolveLine and HP land in T-03. */}
        <Stat
          label="Damage"
          value={started ? damage.toFixed(1) : "—"}
          tone={complete ? "momentum" : "muted"}
        />
        <Stat label="Self" value={selfDamage} tone={selfDamage > 0 ? "error" : "muted"} />
      </div>

      <footer className="text-muted flex items-baseline justify-between text-xs">
        <span>
          {complete ? "line clear · enter for the next one" : "type it · backspace repairs"}
        </span>
        <span className="tracking-[0.18em]">
          {flags.bot ? "BOT · pending T-07 · " : ""}
          {"` TUNING · ENTER NEXT · ESC RESTART"}
        </span>
      </footer>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "you" | "error" | "momentum" | "muted";
}) {
  const color = {
    you: "text-you",
    error: "text-error",
    momentum: "text-momentum",
    muted: "text-text",
  }[tone];

  return (
    <div className="border-edge-soft flex flex-col gap-1 border-t-[3px] pt-3">
      <span className="text-muted text-[11px] tracking-[0.24em] uppercase">{label}</span>
      <span className={`text-[32px] leading-none font-extrabold ${color}`}>{value}</span>
    </div>
  );
}
