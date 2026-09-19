# Handoff

Issues #9 (results) and #8 (intermission taunts) are complete on `main`.

**Branch:** `main`, synced with `origin/main`
**Last updated:** 2026-09-19
**Working dir:** `/Users/ananthan2k/Gitrepos/TypeFeud`

## What #9 built

The placeholder match-end arithmetic was replaced with the Results artboard's
real hierarchy:

1. the match verdict and winner pose;
2. a large match-reel frame showing the player's biggest hit;
3. WPM, accuracy and biggest hit;
4. a large centred Rematch button.

The reel is deliberately a still, not fake playback UI. Persistent playback,
export and shareable clips remain Milestone 6. The still uses real match data and
labels export honestly as a later milestone.

`apps/web/src/match/stats.ts` owns deterministic per-slot accumulation. A
resolved line contributes its character count, active typing duration, final
uncorrected errors and damage. The result screen derives:

- gross WPM across completed lines, excluding choice/idle time between lines;
- accuracy from completed characters and final uncorrected errors, so repaired
  errors cost time but do not receive a second penalty;
- the highest resolved damage event, including its round and tier.

Stats are folded inside `applyEvent`, so live play and replay take the same path.
The replay-equality test now includes stats.

The existing `typefeud.recent-lines.v1` entry accepts an optional rounded WPM.
Old stored entries still parse, and the most recent three WPM values can later
drive #7's deferred ghost profile selection. No database or keystroke history was
added.

Rematch does not reload the page. It creates a new session ID and seed, reads the
just-finished recent-line history, and returns to the arena reveal. Existing dev
flags and current tuning carry into the new session.

## What #8 built

The existing 10-second intermission now offers three committed Group Chat
taunts. Their first letters are distinct. A matching first character locks the
line case-insensitively, the actual key is rendered, wrong characters advance,
and backspace repairs. Completing the line replaces the choices with a bubble on
the opponent's half. Timeout still advances to the already-pending next round.

The keystroke state is local and pure in `apps/web/src/match/taunt.ts`. Only the
completed canned taunt becomes a session event. The session accepts one taunt per
slot per intermission and saves ID plus text in the replay so later content edits
cannot change an old clip. The multiplayer protocol remains ID-only through the
existing `taunt.send` message; no free-form string crosses that boundary.

Three short taunts ship now. The #11 content target remains 12 per arena. Taunts
have their own schema and mechanical validation rather than pretending they are
damage-tier lines.

## Files changed

| File | Change |
|---|---|
| `apps/web/src/match/stats.ts` | New deterministic match-stat accumulator and result summary. |
| `apps/web/src/match/taunt.ts` | New pure taunt lock-in, typing and repair state. |
| `apps/web/src/match/session.ts` | Fold line outcomes into stats and completed taunts into replay. |
| `apps/web/src/match/use-match.ts` | Expose stats, taunt send and Rematch; persist rounded WPM. |
| `apps/web/src/match/history.ts` | Backward-compatible optional WPM in recent match entries. |
| `apps/web/src/match/machine.ts` | Hold one sent taunt per slot during an intermission. |
| `apps/web/src/components/match-end.tsx` | Results artboard implementation. |
| `apps/web/src/components/match-stage.tsx` | Results wiring and the intermission taunt surface/bubble. |
| `apps/web/src/app/globals.css` | Match-reel stage grid. |
| `apps/web/test/stats.test.ts` | New aggregation and immutability coverage. |
| `apps/web/test/taunt.test.ts` | Lock-in, errors, repair, completion and ignored-key coverage. |
| `apps/web/test/history.test.ts` | WPM persistence, compatibility and invalid-data coverage. |
| `apps/web/test/replay.test.ts` | Replay equality includes stats and a sent-taunt event. |
| `packages/content/pool/groupchat-taunts.json` | Three short, distinct-key canned taunts. |
| `packages/content/src/{schema,pool,validate}.ts` | Taunt schema, query and validation. |
| `packages/content/test/pool.test.ts` | Validates taunts and distinct lock-in keys. |
| `packages/game/src/replay.ts` | Serializable completed-taunt action. |
| `SPEC.md` | Defines results and taunt interaction/replay rules. |
| `TASKS.md` | Marks #8 and #9 complete locally; fixes stale #6 merge status. |

## Verification

- `pnpm test` — 188 passed: game 108, web 48, content 28, protocol 4.
- `pnpm typecheck` — passed in all five workspaces.
- `pnpm lint` — passed with no warnings.
- `pnpm --filter @typefeud/content validate` — 11 passed.
- `pnpm --filter @typefeud/web exec next build --webpack` — passed.
- Manual browser smoke test completed by the user: results, Rematch and the
  intermission taunt exchange all behave as intended.
- The default Turbopack build could not complete in the managed sandbox: its CSS
  worker was denied permission to bind a local port. Before that, the first
  attempt also needed network access to download the configured Google font.
  The webpack production build compiled, typechecked and prerendered successfully.

## What comes next

Milestone 2 still needs #10 accessibility, #11 content pipeline/full Group Chat
arena, and #12 tuning. #11 is the dependency-unlocking next feature: #12 depends
on it and on the now-complete #9. #1 CI is still small and overdue; the checks
above are still run by hand.

## Repository state before this work

#6 seeded line selection/replay, #7 scripted ghost opponent, and #23 ghost by
default are already merged on `main`. The last committed repository handoff is
`df51d36`; #8 and #9 are the next combined feature commit on top of it.
