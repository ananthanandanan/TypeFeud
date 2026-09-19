import type { ContentPool } from "@typefeud/content";
import {
  driveRound, playerSeeds, recordedOptions,
  type Line, type PlayerSlot, type RecordedDeal, type ReplayAction, type ReplayEvent,
  type ReplayRecord, type ReplaySetup, type Tuning,
} from "@typefeud/game";
import { initialMatch, matchReducer, nextRoundName, openRound, type MatchState } from "./machine";
import { rememberLines, selectOptions } from "./selection";
import { emptyMatchStats, recordLineStats, type MatchStats } from "./stats";

export interface SessionState {
  match: MatchState;
  cursors: [number, number];
  resolved: [boolean, boolean];
  tuning: Tuning;
  trace: ReplayRecord;
  stats: MatchStats;
}

export type SessionCommand = Exclude<ReplayAction, { type: "deal" | "round.end" }>
  | { type: "deal"; slot: PlayerSlot }
  | { type: "round.end" };

function copyTuning(tuning: Tuning): Tuning {
  return { ...tuning, tierBaseDamage: { ...tuning.tierBaseDamage } };
}

function optionsFor(lines: readonly Line[], deals: [RecordedDeal, RecordedDeal]) {
  if (deals[0].slot !== 0 || deals[1].slot !== 1) throw new Error("Replay: invalid deal slots");
  return [recordedOptions(lines, deals[0]), recordedOptions(lines, deals[1])] as const;
}

function beginRecording(trace: ReplayRecord): SessionState {
  if (trace.version !== 1) throw new Error("Replay: unsupported version");
  const { setup, initialDeals } = trace;
  if (!Number.isInteger(setup.seed) || setup.seed < 0 || setup.seed > 0xffffffff) {
    throw new Error("Replay: seed must be uint32");
  }
  const options = optionsFor(trace.lines, initialDeals);
  return {
    match: initialMatch(openRound(setup.firstRound, [], [...options], [[], []], setup.tuning)),
    cursors: [initialDeals[0].randomState, initialDeals[1].randomState],
    resolved: [false, false],
    tuning: copyTuning(setup.tuning),
    trace: { ...trace, events: [] },
    stats: emptyMatchStats(),
  };
}

/** Browser randomness and storage have already been read and injected here. */
export function createSession(setup: ReplaySetup, pool?: ContentPool): SessionState {
  const snapshot: ReplaySetup = {
    ...setup, tuning: copyTuning(setup.tuning), recent: [[...setup.recent[0]], [...setup.recent[1]]],
  };
  const seeds = playerSeeds(snapshot.seed);
  const first = selectOptions(snapshot, seeds, setup.firstRound, 0, [], pool);
  const second = selectOptions(snapshot, seeds, setup.firstRound, 1, [], pool);
  return beginRecording({
    version: 1, setup: snapshot,
    lines: rememberLines(first.lines, second.lines),
    initialDeals: [first.deal, second.deal], events: [],
  });
}

/** Reject stale browser effects before selection consumes any random numbers. */
function allowed(state: SessionState, command: SessionCommand | ReplayAction): boolean {
  const { match } = state;
  switch (command.type) {
    case "arena.done": return match.phase === "arena";
    case "intermission.done": return match.phase === "intermission";
    case "taunt": return match.phase === "intermission" && !match.taunts[command.slot];
    case "round.end": return match.phase === "round" && match.round.status === "over";
    case "tuning": return match.phase !== "results";
    case "input": return match.phase === "round" && match.round.status === "live";
    case "deal": {
      const slot = "slot" in command ? command.slot : command.deal.slot;
      return match.phase === "round" && match.round.status === "live" && state.resolved[slot];
    }
  }
}

