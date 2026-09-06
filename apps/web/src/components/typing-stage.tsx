"use client";

/**
 * One round's playing surface. SPEC §2.3, §2.4, §2.5, §2.6.
 *
 * Three options stand, the first matching keystroke commits you to one, and
 * finishing it lands damage. What it no longer owns is the match around it:
 * `useMatch` holds the state, the clock and the keyboard, and the next three
 * lines arrive on the impact beat rather than on the enter key (#5). This file
 * renders what it is handed and computes only what it draws.
 *
 * It is remounted on every deal — `generation` is the key — which is what
 * resets the per-line WPM clock without an effect having to clear the old one.
 */

import {
  activeLine,
  computeDamage,
  isLineComplete,
  specialReady,
  uncorrectedErrors,
  wpm,
  type LineOutcome,
  type RoundState,
} from "@typefeud/game";
import { useEffect, useState } from "react";
import type { DevFlags } from "@/dev/flags";
import { useTuning } from "@/dev/tuning";
import { ImpactBurst } from "@/components/impact-burst";
import { OptionCards } from "@/components/option-cards";
import { TypingSurface } from "@/components/typing-surface";

export function TypingStage({
  round,
  outcome,
  lastKeyAt,
  flags,
}: {
  round: RoundState;
  outcome: LineOutcome | null;
  lastKeyAt: number;
  flags: DevFlags;
}) {
  const { tuning } = useTuning();
  const [now, setNow] = useState(0);

  const you = round.players[0];
  const progress = you.progress;
  // Null until the first keystroke picks one of the three (SPEC §2.3).
  const line = activeLine(you);
  const complete = line !== null && progress !== null && isLineComplete(line.text, progress);

  // The live WPM readout has to move between keystrokes too — 10Hz is the same
  // rate progress goes on the wire (SPEC §4.3), and is plenty for a number.
  useEffect(() => {
    if (progress?.startedAt == null || complete) return;
    const started = performance.now() - lastKeyAt;
    const id = window.setInterval(() => setNow(performance.now() - started), 100);
    return () => window.clearInterval(id);
    // `lastKeyAt` is deliberately not a dependency: it moves on every keystroke
    // and would rebuild the interval each time. Re-basing once per line is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="flex flex-col gap-7">
      <header className="flex items-baseline justify-between">
        <span className="text-muted text-xs tracking-[0.3em] uppercase">
          {line ? line.tier : "choose your line"}
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
            ? "line clear · three more incoming"
            : !line
              ? "three on offer · type the first character of the one you want"
              : specialReady(you) && !you.specialArmed
                ? "meter full · tab to arm the special"
                : "type it · backspace repairs"}
        </span>
        <span className="tracking-[0.18em]">
          {flags.bot ? "BOT · pending #7 · " : ""}
          {"` TUNING · TAB SPECIAL"}
        </span>
      </footer>
    </div>
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
