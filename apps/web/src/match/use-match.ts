"use client";

/** Browser boundary: clocks, keyboard, seed creation and recent-line storage.
 * Match decisions run through the same pure session reducer used by replay.
 * Timers are one-shot: phase boundaries, round deadline and the impact beat.
 */
import {
  ARENA_REVEAL_MS, BACKSPACE,
  type PlayerSlot, type ReplaySetup, type RoundName,
} from "@typefeud/game";
import { useEffect, useReducer, useRef } from "react";
import type { DevFlags } from "@/dev/flags";
import { useTuning } from "@/dev/tuning";
import { buildGhostSchedule, ghostSeed } from "./ghost";
import { createHistoryStore, recentLineIds } from "./history";
import { intermissionMs, type MatchState } from "./machine";
import { advanceSession, createSession, type SessionCommand, type SessionState } from "./session";

/** Who a round-scoped timer was armed for, and against which deal. */
interface DealGuard {
  slot: PlayerSlot;
  generation: number;
}

interface BrowserSession {
  session: SessionState;
  /** performance.now() at initialization; recordings use relative time only. */
  origin: number;
}

type BrowserAction =
  | { type: "initialize"; setup: ReplaySetup; now: number }
  | { type: "command"; command: SessionCommand; now: number; round?: RoundName; guard?: DealGuard };

function browserReducer(state: BrowserSession | null, action: BrowserAction): BrowserSession | null {
  if (action.type === "initialize") {
    return state ?? { session: createSession(action.setup), origin: action.now };
  }
  if (!state || (action.round && action.round !== state.session.match.round.round) ||
    (action.guard && action.guard.generation !== state.session.match.generation[action.guard.slot])) {
    return state;
  }
  const at = Math.max(action.now - state.origin, state.session.trace.events.at(-1)?.at ?? 0);
  const session = advanceSession(state.session, action.command, at);
  return session === state.session ? state : { ...state, session };
}