/** Commit a serializable input. Replay enters this exact path too. */
function applyEvent(state: SessionState, event: ReplayEvent): SessionState {
  const previous = state.trace.events.at(-1);
  if (event.seq !== state.trace.events.length || event.round !== state.match.round.round ||
    !Number.isFinite(event.at) || event.at < (previous?.at ?? 0)) {
    throw new Error("Replay: invalid event order or time");
  }
  if (!allowed(state, event.action)) throw new Error(`Replay: ${event.action.type} is invalid in this phase`);
  let { match, tuning, stats } = state;
  let resolved = state.resolved;
  const cursors: [number, number] = [...state.cursors];
  const { action } = event;
  const roundAt = event.at - (match.roundStartedAt ?? event.at);
  switch (action.type) {
    case "arena.done":
    case "intermission.done":
      match = matchReducer(match, { type: action.type, now: event.at });
      resolved = [false, false];
      break;
    case "taunt":
      match = matchReducer(match, {
        type: "taunt.sent",
        slot: action.slot,
        taunt: { id: action.tauntId, text: action.text },
      });
      break;
    case "tuning":
      tuning = copyTuning(action.tuning);
      break;
    case "round.end": {
      const next = nextRoundName(match.round.round);
      if (Boolean(next) !== Boolean(action.deals)) throw new Error("Replay: missing or unexpected round deal");
      const options = action.deals
        ? optionsFor(state.trace.lines, action.deals)
        : [match.round.players[0].options, match.round.players[1].options] as const;
      if (action.deals) {
        cursors[0] = action.deals[0].randomState;
        cursors[1] = action.deals[1].randomState;
      }
      match = matchReducer(match, { type: "round.end", options: [...options], now: event.at, tuning });
      resolved = [false, false];
      break;
    }
    case "input":
    case "deal": {
      const input = action.type === "deal"
        ? { type: "deal" as const, slot: action.deal.slot, options: recordedOptions(state.trace.lines, action.deal) }
        : action.input;
      const acting = "slot" in input ? input.slot : undefined;
      const before = acting === undefined ? null : match.round.players[acting];
      const driven = driveRound({ round: match.round, resolved }, input, roundAt, tuning);
      resolved = driven.resolved;
      if (input.type === "deal" && driven.round.status === "live") {
        if (action.type === "deal") cursors[action.deal.slot] = action.deal.randomState;
        // Per-slot generation is what keeps an opponent's refresh from
        // remounting the local typing surface, so both slots take one path.
        match = matchReducer(match, { type: "line.dealt", round: driven.round, slot: input.slot });
      } else {
        // A snapshot is the opponent's keystroke: it moves their clock the same
        // way, and the impact beat after their line is measured from it.
        const typed = input.type === "key" || input.type === "progress";
        match = matchReducer(match, {
          type: "round.changed", round: driven.round, slot: acting,
          at: typed && acting !== undefined &&
            driven.round.players[acting].progress !== match.round.players[acting].progress
            ? roundAt : undefined,
        });
        if (driven.outcome && acting !== undefined) {
          const line = before?.options.find((option) => option.id === driven.outcome?.lineId);
          const startedAt = before?.progress?.startedAt ?? driven.round.players[acting].progress?.startedAt ?? roundAt;
          stats = recordLineStats(
            stats,
            acting,
            match.round.round,
            line?.text.length ?? 0,
            roundAt - startedAt,
            driven.outcome,
          );
          match = matchReducer(match, {
            type: "line.resolved", round: driven.round, slot: acting, outcome: driven.outcome,
          });
        }
      }
      break;
    }
  }
  return { match, cursors, resolved, tuning, stats, trace: { ...state.trace, events: [...state.trace.events, event] } };
}

/** Deal generation belongs to live play only; playback consumes saved offers. */
export function advanceSession(
  state: SessionState,
  command: SessionCommand,
  at: number,
  pool?: ContentPool,
): SessionState {
  if (!allowed(state, command)) return state;
  let action: ReplayAction;
  let lines = state.trace.lines;
  const { match } = state;
  // A delayed impact callback must close the round without generating a deal.
  if (command.type === "deal" && at >= (match.roundStartedAt ?? 0) + match.round.endsAt) {
    command = { type: "input", input: { type: "clock" } };
  }
  switch (command.type) {
    case "deal": {
      const chosen = selectOptions(state.trace.setup, state.cursors, match.round.round, command.slot,
        match.round.players[command.slot].seenLineIds, pool);
      lines = rememberLines(lines, chosen.lines);
      action = { type: "deal", deal: chosen.deal };
      break;
    }
    case "round.end": {
      const next = nextRoundName(match.round.round);
      if (!next) {
        action = { type: "round.end", deals: null };
        break;
      }
      const first = selectOptions(state.trace.setup, state.cursors, next, 0, match.round.players[0].seenLineIds, pool);
      const second = selectOptions(state.trace.setup, state.cursors, next, 1, match.round.players[1].seenLineIds, pool);
      lines = rememberLines(rememberLines(lines, first.lines), second.lines);
      action = { type: "round.end", deals: [first.deal, second.deal] };
      break;
    }
    case "tuning": action = { type: "tuning", tuning: copyTuning(command.tuning) }; break;
    case "taunt": action = { ...command }; break;
    case "input": action = { type: "input", input: { ...command.input } }; break;
    default: action = { ...command };
  }
  return applyEvent({ ...state, trace: { ...state.trace, lines } }, {
    seq: state.trace.events.length, round: match.round.round, at, action,
  });
}

/** No content lookup, browser clock, storage access or trusted final scores. */
export function replaySession(trace: ReplayRecord): SessionState {
  let state = beginRecording(trace);
  for (const event of trace.events) state = applyEvent(state, event);
  return state;
}
