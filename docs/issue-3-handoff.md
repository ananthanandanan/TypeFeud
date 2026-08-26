# Handoff — #3: damage and momentum on line completion

**Crux:** Implemented `resolveLine`, so finishing a line now moves HP, charges or
empties the momentum meter, and spends a Special. The damage number and the meter
render on completion. M1's task list is complete apart from CI (#1).
**Branch:** `feat/damage-momentum-line-completion` (`92afa38`) — open as
[PR #16](https://github.com/ananthanandanan/TypeFeud/pull/16), closing
[issue #3](https://github.com/ananthanandanan/TypeFeud/issues/3)
**Date:** 2026-08-26
**Working dir:** `/Users/ananthan2k/Gitrepos/TypeFeud`

---

## Where the project is

```
M1 — Feel        #2 done, #3 in review, #1 (CI) still open
M2 — The Arc     ← next, starting at #4
```

**Next is [issue #4](https://github.com/ananthanandanan/TypeFeud/issues/4) — the
three-line choice with first-keystroke lock-in**, which opens Milestone 2.
`CLAUDE.md` carries the short version; this document is why things are the way
they are.

**PR #16 was not merged.** If it still is, merge it before starting #4 — #4 builds
directly on `resolveLine`.

## What was built

**Engine — `packages/game/src/engine.ts`.** `resolveLine` turns a finished line
into damage, momentum and HP:

- Only errors **still standing** are charged (`wrongIndices.length`). A repaired
  character already cost the time it took to repair, and invariant 6 says never
  both.
- Momentum `+1` per clean line, `0` on any uncorrected error, capped at
  `momentumChargesForSpecial`.
- An armed Special multiplies by `specialDamageMult` and empties the meter, then
  that line's own result recharges it — so firing on a clean line leaves you at one
  charge rather than zero.
- Damage lands on the opponent, self-damage on the player, both floored at 0. The
  line id goes into `seenLineIds` (SPEC §3.6).

`triggerSpecial` is new alongside it, and `specialReady` joined `progress.ts` as
the derivation of "meter full".

**UI.** `apps/web/src/components/fighter-bar.tsx` (HP bar + four momentum pips) and
`impact-burst.tsx` (the starburst with the damage number). Both new.
`typing-stage.tsx` rewired around them.

**Tuning.** `momentumChargesForSpecial` joined the `Tuning` interface, and it and
`specialDamageMult` joined the dev panel's `FIELDS`.

## Key decisions

- **`resolveLine`'s declared signature could not survive contact.** It was
  `(state, lineId) => LineOutcome`, which has no way to return the HP, momentum and
  `specialArmed` it has to move; and WPM needs the completing keystroke's timestamp,
  which invariant 1 forbids the package from reading itself. It is now
  `resolveLine(state, { now, slot? }, tuning?) => { state, outcome }`. Changed now
  because only the web client codes against it — after Milestone 3 it would be two
  callers and a wire format. **SPEC §4.2 needs updating to match.**
- **`progress` is deliberately left standing after resolution.** Clearing it would
  blank the typing surface at the exact moment the impact beat plays. The caller
  advances by locking in the next line. The cost: nothing in the state records that
  a line was already resolved, so **resolving the same progress twice charges the
  damage twice**. The UI guards with a ref (`resolved` in `LineRun`). If that
  guarantee needs to be structural — and it probably does once the server resolves
  too — the fix is a `resolvedAt` field on `LineProgress`.
- **The Special is triggered, not automatic.** SPEC §2.6 says the player triggers
  it, so <kbd>Tab</kbd> arms a full meter and the next completed line is multiplied.
  `triggerSpecial` is a no-op below four charges so the keybinding needs no guard.
  The spec's round-flavoured specials (laminated chart, triple-speed verse, heavy
  swing) are **not** implemented — this is the mechanic, not the payoff.
- **Damage is rounded once, in `resolveLine`.** So the burst, the `DAMAGE` readout
  and the HP bar cannot disagree. `computeDamage` stays exact, because SPEC §2.5's
  worked examples are tested against it directly and rounding there would move them.
- **A spent Special empties the meter *before* the line charges it.** Clean line
  with a Special → one charge, not zero. Arbitrary but deliberate; it keeps a
  precise player's meter moving rather than starting them over.
- **`RoundState` moved up into `TypingStage`.** HP and momentum have to survive the
  jump to the next line, so `LineRun`'s remount key now resets only the per-line
  clock, not the round. `withLine` carries HP, momentum, the Special and
  `seenLineIds` across.
- **The burst renders in a fixed-height band above the typing panel.** Design rule 2
  and SPEC §6.5 — an effect must be *structurally* unable to reach the text, not
  merely positioned so it doesn't. Fixed height so nothing reflows mid-line.

## Verified, not assumed

```
pnpm test        → 5 tasks successful; 72 tests passed (game 50, +22 new)
pnpm typecheck   → 5 tasks successful
pnpm lint        → clean
pnpm build       → next build ✓, 3 pages
```

Confirmed by hand at `localhost:3000`: a clean haymaker at 89 WPM read **42**, and
the opponent dropped to **58**. That is `30 × 1.0 × clamp(89/60, 0.7, 1.4)` with the
speed multiplier sitting on its ceiling. SPEC §2.5's worked example — clean haymaker
at 80 WPM ≈ 40 — reproduces exactly.

New tests are in `packages/game/test/resolve-line.test.ts`, covering damage, HP,
momentum, the Special, non-mutation, and the throws on an unfinished line.

## Known gaps, deliberately left

- **The error path was never confirmed by hand**, only by test. Worth typing a line
  with two errors standing and checking it reads 29 with 4 self-damage before this
  is called done.
- **The opponent is a dummy** that only takes damage. Its HP bar and momentum meter
  exist because damage has to land somewhere visible; nothing drives them. `?bot=1`
  still only relabels it GHOST. That is #7.
- **No KO handling.** HP floors at 0 and the game keeps going. Round outcomes are
  #5 (`tickRound`, `resolveMatch` — still throwing `not implemented`).
- **All three options are still the same line.** That is #4.
- **Momentum is per-player but only slot 0 is driven.** The engine handles either
  slot; nothing calls it for slot 1 yet.
- **No test for the UI components.** Consistent with SPEC §7.3, which rules out E2E
  browser tests for v1 — but `FighterBar` and `ImpactBurst` are pure functions of
  props and could take unit tests cheaply if it ever matters.

## Open questions

- **Is the speed ceiling too low?** At 89 WPM you are already clamped, so a fast
  typist gets no credit above 84 WPM. That may be correct — it is the counterweight
  momentum exists to provide — but it is untested against a real range of typists.
  A Milestone 2 tuning question, and the panel already drives it.
- **Should the Special have to be armed *before* the line starts?** Right now you
  can arm it mid-line and still get 1.8× on that line. Arguably it should commit you
  before you know how the line is going.
- **Does the pending/correct grey contrast carry?** Still open from #2 and still
  unanswered — the burst gave the eye somewhere else to go, which does not settle it.
- **Next.js 16.3 vs `@opennextjs/cloudflare`** — still open from the scaffold
  session. Verify before Milestone 4 and pin versions.
- **CI still does not exist** (#1). The gate above runs on your machine only.

## Next steps

1. **Merge [PR #16](https://github.com/ananthanandanan/TypeFeud/pull/16)** if it is
   still open, and update SPEC §4.2 with `resolveLine`'s real signature.
2. **#4 — three-line choice with first-keystroke lock-in.** Three options visible at
   all times; the first keystroke matching a line's first character locks it in and
   dims the rest; all three refresh on completion (SPEC §2.3). Watch the failure
   mode SPEC §9 names: if players always take the first line, the mechanic needs
   rework.
3. **#1 — CI and repo-wide linting**, still unblocked and still worth doing early.
4. The design pass still has no issue. It would now be **#17** — PR #16 took the
   number that was earmarked for it.
