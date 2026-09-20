import { describe, expect, it } from "vitest";
import { POOL, type ContentPool } from "@typefeud/content";
import { DEFAULT_TUNING, type Line, type ReplaySetup } from "@typefeud/game";
import { GHOST_SNAPSHOT_INTERVAL_MS, GHOST_TRACES, buildGhostSchedule, ghostSeed } from "../src/match/ghost";
import { advanceSession, createSession, replaySession } from "../src/match/session";

const options: [Line, Line, Line] = [
  { id: "a-jab", tier: "jab", text: "Wet cardboard.", wordCount: 2 },
  { id: "b-combo", tier: "combo", text: "That take has the structural integrity of wet cardboard.", wordCount: 9 },
  {
    id: "c-haymaker",
    tier: "haymaker",
    text: "You typed all of that and still said nothing at all, which is a skill.",
    wordCount: 14,
  },
];

const build = (seed: number, from = options) => buildGhostSchedule({ seed, options: from });

describe("the ghost schedule", () => {
  it("is a pure function of its seed", () => {
    expect(build(9001)).toEqual(build(9001));
    // Different jitter seeds must actually differ, or the ghost is a metronome.
    expect(JSON.stringify(build(9001))).not.toBe(JSON.stringify(build(9002)));
  });

  it("derives its seed from the deal, so each one gets a fresh ghost", () => {
    expect(ghostSeed(7, "debate", 1)).toBe(ghostSeed(7, "debate", 1));
    expect(ghostSeed(7, "debate", 1)).not.toBe(ghostSeed(7, "debate", 2));
    expect(ghostSeed(7, "debate", 1)).not.toBe(ghostSeed(7, "roast", 1));
    expect(ghostSeed(8, "debate", 1)).not.toBe(ghostSeed(7, "debate", 1));
  });

  it("only ever commits to a line it was offered", () => {
    for (let seed = 0; seed < 200; seed++) {
      const schedule = build(seed);
      expect(options).toContain(schedule.line);
      expect(schedule.events.every((event) => event.progress.lineId === schedule.line.id)).toBe(true);
      expect(GHOST_TRACES).toContain(schedule.trace);
    }
  });

  it("finishes the line it started, in order, without ever running past its end", () => {
    for (let seed = 0; seed < 200; seed++) {
      const { line, events } = build(seed);
      expect(events.at(-1)?.progress.charIndex).toBe(line.text.length);
      for (const [i, event] of events.entries()) {
        expect(event.progress.charIndex).toBeLessThanOrEqual(line.text.length);
        expect(event.progress.errors).toBeLessThanOrEqual(event.progress.charIndex);
        if (i > 0) expect(event.dueAt).toBeGreaterThanOrEqual(events[i - 1]!.dueAt);
      }
    }
  });

  it("never reports twice inside one 10Hz window", () => {
    // At a human 60-75 WPM a keystroke is ~200ms, so this rarely compresses —
    // the cap is what matters, not the count. It is the property that keeps
    // the UI honest: nothing downstream can come to depend on finer detail
    // than a live opponent will ever send (SPEC §4.3).
    for (let seed = 0; seed < 60; seed++) {
      const { events } = build(seed);
      const windows = events.slice(0, -1).map((event) => Math.floor(event.dueAt / GHOST_SNAPSHOT_INTERVAL_MS));
      expect(new Set(windows).size).toBe(windows.length);
    }
  });

  it("compresses a burst that outruns the window", () => {
    // A 300 WPM trace types faster than it can report, which is exactly the
    // case where snapshots must lose detail rather than queue up.
    const fast = { ...GHOST_TRACES[0]!, wpm: 300, errorRate: 0, repairRate: 0 };
    const { events } = buildGhostSchedule({ seed: 5, options, traces: [fast] });
    const line = options.find((option) => option.id === events[0]!.progress.lineId)!;
    expect(events.length).toBeLessThan(line.text.length);
  });

  it("types at roughly the pace its trace was authored at", () => {
    for (let seed = 0; seed < 60; seed++) {
      const { line, trace, events } = build(seed);
      const minutes = events.at(-1)!.dueAt / 60_000;
      const observed = line.text.length / 5 / minutes;
      // Jitter and repairs move it; a different order of magnitude is a bug.
      expect(observed).toBeGreaterThan(trace.wpm * 0.55);
      expect(observed).toBeLessThan(trace.wpm * 1.35);
    }
  });

  it("leaves some errors standing and repairs others", () => {
    const finals = Array.from({ length: 300 }, (_v, seed) => build(seed).events.at(-1)!.progress.errors);
    expect(finals.some((errors) => errors > 0)).toBe(true);
    expect(finals.some((errors) => errors === 0)).toBe(true);
  });
});

