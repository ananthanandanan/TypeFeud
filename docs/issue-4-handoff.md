# Handoff — #4: three-line choice with first-keystroke lock-in

**Crux:** Three options now stand at all times, one per tier. The first keystroke
matching a line's first character locks that line in, dims the other two, and
counts as the line's first character. Enter deals three more. Milestone 2 is open.
**Merged** as [PR #17](https://github.com/ananthanandanan/TypeFeud/pull/17)
(`65a1faa`) on 2026-08-26, closing
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

**The first deal is deterministic, then re-dealt on mount.** A random deal in
`useState`'s initialiser runs on the server and again on the client, hands React
two different sets of three lines, and blows up hydration — which is exactly what
happened the first time the page was opened in a browser. `TypingStage` now deals
with `rng = () => 0` for the render the server sends, and re-deals for real in a
mount effect. #6 deletes this: with a seed on the state both sides deal the same
three and the effect goes away.

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
**Hand-checked at `?round=1` before merge**, and worth knowing that this is what
found the hydration bug — the headless SSR check could not, because the mismatch
only exists once a browser reconciles the markup. The mechanic itself reads
correctly: three cards, lock-in on the first matching character, the other two
dimming, damage landing, enter dealing three more.

## Two things the hand-check surfaced for #5

**HP hits 0 and nothing happens.** Expected — `tickRound` and `resolveMatch` are
still stubs, and nothing reads HP after `resolveLine` subtracts it. Worth knowing
before #5 starts: SPEC §2.7 ends **only round 3** on KO. Rounds 1 and 2 hold their
own 100 HP pools and are decided by who has more HP at the timer, so an opponent on
0 in the debate round should *not* end anything. What should happen there instead —
presumably clamp at 0 and run to the timer — §2.7 does not say. #5 has to decide it
and write it into the spec.

**Enter still deals.** #5's round clock will want to deal automatically once the
impact beat finishes; the manual key was a deliberate one-issue simplification.

## The open question this issue could not answer

SPEC §9's named failure mode: **does anyone ever pick anything but the safe line?**
This issue cannot tell you. The damage numbers that make a haymaker worth its risk
are #12's to tune, there is no opponent pressure until #7, and the debate pool is
six lines deep, so the second deal of a match is nearly forced. What #4 owes the
question is that the choice is legible — three cards, three damage numbers, one
keystroke — and that much is true. A verdict comes after #7 and #11.
