import { describe, expect, it } from "vitest";
import { POOL, type ContentPool } from "@typefeud/content";
import { DEFAULT_TUNING, type PlayerSlot, type ReplayRecord, type ReplaySetup, type RoundName } from "@typefeud/game";
import { advanceSession, createSession, replaySession, type SessionCommand, type SessionState } from "../src/match/session";
import { selectOptions } from "../src/match/selection";

const tuning = { ...DEFAULT_TUNING, speedMultMin: 1, speedMultMax: 1 };
const pool: ContentPool = (["trigger", "debate", "roast", "fight"] as const).flatMap((round) =>
  (["jab", "combo", "haymaker"] as const).flatMap((tier, t) => Array.from({ length: 8 }, (_, i) => ({
    id: `test-${round}-${tier}-${String(i).padStart(3, "0")}`,
    arena: "test", round, tier, text: `${"ABC"[t]} line ${i}`, wordCount: 3, tags: [],
  }))),
);
const setup: ReplaySetup = { sessionId: "test-session", seed: 4821, arena: "test", firstRound: "trigger", tuning, recent: [[], []] };

function runner(config = setup, source = pool) {
  let state = createSession(config, source);
  let now = 0;
  return {
    get state() { return state; },
    send(command: SessionCommand, delta = 10) {
      now += delta;
      state = advanceSession(state, command, now, source);
      return state;
    },
    type(slot: PlayerSlot, tier = 0, repair = false, mistake = false, special = false) {
      const text = state.match.round.players[slot].options[tier]!.text;
      for (let i = 0; i < text.length; i++) {
        this.send({ type: "input", input: { type: "key", slot, key: mistake && i === 1 ? "x" : text[i]! } }, 100);
        if (i === 0 && special) this.send({ type: "input", input: { type: "special", slot } });
        if (i === 0 && repair) {
          this.send({ type: "input", input: { type: "key", slot, key: "x" } }, 100);
          this.send({ type: "input", input: { type: "key", slot, key: "\b" } }, 100);
        }
      }
    },
    deadline() {
      now = state.match.roundStartedAt! + state.match.round.endsAt;
      state = advanceSession(state, { type: "input", input: { type: "clock" } }, now, source);
    },
  };
}

function logical(state: SessionState) {
  return { match: state.match, cursors: state.cursors, resolved: state.resolved, tuning: state.tuning, stats: state.stats };
}

