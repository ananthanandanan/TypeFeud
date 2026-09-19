import { describe, expect, it } from "vitest";
import { TAUNTS } from "@typefeud/content";
import { applyTauntKey, emptyTauntProgress } from "../src/match/taunt";

describe("taunt typing", () => {
  it("locks by first character case-insensitively and applies the actual key", () => {
    const result = applyTauntKey(TAUNTS, emptyTauntProgress(), "b");
    expect(result.progress.selected).toBe(0);
    expect(result.progress.typed).toEqual(["b"]);
    expect(result.progress.wrongIndices).toEqual([0]);
  });

  it("advances through errors and lets backspace repair them", () => {
    let progress = applyTauntKey(TAUNTS, emptyTauntProgress(), "B").progress;
    progress = applyTauntKey(TAUNTS, progress, "x").progress;
    expect(progress.wrongIndices).toEqual([1]);
    progress = applyTauntKey(TAUNTS, progress, "\b").progress;
    expect(progress.typed).toEqual(["B"]);
    expect(progress.wrongIndices).toEqual([]);
  });

  it("sends exactly when the selected canned line is complete", () => {
    const option = TAUNTS[1]!;
    let progress = emptyTauntProgress();
    let sent = null;
    for (const key of option.text) ({ progress, sent } = applyTauntKey(TAUNTS, progress, key));
    expect(sent).toEqual(option);
    const after = applyTauntKey(TAUNTS, progress, "x");
    expect(after.progress).toBe(progress);
    expect(after.sent).toBeNull();
  });

  it("ignores keys that cannot select an offered taunt", () => {
    const progress = emptyTauntProgress();
    expect(applyTauntKey(TAUNTS, progress, "?").progress).toBe(progress);
  });
});