const tuning = { ...DEFAULT_TUNING, speedMultMin: 1, speedMultMax: 1 };
const pool: ContentPool = (["trigger", "debate", "roast", "fight"] as const).flatMap((round) =>
  (["jab", "combo", "haymaker"] as const).flatMap((tier, t) =>
    Array.from({ length: 8 }, (_, i) => ({
      id: `test-${round}-${tier}-${String(i).padStart(3, "0")}`,
      arena: "test",
      round,
      tier,
      text: `${"ABC"[t]} line ${i}`,
      wordCount: 3,
      tags: [],
    })),
  ),
);
const setup: ReplaySetup = {
  sessionId: "ghost-session",
  seed: 20_260_907,
  arena: "test",
  firstRound: "debate",
  tuning,
  recent: [[], []],
};

/**
 * The browser hook without the browser: build a schedule for the ghost's
 * current deal, feed every snapshot in at its due time, and deal it again once
 * the impact beat has passed. Everything `use-match.ts` does, minus setTimeout.
 */
function playGhost(rounds = 4) {
  let state = createSession(setup, pool);
  let now = 0;
  const at = (t: number) => (now = Math.max(now, t));
  state = advanceSession(state, { type: "arena.done" }, at(3_000), pool);

  for (let played = 0; played < rounds && state.match.phase !== "results"; played++) {
    const started = state.match.roundStartedAt ?? now;
    let guard = 0;
    while (state.match.phase === "round" && state.match.round.status === "live" && guard++ < 200) {
      const generation = state.match.generation[1];
      const { events } = buildGhostSchedule({
        seed: ghostSeed(setup.seed, state.match.round.round, generation),
        options: state.match.round.players[1].options,
      });
      for (const event of events) {
        state = advanceSession(
          state,
          {
            type: "input",
            input: { type: "progress", slot: 1, ...event.progress },
          },
          at(started + event.dueAt),
          pool,
        );
      }
      if (state.match.round.status !== "live") break;
      state = advanceSession(state, { type: "deal", slot: 1 }, at(now + tuning.impactBeatMs), pool);
      // A refused deal would spin this loop forever; assert it went through.
      expect(state.match.generation[1]).toBe(generation + 1);
    }
    // Either the deadline closes the round or a knockout already has.
    if (state.match.round.status === "live") {
      state = advanceSession(
        state,
        { type: "input", input: { type: "clock" } },
        at(started + state.match.round.endsAt),
        pool,
      );
    }
    state = advanceSession(state, { type: "round.end" }, at(now + 1), pool);
    if (state.match.phase === "intermission") {
      state = advanceSession(state, { type: "intermission.done" }, at(now + 10_000), pool);
    }
  }
  return state;
}

describe("a full match against the ghost", () => {
  it("lands real damage across every round and reaches a result", () => {
    const state = playGhost();
    expect(state.match.phase).toBe("results");
    // The player never typed: an unanswered ghost has to win, which is the
    // whole point of #7 — before it, a silent player drew every round.
    expect(state.match.outcome?.winner).toBe(1);
    expect(state.match.results.map((result) => result.round)).toEqual(["debate", "roast", "fight"]);
    expect(state.match.results.every((result) => result.hp[0] < result.hp[1])).toBe(true);
  });

  it("lands more than one line per round, so the beat keeps dealing", () => {
    const state = playGhost();
    // Generation counts the deals; the round opens at one.
    expect(state.match.generation[1]).toBeGreaterThan(3);
  });

  it("replays identically from the recorded snapshots alone", () => {
    const state = playGhost();
    const replayed = replaySession(state.trace);
    expect(replayed.match).toEqual(state.match);
    expect(replayed.resolved).toEqual(state.resolved);
    expect(replayed.cursors).toEqual(state.cursors);
  });

  it("is reproducible: the same seed plays the same match", () => {
    expect(playGhost().match).toEqual(playGhost().match);
  });
});

describe("the committed pool", () => {
  it("can be typed by the ghost as it stands", () => {
    const real = createSession({ ...setup, arena: "group_chat" }, POOL);
    const schedule = buildGhostSchedule({
      seed: ghostSeed(setup.seed, "debate", 0),
      options: real.match.round.players[1].options,
    });
    expect(schedule.events.at(-1)?.progress.charIndex).toBe(schedule.line.text.length);
  });
});