describe("recording and replay", () => {
  it("reproduces a complete contest with repairs, mistakes, Special, carry, KO, tuning and partial timeout", () => {
    const run = runner();
    run.send({ type: "arena.done" }, 3000);
    run.type(0);
    run.send({ type: "round.end" });
    expect(run.state.match.round.round).toBe("debate");
    expect(run.state.match.results[0]?.winner).toBe(0);

    for (let i = 0; i < 4; i++) {
      run.type(0, 0, i === 0);
      run.send({ type: "deal", slot: 0 }, 320);
    }
    run.type(0, 0, false, false, true);
    expect(run.state.match.lineOutcome[0]?.specialConsumed).toBe(true);
    expect(run.state.match.lineOutcome[0]?.damage).toBe(11);
    run.type(1, 1, false, true);
    run.deadline();
    expect(run.state.match.round.players.map((player) => player.hp)).toEqual([89, 63]);
    run.send({ type: "round.end" });
    expect(run.state.match.phase).toBe("intermission");
    run.send({
      type: "taunt",
      slot: 0,
      tauntId: "groupchat-taunt-001",
      text: "Bold words for someone losing.",
    });
    expect(run.state.match.taunts[0]?.id).toBe("groupchat-taunt-001");
    const afterTaunt = run.state;
    run.send({ type: "taunt", slot: 0, tauntId: "duplicate", text: "Nope" });
    expect(run.state).toBe(afterTaunt);
    const displayed = run.state.match.round.players[0].seenLineIds;
    const pending = run.state.match.pending!.players[0].options.map((line) => line.id);
    expect(displayed.some((id) => pending.includes(id))).toBe(false);
    run.send({ type: "intermission.done" }, 10000);
    expect(run.state.match.round.players[0].seenLineIds).toEqual(expect.arrayContaining(pending));

    for (let i = 0; i < 4; i++) {
      run.type(1, 2);
      if (i !== 3) run.send({ type: "deal", slot: 1 }, 320);
    }
    expect(run.state.match.round.status).toBe("over");
    expect(run.state.match.round.players.map((player) => player.hp)).toEqual([0, 100]);
    run.send({ type: "round.end" });
    run.send({ type: "intermission.done" }, 10000);
    expect(run.state.match.round.players.map((player) => player.hp)).toEqual([115, 110]);
    run.send({ type: "tuning", tuning: { ...tuning, tierBaseDamage: { ...tuning.tierBaseDamage, haymaker: 40 } } });
    run.type(0, 2);
    run.send({ type: "input", input: { type: "key", slot: 1, key: "A" } });
    run.deadline();
    run.send({ type: "round.end" });
    expect(run.state.match.outcome?.winner).toBe(0);
    expect(run.state.match.round.players.map((player) => player.hp)).toEqual([115, 70]);
    expect(run.state.match.round.players[1].progress?.charIndex).toBe(1);
    expect(run.state.match.results.map((result) => result.winner)).toEqual([0, 0, 1, 0]);

    // JSON round-trip also proves that no closure, browser timestamp, Set or
    // hidden PRNG instance is needed to reproduce the complete logical state.
    const recording: ReplayRecord = JSON.parse(JSON.stringify(run.state.trace));
    expect(logical(replaySession(recording))).toEqual(logical(run.state));
    expect(replaySession(recording).trace).toEqual(recording);
  });

  it("uses saved line text and offers when the source pool changes", () => {
    const source = structuredClone(pool);
    const run = runner(setup, source);
    run.send({ type: "arena.done" }, 3000);
    run.type(0);
    const before = structuredClone(run.state);
    source.forEach((line) => { line.text = "changed content"; });
    expect(logical(replaySession(run.state.trace))).toEqual(logical(before));
    expect(run.state.trace.lines[0]?.text).not.toBe("changed content");
  });

  it("preserves equal-time ordering and rejects reordered or incompatible recordings", () => {
    const run = runner();
    run.send({ type: "arena.done" }, 3000);
    run.send({ type: "input", input: { type: "key", slot: 0, key: "A" } }, 0);
    run.send({ type: "input", input: { type: "key", slot: 0, key: " " } }, 0);
    expect(logical(replaySession(run.state.trace))).toEqual(logical(run.state));
    const shuffled = structuredClone(run.state.trace);
    [shuffled.events[1], shuffled.events[2]] = [shuffled.events[2]!, shuffled.events[1]!];
    expect(() => replaySession(shuffled)).toThrow("order");
    expect(() => replaySession({ ...run.state.trace, version: 2 } as unknown as ReplayRecord)).toThrow("version");
    const backwards = structuredClone(run.state.trace);
    backwards.events[1]!.at = 2999;
    expect(() => replaySession(backwards)).toThrow("time");
    expect(() => replaySession({ ...run.state.trace, lines: [] })).toThrow("missing line");
  });

  it("does not mutate earlier states, setup, or discard partial lines", () => {
    const config = structuredClone(setup);
    const before = createSession(config, pool);
    const snapshot = structuredClone(before);
    const next = advanceSession(before, { type: "arena.done" }, 3000, pool);
    const partial = advanceSession(next, { type: "input", input: { type: "key", key: "A", slot: 0 } }, 3100, pool);
    expect(logical(replaySession(partial.trace))).toEqual(logical(partial));
    expect(before).toEqual(snapshot);
    expect(config).toEqual(setup);
  });

  it("does not extend the impact beat or resolve twice when typing past a completed line", () => {
    const run = runner({ ...setup, firstRound: "debate" });
    run.send({ type: "arena.done" }, 3000);
    run.type(0);
    const at = run.state.match.lastKeyAt;
    const hp = run.state.match.round.players[1].hp;
    run.send({ type: "input", input: { type: "key", slot: 0, key: "x" } }, 100);
    expect(run.state.match.lastKeyAt).toBe(at);
    expect(run.state.match.round.players[1].hp).toBe(hp);
    run.send({ type: "deal", slot: 0 }, 320);
    expect(run.state.resolved[0]).toBe(false);
    expect(logical(replaySession(run.state.trace))).toEqual(logical(run.state));
  });

  it("closes a round before a late deal without consuming a random number", () => {
    const run = runner({ ...setup, firstRound: "debate" });
    run.send({ type: "arena.done" }, 3000);
    run.type(0);
    const before = run.state;
    const ended = advanceSession(before, { type: "deal", slot: 0 }, 50000, pool);
    expect(ended.match.round.status).toBe("over");
    expect(ended.cursors).toEqual(before.cursors);
    expect(ended.trace.lines).toEqual(before.trace.lines);
    expect(ended.trace.events.at(-1)?.action).toEqual({ type: "input", input: { type: "clock" } });
  });

  it.each(["trigger", "debate", "roast", "fight"] as RoundName[])("replays the %s round shortcut through results", (firstRound) => {
    const run = runner({ ...setup, firstRound, arena: "group_chat", tier: "haymaker" }, POOL);
    run.send({ type: "arena.done" }, 3000);
    while (run.state.match.phase !== "results") {
      run.deadline();
      run.send({ type: "round.end" });
      if (run.state.match.phase === "intermission") run.send({ type: "intermission.done" }, 10000);
    }
    expect(logical(replaySession(run.state.trace))).toEqual(logical(run.state));
    expect(run.state.match.outcome?.winner).toBeNull();
  });
});

describe("session selection", () => {
  it("marks every initial option as seen and uses the injected history", () => {
    const before = createSession({ ...setup, firstRound: "debate" }, pool);
    const ids = before.match.round.players[0].options.map((line) => line.id);
    expect(before.match.round.players[0].seenLineIds).toEqual(ids);
    const next = createSession({ ...setup, firstRound: "debate", recent: [ids, []] }, pool);
    expect(next.match.round.players[0].options.every((line) => !ids.includes(line.id))).toBe(true);
  });

  it("reproduces choices for identical inputs and isolates the two player streams", () => {
    const first = createSession({ ...setup, firstRound: "debate" }, pool);
    expect(createSession({ ...setup, firstRound: "debate" }, pool)).toEqual(first);
    const baseline = selectOptions(setup, first.cursors, "debate", 1, [], pool);
    const local = selectOptions(setup, first.cursors, "debate", 0, [], pool);
    const afterLocal = selectOptions(setup, [local.deal.randomState, first.cursors[1]], "debate", 1, [], pool);
    expect(afterLocal).toEqual(baseline);
    const laterRound = selectOptions(setup, [local.deal.randomState, first.cursors[1]], "roast", 0, [], pool);
    expect(laterRound.deal.randomState).not.toBe(local.deal.randomState);
  });

  it("does not consume seed state for stale phase transitions or premature deals", () => {
    const state = createSession(setup, pool);
    expect(advanceSession(state, { type: "round.end" }, 0, pool)).toBe(state);
    expect(advanceSession(state, { type: "deal", slot: 0 }, 0, pool)).toBe(state);
    const started = advanceSession(state, { type: "arena.done" }, 3000, pool);
    expect(advanceSession(started, { type: "arena.done" }, 3000, pool)).toBe(started);
  });
});
