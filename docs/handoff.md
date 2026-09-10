# Handoff

Task #6 — seeded line selection and replay traces — is implemented, fully
verified, committed as `200fb5f`, and pushed; it remains unmerged.

**Branch:** `feat/seeded-selection-replay`
**Last updated:** 2026-09-11
**Working dir:** `/Users/ananthan2k/Gitrepos/TypeFeud`

## Agenda

Task #6 makes line selection reproducible, remembers recently displayed lines,
and records enough ordered input to recompute a match. This is infrastructure for
testing, debugging, later replay/clip work, and #7's scripted ghost. It is not a
user statistics system or a match-history screen.

The implementation plan is `docs/plan/seeded-selection-replay.html`. The user
approved all four slices: deterministic selection, browser history, recording and
replay, then verification and documentation.

## Files read

- `AGENTS.md` — repository workflow and validation requirements.
- `TASKS.md` — task #6 scope and dependency on #5.
- `SPEC.md` — selection, deterministic-engine and replay requirements.
- `docs/design/README.md` — UI constraints; task #6 adds no new UI.
- `docs/handoff.md` — previous state after #5; this file replaces it.
- `apps/web/src/match/use-match.ts` — old `FIRST_DEAL` hydration workaround and browser effects.
- `apps/web/src/match/machine.ts` — pure match phase transitions.
- `packages/content/src/deal.ts` — existing injected randomness and exhaustion fallback.
- `packages/game/src/engine.ts` and `packages/game/src/types.ts` — round rules and trace types.

## Files written / edited

| File | Change |
|---|---|
| `docs/plan/seeded-selection-replay.html` | Approved visual implementation plan. |
| `packages/game/src/random.ts` | Added explicit-state Mulberry32 PRNG and independent player seeds. |
| `packages/game/src/round-driver.ts` | Added the shared live/replay input path and per-player resolve-once guards. |
| `packages/game/src/replay.ts` | Added versioned replay setup, deals, events and line snapshots. |
| `packages/game/src/index.ts` | Exported random, replay and round-driver APIs. |
| `packages/game/src/engine.ts` | `dealOptions` now records every displayed option as seen. |
| `packages/game/src/types.ts` | Clarified displayed-line semantics and removed unused `rngCursor`. |
| `packages/content/src/deal.ts` | Added recent-history exclusion, stable ordering, tag variety, deterministic exhaustion and first-character backtracking. |
| `packages/content/src/pool.ts` | Updated ownership comments for seeded selection. |
| `apps/web/src/match/selection.ts` | Added pure per-player deal transactions and immutable line snapshots. |
| `apps/web/src/match/history.ts` | Added the versioned three-match localStorage ring with safe in-memory fallback. |
| `apps/web/src/match/session.ts` | Added pure session creation, event recording, phase coordination and playback. |
| `apps/web/src/match/use-match.ts` | Replaced `FIRST_DEAL` and direct engine closures with one browser-initialized recorded session. |
| `apps/web/src/match/machine.ts` | Accepts driven round state and preserves pure phase sequencing. |
| `apps/web/src/components/match-stage.tsx` | Shows the arena reveal while browser session initialization completes. |
| `packages/game/test/random.test.ts` | Added fixed-vector and uint32 PRNG tests. |
| `packages/game/test/round-driver.test.ts` | Added resolution, deadline, repair, timeout and slot tests. |
| `packages/content/test/selection.test.ts` | Added history, exhaustion, stable-order, backtracking and tag tests. |
| `packages/content/test/deal.test.ts` | Updated seen semantics and added a live small-pool selectability regression. |
| `apps/web/test/history.test.ts` | Added ring retention, invalid storage and storage-failure tests. |
| `apps/web/test/replay.test.ts` | Added full-match replay, JSON round-trip, content-edit, ordering, shortcuts and stale-action tests. |
| `packages/game/test/{engine,lock-in,match,resolve-line}.test.ts` | Removed obsolete `rngCursor` fixture fields. |
| `SPEC.md` | Documented final selection, exhaustion, deadline and replay contracts. |
| `TASKS.md` | Marked #6 implemented locally, not committed or merged. |

## Bugs found and fixes made

- **Hydration required a fake first deal.** Server and client randomness differed,
  so `use-match.ts` rendered `FIRST_DEAL` and replaced it after mount. Both now
  render only the arena reveal initially; one browser session is created after
  storage and randomness are available.
- **Completed lines were the only lines considered seen.** Unchosen displayed
  options could repeat immediately. `openRound` and `dealOptions` now record all
  displayed option IDs. Pending intermission options count when their round opens.
- **The small content pool can exhaust compatible first characters.** Strictly
  excluding every displayed line produced choices with the same first character,
  so some cards could not be selected. The dealer now relaxes last-three-match
  exclusions first, then current-match exclusions, and repeats before presenting
  an avoidable lock-in collision.
- **Greedy distinct-character selection could strand a later tier.** The dealer
  now backtracks over the three slots and preserves distinct first characters when
  any valid combination exists.
- **A key at the deadline could beat a delayed timeout callback.** `driveRound`
  checks the deadline before applying a key, Special or deal. The interval ends at
  `endsAt`; an input there cannot deal damage or win the trigger.
