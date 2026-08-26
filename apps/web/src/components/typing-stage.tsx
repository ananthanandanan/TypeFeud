"use client";

/**
 * Three lines, one choice, one resolution. SPEC §2.3, §2.4, §2.5, §2.6.
 *
 * Everything here that looks like match flow is still scaffolding — the
 * opponent (T-07) and the round clock (T-05) land later, and the opponent is a
 * dummy that only ever takes damage. What is real is the loop: three options
 * stand, the first matching keystroke commits you to one, finishing it lands
 * damage, and enter deals three more.
 *
 * RoundState lives here rather than in LineRun because HP, momentum and the
 * Special have to survive the deal; only the per-line clock resets, which is
 * what the remount key does.
 */

import { dealThree } from "@typefeud/content";
import {
  activeLine,
  applyKeystroke,
  BACKSPACE,
  computeDamage,
  dealOptions,
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
import { useCallback, useEffect, useRef, useState } from "react";
import type { DevFlags } from "@/dev/flags";
import { TuningPanel, useTuning } from "@/dev/tuning";
import { FighterBar } from "@/components/fighter-bar";
import { ImpactBurst } from "@/components/impact-burst";
import { OptionCards } from "@/components/option-cards";
import { TypingSurface } from "@/components/typing-surface";

/**
 * Selection is unseeded for now: `rng` is a parameter of `dealThree`, and T-06
 * (#6) replaces this argument with a seeded PRNG plus the cross-match ring
 * buffer of SPEC §3.6. Within a match, `seenLineIds` already prevents repeats.
 *
 * `rng` is also how the first render stays hydratable — see FIRST_DEAL below.
 */
const deal = (
  flags: DevFlags,
  seen: readonly string[],
  rng: () => number = Math.random,
): [Line, Line, Line] => dealThree({ round: flags.round, tier: flags.tier }, seen, rng);

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

function player(slot: 0 | 1, options: [Line, Line, Line]): PlayerState {
  return {
    slot,
    hp: 100,
    options,
    // Null until the player types: choosing the line is the first keystroke.
    progress: null,
    momentum: 0,
    specialArmed: false,
    seenLineIds: [],
  };
}

function newRound(flags: DevFlags, rng?: () => number): RoundState {
  return {
    round: flags.round,
    endsAt: ROUND_DURATION_MS[flags.round],
    players: [player(0, deal(flags, [], rng)), player(1, deal(flags, [], rng))],
    rngCursor: 0,
  };
}

export function TypingStage({ flags }: { flags: DevFlags }) {
  const [state, setState] = useState<RoundState>(() => newRound(flags, FIRST_DEAL));
  const dealtOnce = useRef(false);
  // Bumped by every deal, including a restart of the same three. It is the
  // remount key, and remounting is the per-line clock reset — no effect has to
  // reach in and clear the old one.
  const [generation, setGeneration] = useState(0);

  // The real opening deal, once the markup the server sent has been adopted.
  useEffect(() => {
    if (dealtOnce.current) return;
    dealtOnce.current = true;
    setState(newRound(flags));
  }, [flags]);

  const next = useCallback(() => {
    setState((current) =>
      dealOptions(current, 0, deal(flags, current.players[0].seenLineIds)),
    );
    setGeneration((n) => n + 1);
  }, [flags]);

  const restart = useCallback(() => {
    setState((current) => dealOptions(current, 0, current.players[0].options));
    setGeneration((n) => n + 1);
  }, []);

  return (
    <LineRun
      key={generation}
      flags={flags}
      state={state}
      setState={setState}
      onNext={next}
      onRestart={restart}
    />
  );
}

function LineRun({
  flags,
  state,
  setState,
  onNext,
  onRestart,
}: {
  flags: DevFlags;
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
  const progress = you.progress;
  // Null until the first keystroke picks one of the three (SPEC §2.3).
  const line = activeLine(you);
  const complete = line !== null && progress !== null && progress.charIndex >= line.text.length;

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
      // Before a line is locked in this is the choice; after it, a character.
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
    if (base === null || !progress?.startedAt || complete) return;
    const id = window.setInterval(() => setNow(performance.now() - base), 100);
    return () => window.clearInterval(id);
  }, [progress?.startedAt, complete]);

  const started = progress?.startedAt != null;
  const elapsed =
    progress?.startedAt == null
      ? 0
      : Math.max(complete ? lastKeyAt : now, lastKeyAt) - progress.startedAt;
  const errors = progress ? uncorrectedErrors(progress) : 0;
  const lineWpm = progress ? wpm(progress.charIndex, elapsed) : 0;
  // In flight this is a preview of what the line is worth; once it lands, the
  // resolved outcome replaces it so the readout and the burst never disagree.
  const preview = line
    ? computeDamage(
        { tier: line.tier, uncorrectedErrors: errors, lineWpm, special: you.specialArmed },
        tuning,
      )
    : null;

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
          Round · {state.round} · {line ? line.tier : "choose your line"}
        </span>
        <span className="text-muted text-xs tracking-[0.24em] uppercase">{line?.id ?? "—"}</span>
      </header>

      {/* Outside the typing panel's bounding box, always — SPEC §6.5. */}
      <ImpactBurst outcome={outcome} />

      {line && progress ? (
        <TypingSurface text={line.text} progress={progress} />
      ) : (
        <ChoosePrompt />
      )}

      <OptionCards options={you.options} lockedId={progress?.lineId ?? null} tuning={tuning} />

      <div className="grid grid-cols-4 gap-5">
        <Stat label="WPM" value={started ? Math.round(lineWpm) : "—"} tone="you" />
        <Stat label="Errors" value={errors} tone={errors > 0 ? "error" : "muted"} />
        <Stat
          label="Damage"
          value={outcome ? outcome.damage : started && preview ? preview.damage.toFixed(1) : "—"}
          tone={outcome ? "momentum" : "muted"}
        />
        <Stat
          label="Self"
          value={outcome ? outcome.selfDamage : (preview?.selfDamage ?? 0)}
          tone={preview && preview.selfDamage > 0 ? "error" : "muted"}
        />
      </div>

      <footer className="text-muted flex items-baseline justify-between text-xs">
        <span>
          {complete
            ? "line clear · enter deals three more"
            : !line
              ? "three on offer · type the first character of the one you want"
              : specialReady(you) && !you.specialArmed
                ? "meter full · tab to arm the special"
                : "type it · backspace repairs"}
        </span>
        <span className="tracking-[0.18em]">
          {flags.bot ? "BOT · pending T-07 · " : ""}
          {"` TUNING · TAB SPECIAL · ENTER DEAL · ESC RESTART"}
        </span>
      </footer>
    </main>
  );
}

/**
 * The typing surface before a line is chosen. Same panel and same metrics as
 * the real one, so committing to a line does not move the page under the
 * player — only the text inside the box changes.
 */
function ChoosePrompt() {
  return (
    <div className="border-edge bg-panel border-2 px-9 py-8">
      <p
        className="text-muted font-medium"
        style={{ fontSize: "32px", lineHeight: 1.7, letterSpacing: "0.01em" }}
      >
        pick one and start typing
      </p>
    </div>
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
