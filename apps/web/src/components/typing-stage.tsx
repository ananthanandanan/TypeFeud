"use client";

/**
 * One line, typed, resolved. SPEC §2.4, §2.5, §2.6.
 *
 * Everything here that looks like match flow is still scaffolding — the
 * three-line choice (T-04), the opponent (T-07) and the round clock (T-05) land
 * later, and the opponent is a dummy that only ever takes damage. What is real
 * is the loop: type a line, finish it, watch the number land on HP and the
 * momentum meter charge or empty.
 *
 * RoundState lives here rather than in LineRun because HP, momentum and the
 * Special have to survive the transition to the next line; only the per-line
 * clock resets, which is what the remount key does.
 */

import { linesForRound, POOL, type ContentLine } from "@typefeud/content";
import {
  applyKeystroke,
  BACKSPACE,
  computeDamage,
  createLineProgress,
  resolveLine,
  ROUND_DURATION_MS,
  specialReady,
  triggerSpecial,
  uncorrectedErrors,
  wpm,
  type Line,
  type LineOutcome,
  type PlayerState,
  type RoundState,
} from "@typefeud/game";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DevFlags } from "@/dev/flags";
import { TuningPanel, useTuning } from "@/dev/tuning";
import { FighterBar } from "@/components/fighter-bar";
import { ImpactBurst } from "@/components/impact-burst";
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

function player(slot: 0 | 1, line: Line): PlayerState {
  return {
    slot,
    hp: 100,
    // All three options are the same line until the choice lands in T-04.
    options: [line, line, line],
    progress: createLineProgress(line.id),
    momentum: 0,
    specialArmed: false,
    seenLineIds: [],
  };
}

function newRound(flags: DevFlags, line: Line): RoundState {
  return {
    round: flags.round,
    endsAt: ROUND_DURATION_MS[flags.round],
    players: [player(0, line), player(1, line)],
    rngCursor: 0,
  };
}

/** Put a fresh line in front of the player, carrying HP, momentum and the Special. */
function withLine(state: RoundState, line: Line): RoundState {
  const [you, opponent] = state.players;
  return {
    ...state,
    players: [
      { ...you, options: [line, line, line], progress: createLineProgress(line.id) },
      opponent,
    ],
  };
}

export function TypingStage({ flags }: { flags: DevFlags }) {
  const lines = useMemo(() => candidates(flags), [flags]);
  const [run, setRun] = useState({ index: 0, attempt: 0 });
  const [state, setState] = useState<RoundState>(() => newRound(flags, lines[0]!));
  const line = lines[run.index % lines.length]!;

  const next = useCallback(() => {
    const index = run.index + 1;
    setRun({ index, attempt: 0 });
    setState((current) => withLine(current, lines[index % lines.length]!));
  }, [run.index, lines]);

  const restart = useCallback(() => {
    setRun((r) => ({ ...r, attempt: r.attempt + 1 }));
    setState((current) => withLine(current, line));
  }, [line]);

  // Remounting on the key is the clock reset: a fresh line is a fresh timer,
  // with no effect reaching in to clear the old one. The round itself persists.
  return (
    <LineRun
      key={`${line.id}-${run.attempt}`}
      flags={flags}
      line={line}
      state={state}
      setState={setState}
      onNext={next}
      onRestart={restart}
    />
  );
}

function LineRun({
  flags,
  line,
  state,
  setState,
  onNext,
  onRestart,
}: {
  flags: DevFlags;
  line: Line;
  state: RoundState;
  setState: React.Dispatch<React.SetStateAction<RoundState>>;
  onNext: () => void;
  onRestart: () => void;
}) {
  const [lastKeyAt, setLastKeyAt] = useState(0);
  const [now, setNow] = useState(0);
  const [outcome, setOutcome] = useState<LineOutcome | null>(null);
  // Set on the first keystroke rather than at mount: it is only ever a base for
  // differences, and reading the clock during render is not allowed.
  const roundStart = useRef<number | null>(null);
  // resolveLine leaves the finished line standing, so nothing in the state says
  // "already resolved" — this is what keeps one line from being charged twice.
  const resolved = useRef(false);

  const { tuning } = useTuning();
  const [you, opponent] = state.players;
  const progress = you.progress!;
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

      // Tab spends a full meter (SPEC §2.6 — the player triggers the Special).
      // triggerSpecial is a no-op below four charges, so there is nothing to guard.
      if (ev.key === "Tab") {
        ev.preventDefault();
        setState((current) => triggerSpecial(current, 0, tuning));
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
  }, [onNext, onRestart, setState, tuning]);

  // Resolution fires once, on the keystroke that finishes the line — not per
  // keystroke, which SPEC §6.3 rules out as noise at speed.
  useEffect(() => {
    if (!complete || resolved.current) return;
    resolved.current = true;
    const { state: after, outcome: landed } = resolveLine(state, { now: lastKeyAt }, tuning);
    setState(after);
    setOutcome(landed);
  }, [complete, state, setState, lastKeyAt, tuning]);

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
  // In flight this is a preview of what the line is worth; once it lands, the
  // resolved outcome replaces it so the readout and the burst never disagree.
  const preview = computeDamage(
    { tier: line.tier, uncorrectedErrors: errors, lineWpm, special: you.specialArmed },
    tuning,
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-7 p-10">
      <TuningPanel />

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-10">
        <FighterBar
          name="YOU"
          hp={you.hp}
          momentum={you.momentum}
          specialArmed={you.specialArmed}
          side="you"
        />
        <FighterBar
          name={flags.bot ? "GHOST" : "OPPONENT"}
          hp={opponent.hp}
          momentum={opponent.momentum}
          specialArmed={opponent.specialArmed}
          side="opponent"
        />
      </div>

      <header className="flex items-baseline justify-between">
        <span className="text-muted text-xs tracking-[0.3em] uppercase">
          Round · {state.round} · {line.tier}
        </span>
        <span className="text-muted text-xs tracking-[0.24em] uppercase">{line.id}</span>
      </header>

      {/* Outside the typing panel's bounding box, always — SPEC §6.5. */}
      <ImpactBurst outcome={outcome} />

      <TypingSurface text={line.text} progress={progress} />

      <div className="grid grid-cols-4 gap-5">
        <Stat label="WPM" value={started ? Math.round(lineWpm) : "—"} tone="you" />
        <Stat label="Errors" value={errors} tone={errors > 0 ? "error" : "muted"} />
        <Stat
          label="Damage"
          value={outcome ? outcome.damage : started ? preview.damage.toFixed(1) : "—"}
          tone={outcome ? "momentum" : "muted"}
        />
        <Stat
          label="Self"
          value={outcome ? outcome.selfDamage : preview.selfDamage}
          tone={preview.selfDamage > 0 ? "error" : "muted"}
        />
      </div>

      <footer className="text-muted flex items-baseline justify-between text-xs">
        <span>
          {complete
            ? "line clear · enter for the next one"
            : specialReady(you) && !you.specialArmed
              ? "meter full · tab to arm the special"
              : "type it · backspace repairs"}
        </span>
        <span className="tracking-[0.18em]">
          {flags.bot ? "BOT · pending T-07 · " : ""}
          {"` TUNING · TAB SPECIAL · ENTER NEXT · ESC RESTART"}
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
