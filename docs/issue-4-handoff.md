# Handoff — #4: three-line choice with first-keystroke lock-in

**Crux:** Three options now stand at all times, one per tier. The first keystroke
matching a line's first character locks that line in, dims the other two, and
counts as the line's first character. Enter deals three more. Milestone 2 is open.
**Branch:** `feat/three-line-choice`, closing
[issue #4](https://github.com/ananthanandanan/TypeFeud/issues/4)
**Plan:** `docs/plan/three-line-choice.html` (approved before any code was written)
**Date:** 2026-08-26
**Working dir:** `/Users/ananthan2k/Gitrepos/TypeFeud`

---

## Where the project is

```
M1 — Feel        #2, #3 done; #1 (CI) still open and unblocked
M2 — The Arc     #4 done ← here; #5 (full match flow) is next
```

**Next is [issue #5](https://github.com/ananthanandanan/TypeFeud/issues/5) — the
full match flow: `tickRound`, `resolveMatch`, rounds, timers, HP and outcome.** It
is the one that turns this loop into a match, and it will almost certainly take
over the enter key (see "Enter deals" below).

## What was built

**Content — `packages/content/src/pool.ts`, `deal.ts`.** `linesForRound` became
`linesFor({ arena?, round?, tier? })`, one query surface over the committed JSON.
`dealThree(query, seen, rng)` deals one line per tier.

Two rules inside the dealer, both about lock-in being unambiguous:

- It skips ids in `seen` (`PlayerState.seenLineIds`, which `resolveLine` already
  maintains), and repeats rather than dealing an empty slot when a tier runs dry.
- It prefers **three distinct first characters**, and fills the
  **most-constrained tier first** to get them. This second half was not in the
  plan — it came out of running the loop end to end and watching deal 2 of a match
  serve a "Y" combo next to the only "Y" haymaker left. Three of the six debate
  lines start with "Y", so a naive jab-first pass collides constantly.

`rng` is a parameter, not `Math.random`. #6 drops a seeded PRNG in and no call site
changes. The dealer lives in content rather than game because game must not know
the pool exists.

**Engine — `packages/game/src/engine.ts`.** Two new pure functions:

- `lockIn(state, ev)` — finds the option whose first character was typed, starts
  progress on it, and then applies the keystroke, so the locking character is the
  line's first character rather than a free one. Case-insensitive match, verbatim
  apply: typing `w` at `WHAT` locks the line in and marks one error that backspace
  repairs. The strict alternative — ignore the keystroke — reads as a broken
  keyboard with the round clock running, and invariant 6 points the same way.
- `dealOptions(state, slot, options)` — three fresh options, `progress` cleared.
  This is the other half of `resolveLine` leaving the finished line standing: the
  line survives the impact beat, and the deal is what ends it.

`applyKeystroke` now delegates to `lockIn` when nothing is locked in, so there is
still exactly one keystroke entry point for both apps to share at Milestone 3.

**UI — `apps/web/src/components/option-cards.tsx`, `typing-stage.tsx`.** The
three-card row from the fight-screen artboard: tier, base damage, the line. On
lock-in the chosen card takes the `you` border and a LOCKED IN label; the other two
drop to 40% opacity rather than disappearing or recolouring, so they stay legible
and nothing signals by hue alone (SPEC §6.7). Cards are not focusable and have no
click handler — the choice is made by typing, and the keyboard stays in `LineRun`'s
single listener.

`typing-stage.tsx` lost its `candidates()` fallback ladder and its `run.index` walk
through a line list. The remount key is now a `generation` counter bumped by every
deal, which is still what resets the per-line clock.

## Decisions worth knowing

**SPEC §2.3 moved.** It did not say what happens when two options share a first
character, or whether the locking keystroke counts as typed. Both are now written
down there, along with the tier-order tie-break as the floor. §4.2 gained `lockIn`
and `dealOptions`.

**`?tier=` changed meaning.** It used to filter which line was served; with three
tiers on offer that is meaningless, so it now deals all three slots from one tier —
a dev override for testing a tier in isolation. It defaults to unset, which is why
`DEFAULT_FLAGS.tier` is no longer `"haymaker"`.

**Enter deals, rather than time dealing.** Today enter deals the next three. #5's
round clock will want to deal automatically once the impact beat finishes; keeping
it manual for one more issue meant no animation-timed state transition to debug on
top of a new mechanic.

## What was not done, and why

- **Seeded selection and the cross-match ring buffer (SPEC §3.6)** are #6. Repeats
  are prevented within a match only.
- **No React rendering test.** SPEC §7.3 puts the test weight in `packages/game`
  and rules out E2E for v1; `apps/web` has no DOM test setup and this issue did not
  add one. The loop was verified end to end headlessly instead — deal, lock in,
  type at 90 WPM, resolve, deal again — which is what found the collision bug.
- **Not hand-checked in a browser.** The Chrome extension was not connected in this
  session, so the interactive check that #2 and #3 got did not happen here. The
  server-rendered page was checked for the three cards and the pre-lock-in state,
  and the mechanic itself is covered by the headless run and the engine tests. It
  is still worth a minute at `localhost:3000/?round=1` before merge.

## The open question this issue could not answer

SPEC §9's named failure mode: **does anyone ever pick anything but the safe line?**
This issue cannot tell you. The damage numbers that make a haymaker worth its risk
are #12's to tune, there is no opponent pressure until #7, and the debate pool is
six lines deep, so the second deal of a match is nearly forced. What #4 owes the
question is that the choice is legible — three cards, three damage numbers, one
keystroke — and that much is true. A verdict comes after #7 and #11.
