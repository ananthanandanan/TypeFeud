# Handoff

Task #7 — the scripted ghost opponent — is implemented and fully verified on
`feat/scripted-ghost`. It is not committed yet.

**Branch:** `feat/scripted-ghost`
**Last updated:** 2026-09-11
**Working dir:** `/Users/ananthan2k/Gitrepos/TypeFeud`

## Where the project is

**Milestone 1 is done and Milestone 2 is past halfway.** #2, #3, #4 and #5 are
merged (PRs #15–#18). #6 is committed as `200fb5f` on `feat/seeded-selection-replay`
and still unmerged. #7 is what this branch adds, and it is the one that turns the
flow into a contest: a full match now has an opponent that types, lands damage,
and takes rounds off you.

**The next coding task is [#8 — intermission and taunts](https://github.com/ananthanandanan/TypeFeud/issues/8)**
or [#9 — results](https://github.com/ananthanandanan/TypeFeud/issues/9), both
unblocked. [#1 — CI](https://github.com/ananthanandanan/TypeFeud/issues/1) is
still small, still unblocked and now well overdue — every verification below was
run by hand.

M2 still needs #8, #9, #10, #11 and #12 before its exit criterion is met. #12
(tuning) is the real end of the milestone and it depends on this task, #9 and #11.

## What #7 built

The plan is `docs/plan/scripted-ghost-opponent.html`, approved in five slices.

**The engine gained one generic primitive, not a bot.** `applyProgressSnapshot`
in `packages/game/src/opponent-progress.ts` folds a `{lineId, charIndex, errors}`
snapshot into a round, and `driveRound` gained a matching `progress` input. The
opponent then resolves through `resolveLine` on the identical path a keystroke
takes — the only difference between a ghost and a person is how the progress got
there. #14 replaces the source and touches none of this.

**The ghost lives in the web app.** `apps/web/src/match/ghost.ts` owns three
canned traces, deterministic line choice, seeded jitter and the schedule. A trace
is normalized inter-keystroke cadence plus a WPM, which makes it independent of
the line it is replayed over. Nothing in it reaches into the engine.

**Replay needed no ghost at all.** Every snapshot is recorded as an ordinary
input event, so playback consumes the effects and never re-runs the cause. The
replay-equality test is the proof.

## Three decisions the plan did not foresee

- **`MatchState`'s `lineOutcome`, `lastKeyAt` and `generation` are now per slot.**
  The plan's file list omitted `machine.ts` entirely. It could not have worked:
  those three fields were the local player's alone, and the ghost needs an impact
  beat of its own before it can be dealt again. Without it the ghost lands exactly
  one line per round and then stands there. Indexing by slot rather than bolting
  on opponent-shaped fields keeps the ghost's scheduling a parameterized copy of
  the player's, and it is the shape #14 wants anyway.
- **`buildGhostSchedule` takes a derived seed, not a threaded random cursor.**
  The plan had `randomState` in and out, like `selectOptions`. That is wrong for a
  React effect: Strict Mode double-invokes, and a threaded cursor would quietly
  produce a different ghost the second time. `ghostSeed(seed, round, generation)`
  makes the schedule a pure function of the deal instead.
- **A decreasing `charIndex` is accepted, not rejected.** The plan said "rejects
  stale or impossible snapshots". Impossible is rejected; stale cannot be told
  apart from a backspace, and invariant 6 says the repair is the real one.
  Ordering is the transport's job — in-process now, an ordered socket at #14.

## Files written / edited

| File | Change |
|---|---|
| `packages/game/src/opponent-progress.ts` | **New.** Snapshot → `LineProgress`, with what it refuses and what it synthesizes. |
| `packages/game/src/round-driver.ts` | Added the `progress` input; extracted `resolveIfComplete` so keys and snapshots share one resolution. |
| `packages/game/src/index.ts` | Exported the new module. |
| `packages/protocol/src/index.ts` | Extracted `progressSnapshotSchema`; `progress` and `opponent.progress` now derive from it. |
| `apps/web/src/match/ghost.ts` | **New.** Traces, `ghostSeed`, `buildGhostSchedule`, 10Hz downsampling. |
| `apps/web/src/match/machine.ts` | Round-scoped view state is per slot; `line.resolved`/`line.dealt`/`round.changed` carry a slot. |
| `apps/web/src/match/session.ts` | Lifted the `input.slot === 0` guard on resolution and dealing. |
| `apps/web/src/match/use-match.ts` | Added the ghost's schedule effect and its impact beat; the deal guard is now per slot. |
| `apps/web/src/components/match-hud.tsx` | Added the opponent activity strip. |
| `apps/web/src/components/match-stage.tsx` | Reads slot 0 explicitly; passes the opponent's outcome to the HUD. |
| `apps/web/src/components/typing-stage.tsx` | Removed the `pending #7` marker. |
| `packages/game/test/opponent-progress.test.ts` | **New.** 11 tests: selection, clock, errors, refusals, backspace, resolve-once, deadline. |
| `apps/web/test/ghost.test.ts` | **New.** 13 tests: seed purity, offered-line legality, 10Hz cap, pace, full match, replay equality. |
| `apps/web/test/replay.test.ts` | Updated for the per-slot `lineOutcome`. |
| `SPEC.md` | §4.3 snapshot contract, §4.8 as-built ghost, §7.2 what `?bot=1` now does. |
| `TASKS.md` | #7 marked done with what moved. |
| `docs/plan/scripted-ghost-opponent.html` | The approved plan, patched before implementation and reconciled after. |

## The one new visual, and why it is small

The HUD gained an opponent activity strip: `TYPING · 27 / 56 · 2 ERRORS` over a
thin track, on the opponent's side, outside the typing panel's bounding box.

TypeRacer answers "where is my opponent" with a car whose *position is the
progress*. That does not transfer. Position on screen is already spoken for —
you are always left, the opponent always right, which is rule 1 of the design
system — and the opponent holds three lines you were not dealt, so painting
their text would have the player reading the wrong half of the screen at speed.

The real equivalent of the car is the opponent's **stick figure**: progress
crossing a threshold plays a punch (SPEC §4.3 rule 4), and the thing that races
along the track is **HP**. Both are Milestone 5. The strip is the stand-in until
then, and it is the one piece of this task the art milestone is free to delete.

It is hidden without `?bot=1`, because an idle strip would be a lie about what
the other side is doing.

## Verification

All run against the final state of the branch:

- `pnpm test` — **179 passed**: game 108, web 41, content 26, protocol 4.
- `pnpm typecheck` — passed in all five workspaces.
- `pnpm lint` — passed, no warnings.
- `pnpm build` — passed.
- `pnpm --filter @typefeud/content validate` — 9 passed.
- **Browser, `?bot=1&round=1`.** An unanswered ghost knocks the player out in all
  three rounds: `0—92`, `0—76`, `0—110`, GHOST WINS. Playing back, both sides
  type at once, the ghost's strip tracks its line and shows its standing errors
  in red, damage lands both ways, and the strip never touches the player's text.
  No console errors.
- **Browser, no `?bot=1`.** Opponent idle, strip hidden, local typing unchanged.

Note on the browser pass: synthetic CDP keystrokes only reach the window
listener after a click into the page. That is the harness, not the app.

## Open questions / not done

- **Nothing tunes the ghost yet.** It knocks out an idle player in roughly a third
  of a round, which is correct — an unopposed opponent should win — but whether it
  is *fun* is #12's question, and #12 also needs #9 and #11.
- **One skill level.** Three profiles near `PAR_WPM`, chosen by seed. Matching the
  player's recent WPM needs a performance store that does not exist until #9.
- **Traces are hand-authored fixtures.** A recorder and a reviewed trace library
  belong with content tooling; the shapes span metronomic, bursty and careless.
- **The ghost's constants are not in `Tuning`.** Deliberately: invariant 1 keeps
  `packages/game` pure and a damage engine must not know a bot exists. #12 may
  want to reach them from the tuning panel, which is a real question to answer
  then, not now.
- **No stick figures, no punch animation.** M5.
- **#6 is still unmerged**, and this branch does not depend on it being merged
  first, but the PRs should go in order.
- **#1 CI is still open**, so all of the above was run by hand.
- Nothing is committed on this branch yet; `docs/plan/scripted-ghost-opponent.html`
  is still untracked.

## Next steps

1. Commit `feat/scripted-ghost` and open the PR for #7. No co-author or tooling
   metadata in the message.
2. Land #6 first if it is still open, then #7.
3. Then #8 or #9 — both unblocked, and #9 is what unlocks adaptive ghost skill.