- **`resolveLine` could be called twice while completed text remained visible.**
  `DrivenRound` stores a resolution guard per player and clears it only on a deal.
- **Typing after completion could move the impact deadline.** The session updates
  `lastKeyAt` only when local progress actually changes.
- **One player's selection could perturb the other's.** Each slot now owns an
  independent seeded random stream that advances only on a committed deal.

## Skills used

- `/ank:visualise-plan` — wrote and received approval for
  `docs/plan/seeded-selection-replay.html` before implementation.
- `/ank:no-yap` — explained task #6 and its relationship to the ghost in plain language.
- `/ank:handoff` — rewrote this repository's canonical `docs/handoff.md` at the
  user's request. The repo explicitly requires rewriting this file in place.

## Links / references

- Task: [GitHub issue #6](https://github.com/ananthanandanan/TypeFeud/issues/6)
- Next task: [GitHub issue #7](https://github.com/ananthanandanan/TypeFeud/issues/7)
- Last merged feature: [PR #18](https://github.com/ananthanandanan/TypeFeud/pull/18)
- Plan: `docs/plan/seeded-selection-replay.html`
- Binding sections: `SPEC.md` §§3.6, 4.2 and 5.3.

## Key decisions

- A seed makes selection reproducible; the ghost itself needs recorded or
  simulated typing. The saved offers and line snapshots are what let an old replay
  survive later content edits.
- Replay v1 stores seed/setup, initial tuning/history, line snapshots, every deal,
  keys, Specials, tuning changes, clock evaluations and phase changes. Damage, HP,
  momentum, carry and winners are recomputed and never trusted from the recording.
- Replay timestamps are relative to session initialization. Equal timestamps use a
  monotonic sequence number. Decreasing time and invalid phase actions are rejected.
- The current replay stays in memory through results. Only distinct displayed line
  IDs from slot 0 enter `typefeud.recent-lines.v1` at results, once per session ID.
  No keystrokes, results or user statistics are persisted.
- The history ring contains the last three completed local sessions. Abandoned
  sessions do not enter it. Malformed, unavailable or quota-limited storage cannot
  block play.
- Small-pool repetition is an explicit exception to the old absolute “never
  repeat” wording. Playable, distinguishable choices take priority. `SPEC.md` now
  records the exact relaxation order.
- `packages/game` remains pure. Browser clocks, crypto randomness and localStorage
  stay in `use-match.ts`; selection and session/replay logic accept injected data.
- There is still no tick loop. Live play retains one timeout per round boundary.

## Current state

The implementation and validation are complete on
`feat/seeded-selection-replay`, which tracks the pushed remote branch. Task #6 is
not merged into `main` yet.

Observed verification:

- Latest `pnpm test` passed: **155 tests** total — game 97, content 26, protocol 4,
  web 28; server has no test files.
- Latest `pnpm typecheck` passed in all five workspaces.
- Latest `pnpm lint` passed with no warnings.
- The final `pnpm build` passed after the small-pool dealer adjustment.
- An isolated headless Chromium full-match pass ran after the small-pool fix:
  trigger `100—92`, debate `100—0`, roast `100—0`, fight `125—0`, player wins.
  It observed one seed creation, one history write and no browser console/runtime
  errors. The stored history contained all seven currently authored displayed IDs.
- The browser pass used `?round=0`. Automated replay tests cover all four `?round=`
  starting points and the `?tier=haymaker` override.
- A reload preserved the existing history, created exactly one new seed, read the
  history and made no premature write. A separate page with `localStorage` reads
  and writes forced to throw still reached a playable debate with no console or
  runtime errors.
- The user ran the app after implementation and confirmed the manual smoke test
  passed, including normal match progression and the new selection/history behavior.
- The complete diff was reviewed. The only cleanup finding was two Markdown
  trailing-space lines in this handoff; they were removed.

## Open questions / not done

- `ReplayRecord` is an internal v1 shape. There is no import/export UI, replay
  viewer, durable storage, account history or statistics page.
- The tuning panel records full tuning snapshots when it changes. Confirm during
  review whether this is preferable to recording only changed fields.
- Cross-tab history is best effort. A read occurs immediately before a write, but
  there is no locking or account-level synchronization.
- #7 must decide how canned ghost recordings select a compatible offered line and
  how light timing jitter affects deterministic test fixtures.
- The ghost is still absent. Slot 1 is only driven by test fixtures.
- #1 CI remains open, so verification still depends on local commands.
- #11 content remains open. Roast and fight currently widen into the six debate
  lines, and the trigger still has one word.
- Commit `200fb5f` (`feat: seeded selection and replay traces`) is pushed to
  `origin/feat/seeded-selection-replay`.
- No PR, GitHub issue update or review-board artifact was created yet.

## Next steps

1. Open the PR from `feat/seeded-selection-replay` to `main` for issue #6. Include
   no co-author, generated-by or tooling metadata.
2. Include the implementation summary, `pnpm test`, `pnpm typecheck`, `pnpm lint`,
   `pnpm build`, and the browser verification in the PR description.
3. After #6 merges, begin #7 by consuming a canned recorded trace as slot 1 input
   through `advanceSession`; keep the ghost source behind the same event shape that
   later multiplayer progress will replace.
