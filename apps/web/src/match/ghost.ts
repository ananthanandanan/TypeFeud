/**
 * The scripted ghost. SPEC §4.8, §8 Milestone 2.
 *
 * A ghost is not a typing simulator. It is a *source of progress snapshots* —
 * the same `{lineId, charIndex, errors}` at ~10Hz that a live opponent will
 * send through the socket at #14 (SPEC §4.3, invariant 4). Everything below
 * exists to produce that stream from canned human timing, and nothing below is
 * allowed to reach into the engine: the ghost proposes progress, the engine
 * decides what it was worth.
 *
 * Determinism is the whole point of the shape. `buildGhostSchedule` takes its
 * randomness as a seed and returns a finished list of due times, so the same
 * seed and the same three options always produce the same line, the same
 * timing and the same errors. It is also why replay needs no ghost at all —
 * every snapshot is recorded as an ordinary input event, so playback consumes
 * the effects and never re-runs the cause.
 *
 * These constants are the ghost's tuning table, and they deliberately do not
 * live in `packages/game`'s `Tuning`: invariant 1 keeps that package pure, and
 * a pure damage engine has no business knowing a bot exists. #12 tunes them
 * here; #9 is what lets a later profile be chosen by the player's recent WPM.
 */

import { nextRandom, type Line, type RoundName } from "@typefeud/game";
import type { ProgressSnapshot } from "@typefeud/protocol";

/**
 * How often the ghost reports. The same 10Hz SPEC §4.3 puts on the wire, so
 * the ghost is lossy in exactly the way a real opponent is — its keystrokes
 * are collapsed into snapshots before anything downstream sees them, and the
 * UI can never accidentally depend on detail multiplayer will not have.
 */
export const GHOST_SNAPSHOT_INTERVAL_MS = 100;

/** Per-keystroke timing jitter, as a multiplier around the cadence sample. */
export const GHOST_JITTER = { min: 0.82, max: 1.24 } as const;

/**
 * One canned human timing sample.
 *
 * `cadence` is inter-keystroke delay normalized to a mean of 1, which is what
 * makes a trace independent of the line it is replayed over: the shape of the
 * typing survives, the duration is set by `wpm` and the line's own length.
 * Recorded traces are a later luxury (a recorder belongs with content tooling)
 * — these three are hand-authored to span the shapes that matter: metronomic,
 * bursty with word-boundary pauses, and fast but careless.
 */
export interface GhostTrace {
  id: string;
  /** the pace this trace types at, before jitter */
  wpm: number;
  cadence: readonly number[];
  /** probability a character lands wrong */
  errorRate: number;
  /** probability a wrong character is noticed and repaired */
  repairRate: number;
}

/**
 * One moderate profile, as SPEC §4.8's launch bot would want — near PAR_WPM so
 * the fight is winnable but not free. Skill selection is deferred: there is no
 * store of the player's recent WPM until the results task (#9).
 */
export const GHOST_TRACES: readonly GhostTrace[] = [
  {
    id: "steady-62",
    wpm: 62,
    cadence: [1.0, 0.94, 1.06, 0.97, 1.11, 0.9, 1.03, 0.99],
    errorRate: 0.035,
    repairRate: 0.75,
  },
  {
    id: "bursty-68",
    wpm: 68,
    cadence: [0.72, 0.68, 0.75, 0.7, 1.9, 0.74, 0.69, 0.78, 0.71, 1.74],
    errorRate: 0.05,
    repairRate: 0.6,
  },
  {
    id: "loose-74",
    wpm: 74,
    cadence: [0.86, 0.81, 0.92, 0.79, 1.28, 0.83, 0.88, 0.8],
    errorRate: 0.075,
    repairRate: 0.45,
  },
];

/** One snapshot and when it is due, in ms since round start. */
export interface TimedGhostSnapshot {
  dueAt: number;
  progress: ProgressSnapshot;
}

export interface GhostSchedule {
  /** which of the three the ghost committed to */
  line: Line;
  trace: GhostTrace;
  events: TimedGhostSnapshot[];
}

/**
 * The ghost's random stream for one deal.
 *
 * Derived from the match seed rather than carried forward as a cursor, so the
 * schedule for a given deal is a pure function of `(seed, round, generation)`.
 * That is worth more than it sounds: a React effect may build the same
 * schedule twice — Strict Mode does exactly this — and a threaded cursor would
 * quietly produce a different ghost the second time.
 */
