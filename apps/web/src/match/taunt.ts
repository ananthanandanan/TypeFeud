import { BACKSPACE } from "@typefeud/game";
import type { Taunt } from "@typefeud/content";

export interface TauntProgress {
  selected: number | null;
  typed: string[];
  wrongIndices: number[];
}

export interface TauntInputResult {
  progress: TauntProgress;
  sent: Taunt | null;
}

export const emptyTauntProgress = (): TauntProgress => ({
  selected: null,
  typed: [],
  wrongIndices: [],
});

/** Three-line lock-in without damage: errors advance, and backspace repairs. */
export function applyTauntKey(options: readonly Taunt[], progress: TauntProgress, key: string): TauntInputResult {
  if (key === BACKSPACE) {
    if (progress.selected === null || progress.typed.length === 0) return { progress, sent: null };
    const index = progress.typed.length - 1;
    return {
      progress: {
        ...progress,
        typed: progress.typed.slice(0, index),
        wrongIndices: progress.wrongIndices.filter((wrong) => wrong !== index),
      },
      sent: null,
    };
  }
  if (key.length !== 1) return { progress, sent: null };

  const selected =
    progress.selected ?? options.findIndex((taunt) => taunt.text[0]?.toLowerCase() === key.toLowerCase());
  const option = options[selected];
  if (selected < 0 || !option || progress.typed.length >= option.text.length) {
    return { progress, sent: null };
  }

  const index = progress.typed.length;
  const next: TauntProgress = {
    selected,
    typed: [...progress.typed, key],
    wrongIndices: key === option.text[index] ? progress.wrongIndices : [...progress.wrongIndices, index],
  };
  return { progress: next, sent: next.typed.length === option.text.length ? option : null };
}
