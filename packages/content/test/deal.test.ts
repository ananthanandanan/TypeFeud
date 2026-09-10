import { describe, expect, it } from "vitest";
import { dealThree, TIERS } from "../src/deal";
import { linesFor } from "../src/pool";

/** A fixed `rng` makes a deal reproducible — which is the whole point of the parameter. */
const fixed =
  (...values: number[]) =>
  () =>
    values.length > 1 ? values.shift()! : values[0]!;

const firstChar = (text: string) => text[0]!.toLowerCase();

describe("dealThree", () => {
  it("deals one line of each tier", () => {
    const dealt = dealThree({ round: "debate" }, [], fixed(0));
    expect(dealt.map((line) => line.tier)).toEqual([...TIERS]);
  });

  it("is deterministic for a given rng", () => {
    const a = dealThree({ round: "debate" }, [], fixed(0));
    const b = dealThree({ round: "debate" }, [], fixed(0));
    expect(a.map((line) => line.id)).toEqual(b.map((line) => line.id));
  });

  it("prefers three distinct first characters", () => {
    // The debate pool is full of lines starting with "Y"; picking naively from
    // each tier collides. SPEC §2.3 — lock-in has to be unambiguous.
    const chars = dealThree({ round: "debate" }, [], fixed(0)).map((line) =>
      firstChar(line.text),
    );
    expect(new Set(chars).size).toBe(3);
  });

  it("prefers unseen alternatives while keeping all three choices selectable", () => {
    const first = dealThree({ round: "debate" }, [], fixed(0));
    const again = dealThree(
      { round: "debate" },
      first.map((line) => line.id),
      fixed(0),
    );
    expect(again.filter((line) => !first.some((previous) => previous.id === line.id))).toHaveLength(2);
    expect(new Set(again.map((line) => firstChar(line.text))).size).toBe(3);
  });

  it("repeats rather than dealing an empty slot when a tier runs dry", () => {
    const everything = linesFor().map((line) => line.id);
    const dealt = dealThree({ round: "debate" }, everything, fixed(0));
    expect(dealt).toHaveLength(3);
    expect(dealt.every((line) => everything.includes(line.id))).toBe(true);
  });

  it("falls back to another round when this one has no lines authored", () => {
    // Only the group chat debate is written so far (T-11 writes the rest).
    const dealt = dealThree({ round: "fight" }, [], fixed(0));
    expect(dealt.map((line) => line.tier)).toEqual([...TIERS]);
  });

  it("deals all three slots from one tier under the ?tier dev override", () => {
    const dealt = dealThree({ round: "debate", tier: "haymaker" }, [], fixed(0));
    expect(dealt.every((line) => line.tier === "haymaker")).toBe(true);
  });

  it("never runs off the end of a pool on rng() === 1", () => {
    const dealt = dealThree({ round: "debate" }, [], fixed(1));
    expect(dealt.every((line) => line.id.length > 0)).toBe(true);
  });
});

describe("dealThree — first-character collisions", () => {
  it("keeps the small live pool selectable when every displayed option counts as seen", () => {
    for (const draw of [0, 0.3, 0.7, 1]) {
      const seen: string[] = [];
      for (let i = 0; i < 8; i++) {
        const dealt = dealThree({ round: "debate" }, seen, () => draw);
        expect(new Set(dealt.map((line) => firstChar(line.text))).size).toBe(3);
        seen.push(...dealt.map((line) => line.id));
      }
    }
  });

  it("fills the most-constrained tier first", () => {
    // Second deal of a match: the haymaker that does not start with "Y" has
    // already been served, so the only one left collides with both the jab and
    // the combo unless it picks before they do.
    const chars = dealThree({ round: "debate" }, ["groupchat-debate-haymaker-001"], fixed(0)).map(
      (line) => firstChar(line.text),
    );
    expect(new Set(chars).size).toBe(3);
  });

  it("holds for every deal of a match played out", () => {
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const dealt = dealThree({ round: "debate" }, seen, () => 0.5);
      expect(new Set(dealt.map((line) => firstChar(line.text))).size).toBe(3);
      seen.push(dealt[2].id);
    }
  });
});