export function useMatch(flags: DevFlags): MatchState | null {
  const { tuning } = useTuning();
  const [browser, dispatch] = useReducer(browserReducer, null);
  const initialized = useRef(false);
  const history = useRef<ReturnType<typeof createHistoryStore> | null>(null);
  const session = browser?.session;
  const match = session?.match;
  const phase = match?.phase;
  const roundName = match?.round.round;
  const status = match?.round.status;
  const endsAt = match?.round.endsAt;
  const startedAt = match?.roundStartedAt;
  const origin = browser?.origin;
  // Per slot, so the ghost's beat and the player's are the same code twice.
  const generation = match?.generation[0];
  const outcome = match?.lineOutcome[0];
  const lastKeyAt = match?.lastKeyAt[0];
  const ghostGeneration = match?.generation[1];
  const ghostOutcome = match?.lineOutcome[1];
  const ghostLastKeyAt = match?.lastKeyAt[1];
  const ghostOptions = match?.round.players[1].options;
  const seed = session?.trace.setup.seed;

  // Both SSR and first client render show only the existing arena reveal.
  // Storage never changes an already visible deal. Strict Mode initializes once.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    history.current = createHistoryStore(() => window.localStorage);
    dispatch({
      type: "initialize", now: performance.now(),
      setup: {
        sessionId: crypto.randomUUID(),
        seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
        arena: "group_chat", firstRound: flags.round, tier: flags.tier,
        tuning, recent: [recentLineIds(history.current.read()), []],
      },
    });
  }, [flags, tuning]);

  useEffect(() => {
    if (!session || phase === "results" || JSON.stringify(tuning) === JSON.stringify(session.tuning)) return;
    dispatch({ type: "command", command: { type: "tuning", tuning }, now: performance.now() });
  }, [tuning, session, phase]);

  useEffect(() => {
    if (phase !== "arena") return;
    const id = window.setTimeout(() => {
      dispatch({ type: "command", command: { type: "arena.done" }, now: performance.now() });
    }, ARENA_REVEAL_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "intermission" || !roundName) return;
    const id = window.setTimeout(() => {
      dispatch({ type: "command", command: { type: "intermission.done" }, round: roundName, now: performance.now() });
    }, intermissionMs(roundName));
    return () => window.clearTimeout(id);
  }, [phase, roundName]);

  // The one round-boundary timeout. Clamp an early callback to the deadline;
  // actual delayed callbacks retain their real event order in the recording.
  useEffect(() => {
    if (phase !== "round" || status !== "live" || startedAt == null || endsAt == null || origin == null) return;
    const deadline = origin + startedAt + endsAt;
    const id = window.setTimeout(() => {
      dispatch({
        type: "command", command: { type: "input", input: { type: "clock" } },
        round: roundName, now: Math.max(performance.now(), deadline),
      });
    }, Math.max(0, deadline - performance.now()));
    return () => window.clearTimeout(id);
  }, [phase, status, startedAt, endsAt, origin, roundName]);

  useEffect(() => {
    if (phase !== "round" || status !== "over") return;
    dispatch({ type: "command", command: { type: "round.end" }, round: roundName, now: performance.now() });
  }, [phase, status, roundName]);

  // The player's impact beat: the finished line stays up, then three more.
  useEffect(() => {
    if (phase !== "round" || status !== "live" || !outcome) return;
    if (startedAt == null || origin == null || lastKeyAt == null || generation == null) return;
    const due = origin + startedAt + lastKeyAt + tuning.impactBeatMs;
    const id = window.setTimeout(() => {
      dispatch({
        type: "command", command: { type: "deal", slot: 0 },
        round: roundName, guard: { slot: 0, generation }, now: performance.now(),
      });
    }, Math.max(0, due - performance.now()));
    return () => window.clearTimeout(id);
  }, [phase, status, outcome, startedAt, origin, lastKeyAt, roundName, generation, tuning.impactBeatMs]);

  // The ghost's, which is the same beat measured from its own last snapshot.
  // Without it the ghost lands one line per round and then stands there.
  useEffect(() => {
    if (!flags.bot || phase !== "round" || status !== "live" || !ghostOutcome) return;
    if (startedAt == null || origin == null || ghostLastKeyAt == null || ghostGeneration == null) return;
    const due = origin + startedAt + ghostLastKeyAt + tuning.impactBeatMs;
    const id = window.setTimeout(() => {
      dispatch({
        type: "command", command: { type: "deal", slot: 1 },
        round: roundName, guard: { slot: 1, generation: ghostGeneration }, now: performance.now(),
      });
    }, Math.max(0, due - performance.now()));
    return () => window.clearTimeout(id);
  }, [flags.bot, phase, status, ghostOutcome, startedAt, origin, ghostLastKeyAt, roundName,
    ghostGeneration, tuning.impactBeatMs]);

  /**
   * The ghost itself. One deal in, one schedule out, one timer at a time —
   * never a tick loop (invariant 8), and never more than one pending timeout.
   *
   * The schedule is rebuilt from scratch whenever the deal changes, which is
   * also what makes it correct across a round boundary: `ghostSeed` mixes the
   * round and the deal generation, so the ghost gets a fresh line and fresh
   * timing without any state surviving between them. A snapshot that lands
   * after the deal it belongs to is dropped by the guard, and one that lands
   * after the deadline is dropped by `tickRound` inside the driver.
   */
  useEffect(() => {
    if (!flags.bot || phase !== "round" || status !== "live") return;
    if (startedAt == null || origin == null || roundName == null) return;
    if (ghostGeneration == null || !ghostOptions || seed == null) return;

    const { events } = buildGhostSchedule({
      seed: ghostSeed(seed, roundName, ghostGeneration),
      options: ghostOptions,
    });

    let index = 0;
    let timer = 0;
    const arm = () => {
      const event = events[index];
      if (!event) return;
      const due = origin + startedAt + event.dueAt;
      timer = window.setTimeout(() => {
        index += 1;
        dispatch({
          type: "command",
          command: { type: "input", input: { type: "progress", slot: 1, ...event.progress } },
          round: roundName, guard: { slot: 1, generation: ghostGeneration }, now: performance.now(),
        });
        arm();
      }, Math.max(0, due - performance.now()));
    };
    arm();

    return () => window.clearTimeout(timer);
  }, [flags.bot, phase, status, roundName, startedAt, origin, ghostGeneration, ghostOptions, seed]);

  useEffect(() => {
    if (phase !== "round") return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.target instanceof HTMLElement && ev.target.matches("input, textarea")) return;
      if (ev.key === "Tab") {
        ev.preventDefault();
        dispatch({ type: "command", command: { type: "input", input: { type: "special", slot: 0 } },
          round: roundName, now: performance.now() });
        return;
      }
      const key = ev.key === "Backspace" ? BACKSPACE : ev.key;
      if (key !== BACKSPACE && key.length !== 1) return;
      ev.preventDefault();
      dispatch({ type: "command", command: { type: "input", input: { type: "key", slot: 0, key } },
        round: roundName, now: performance.now() });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, roundName]);

  useEffect(() => {
    if (session?.match.phase !== "results") return;
    history.current?.finish({
      sessionId: session.trace.setup.sessionId,
      lineIds: session.match.round.players[0].seenLineIds,
    });
  }, [session]);

  // HUD reads the browser clock; the logical state and trace stay relative.
  return match && origin !== undefined
    ? { ...match, roundStartedAt: match.roundStartedAt === null ? null : origin + match.roundStartedAt }
    : null;
}