export function ghostSeed(seed: number, round: RoundName, generation: number): number {
  let mixed = (seed ^ 0x5f356495) >>> 0;
  for (const code of `${round}:${generation}`) {
    mixed = Math.imul(mixed ^ code.charCodeAt(0), 0x01000193) >>> 0;
  }
  return mixed >>> 0;
}

/**
 * Turn one deal into a finished list of snapshots.
 *
 * The ghost commits to a line the way a player does — one of the three, chosen
 * before the first character — and then types it once. It never switches, and
 * it is never dealt anything the engine did not offer it, because the options
 * handed in here are the opponent's own `PlayerState.options`.
 */
export function buildGhostSchedule(input: {
  seed: number;
  options: readonly [Line, Line, Line];
  /** ms since round start at which the ghost begins reading */
  startAt?: number;
  /** the profiles to choose from; #9 is what will narrow this by player WPM */
  traces?: readonly GhostTrace[];
}): GhostSchedule {
  let state = input.seed >>> 0;
  const random = () => {
    const next = nextRandom(state);
    state = next.state;
    return next.value;
  };

  const traces = input.traces?.length ? input.traces : GHOST_TRACES;
  const trace = traces[Math.floor(random() * traces.length)] ?? traces[0]!;
  const line = input.options[Math.floor(random() * input.options.length)] ?? input.options[0];

  return { line, trace, events: snapshots(keystrokes(line, trace, random, input.startAt ?? 0), line) };
}

/** One entry per keystroke: where the ghost's progress stood after it. */
interface GhostKeystroke {
  at: number;
  charIndex: number;
  /** errors STILL STANDING, which is what the snapshot means (SPEC §2.5) */
  errors: number;
}

/**
 * Replay the trace over one line, keystroke by keystroke.
 *
 * A repair is three keystrokes and it costs time, never damage — the wrong
 * character, the backspace, the retype. That is invariant 6 from the other
 * side of the net: the ghost that fixes its mistakes finishes later and is
 * charged nothing, the ghost that leaves them arrives sooner and pays at
 * resolution.
 */
function keystrokes(line: Line, trace: GhostTrace, random: () => number, startAt: number): GhostKeystroke[] {
  // 5 characters to a word is the standard WPM convention, the same one
  // `wpm()` in packages/game uses. Both ends must agree or the ghost's
  // measured speed would not be the speed it was authored at.
  const perCharacter = 60_000 / (trace.wpm * 5);
  const keys: GhostKeystroke[] = [];

  let at = startAt;
  let charIndex = 0;
  let errors = 0;
  let step = 0;

  const delay = () => {
    const sample = trace.cadence[step++ % trace.cadence.length] ?? 1;
    const jitter = GHOST_JITTER.min + random() * (GHOST_JITTER.max - GHOST_JITTER.min);
    return perCharacter * sample * jitter;
  };

  while (charIndex < line.text.length) {
    at += delay();
    const wrong = random() < trace.errorRate;
    charIndex += 1;
    if (wrong) errors += 1;
    keys.push({ at, charIndex, errors });

    if (!wrong || random() >= trace.repairRate) continue;

    at += delay();
    charIndex -= 1;
    errors -= 1;
    keys.push({ at, charIndex, errors });

    at += delay();
    charIndex += 1;
    keys.push({ at, charIndex, errors });
  }

  return keys;
}

/**
 * Collapse keystrokes to the 10Hz stream. This is the lossy step, and the only
 * thing that ever leaves this file.
 *
 * One snapshot per window, carrying where the ghost stood at the end of it —
 * a repair that begins and ends inside a single window is invisible, exactly
 * as it would be over the wire. The completing keystroke always gets a
 * snapshot of its own, on time: it is the one that resolves the line, and
 * rounding it up to the next window would hand the player free milliseconds.
 */
function snapshots(keys: readonly GhostKeystroke[], line: Line): TimedGhostSnapshot[] {
  const events: TimedGhostSnapshot[] = [];
  let window = -1;

  keys.forEach((key, index) => {
    const last = index === keys.length - 1;
    const bucket = Math.floor(key.at / GHOST_SNAPSHOT_INTERVAL_MS);
    if (!last && bucket === window) {
      events[events.length - 1] = { dueAt: key.at, progress: snapshot(line, key) };
      return;
    }
    window = bucket;
    events.push({ dueAt: key.at, progress: snapshot(line, key) });
  });

  return events;
}

function snapshot(line: Line, key: GhostKeystroke): ProgressSnapshot {
  return { lineId: line.id, charIndex: key.charIndex, errors: key.errors };
}
