"use client";

/**
 * Round 0 — the quick-draw. SPEC §2.2.
 *
 * One word, no choice, no option cards: first to type it correctly takes +5 HP
 * into the debate. The reward is deliberately small because this is a pacing
 * beat and a topic-setter, not a swing.
 *
 * The provocation that should sit above the word ("dev_p has left you on read
 * for 4 hours") is not rendered, because it has not been authored. The pool
 * holds the word and not the setup, and invariant 3 rules out inventing one at
 * runtime — #11 adds it with the rest of the arena's content.
 */

import { activeLine, type RoundState } from "@typefeud/game";
import { TypingSurface } from "@/components/typing-surface";
import { TRIGGER_WIN_HP_BONUS } from "@typefeud/game";

export function TriggerRound({ round }: { round: RoundState }) {
  const you = round.players[0];
  const progress = you.progress;
  // Every slot was dealt the same line, so this is the word either way.
  const word = activeLine(you)?.text ?? you.options[0].text;

  return (
    <div className="flex flex-col items-center gap-7 py-6">
      <p className="text-muted text-[11px] tracking-[0.24em] uppercase">
        provocation pending #11
      </p>

      {progress ? (
        <TypingSurface text={word} progress={progress} />
      ) : (
        <div className="border-edge bg-panel border-2 px-12 py-8">
          <span
            className="font-extrabold"
            style={{ fontSize: "48px", lineHeight: 1.2, letterSpacing: "0.12em" }}
          >
            {word}
          </span>
        </div>
      )}

      <p className="text-muted text-xs tracking-[0.2em] uppercase">
        first to type it takes +{TRIGGER_WIN_HP_BONUS} hp into the debate
      </p>
    </div>
  );
}
