"use client";

/** Browser boundary: clocks, keyboard, seed creation and recent-line storage.
 * Match decisions run through the same pure session reducer used by replay.
 * Timers are one-shot: phase boundaries, round deadline and the impact beat.
 */
import { ARENA_REVEAL_MS, BACKSPACE, type ReplaySetup, type RoundName } from "@typefeud/game";
import { useEffect, useReducer, useRef } from "react";
import type { DevFlags } from "@/dev/flags";
import { useTuning } from "@/dev/tuning";
import { createHistoryStore, recentLineIds } from "./history";
import { intermissionMs, type MatchState } from "./machine";
import { advanceSession, createSession, type SessionCommand, type SessionState } from "./session";

interface BrowserSession {
  session: SessionState;
  /** performance.now() at initialization; recordings use relative time only. */
  origin: number;
}

type BrowserAction =
  | { type: "initialize"; setup: ReplaySetup; now: number }
  | { type: "command"; command: SessionCommand; now: number; round?: RoundName; generation?: number };

function browserReducer(state: BrowserSession | null, action: BrowserAction): BrowserSession | null {
  if (action.type === "initialize") {
    return state ?? { session: createSession(action.setup), origin: action.now };
  }
  if (!state || (action.round && action.round !== state.session.match.round.round) ||
    (action.generation !== undefined && action.generation !== state.session.match.generation)) return state;
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
  const generation = match?.generation;
  const outcome = match?.lineOutcome;
  const lastKeyAt = match?.lastKeyAt;
  const origin = browser?.origin;

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

  useEffect(() => {
    if (phase !== "round" || status !== "live" || !outcome || startedAt == null || origin == null || lastKeyAt == null) return;
    const due = origin + startedAt + lastKeyAt + tuning.impactBeatMs;
    const id = window.setTimeout(() => {
      dispatch({
        type: "command", command: { type: "deal", slot: 0 },
        round: roundName, generation, now: performance.now(),
      });
    }, Math.max(0, due - performance.now()));
    return () => window.clearTimeout(id);
  }, [phase, status, outcome, startedAt, origin, lastKeyAt, roundName, generation, tuning.impactBeatMs]);

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
