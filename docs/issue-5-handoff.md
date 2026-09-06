# Handoff — #5: full match flow with rounds, timers, HP and outcome

**Crux:** The loop is a match. Arena reveal → trigger → debate → intermission →
roast → intermission → fight → results, run off deadlines with no tick loop, with
rounds 1–2 holding their own HP pools and paying the winner +10 into the fight.
`packages/game` has no stubs left.
**Plan:** `docs/plan/full-match-flow.html` (approved before any code was written)
**Date:** 2026-09-06
**Working dir:** `/Users/ananthan2k/Gitrepos/TypeFeud`

---

## Where the project is

```
M1 — Feel        #2, #3 done; #1 (CI) still open and unblocked
M2 — The Arc     #4, #5 done ← here; #6, #7, #8, #9 open
```

**#7 (the scripted ghost) is the one to do next.** Solo, the opponent never
attacks, so every round is won by default and the only way to lose is to
self-damage your way to 0. The flow is proven; the *contest* is not, and SPEC §9's
named failure mode — does anyone ever pick anything but the safe line? — still
cannot be answered without pressure on the other side of the screen.

**#6 is the cheaper one** and deletes real debt: the hydration workaround in
`use-match.ts` (`FIRST_DEAL`) goes away the moment the deal is seeded.

## What was built

**Engine — `packages/game/src/engine.ts`.** Four functions, two of which were the
last stubs in the package:

- `tickRound(state, now)` — the round's end condition and nothing else. Three ways
  to end: the deadline, a player at 0 HP, and the trigger's quick-draw. Returns the
  argument unchanged while the round is live, so a caller can skip a render. It is
  called on every keystroke and once at the round boundary, and it is **not a loop**.
- `roundResult(state)` — the read side, null while the round is live, in the same
  spirit as `progress.ts` reading `LineProgress`.
- `startingHp(round, results, slot, tuning?)` — the §2.7 carry. Takes the round it
  is opening because only the fight carries anything.
- `resolveMatch(rounds)` — the fight decides the match; the earlier rounds have
  already paid out as the HP the fight opened with.

`RoundState` gained `status: "live" | "over"`. That is what `tickRound` moves and
what stops a finished round being resolved twice.

**Match sequence — `apps/web/src/match/machine.ts`.** A pure reducer over the
phases, holding the round-scoped view state (`lineOutcome`, `lastKeyAt`,
`generation`) alongside the sequence so that opening a round clears all of it in
one transition rather than in a chain of effects racing each other. React-free and
free of `Date.now()` — the clock arrives as an action parameter, the same way
`packages/game` takes `now`. #13 should be able to move this file rather than
rewrite it.

**Clock and side effects — `apps/web/src/match/use-match.ts`.** Everything impure.
One `setTimeout` per round boundary as the backstop for a round nobody is typing
in, one for the arena reveal, one for each intermission, one for the impact beat.
`live.current` holds what the timers read so a keystroke does not tear down and
rebuild every timer.

**UI.** `match-hud.tsx` is the three-column HUD from `Main.dc.html`; `match-stage.tsx`
switches on the phase; `trigger-round.tsx` and `match-end.tsx` are the two new
surfaces. `typing-stage.tsx` lost its state, its keyboard and its fighter bars and
is now the round surface only.

## Decisions worth knowing

**SPEC §2.7 moved — a 0-HP player ends *any* round.** This is the decision #4
handed to #5. HP never rises and the carry is binary (+10 or nothing, not
HP-proportional), so the moment a player reaches 0 the round's winner is
arithmetically fixed and the seconds still on the clock cannot change it. Rounds 1
and 2 therefore end early and advance; only round 3's knockout ends the match. The
alternative — clamp at 0 and play the round out — is one condition in `tickRound`
and stays cheap to reverse if #7's pressure makes the dead time worth keeping.

Two smaller rules went in beside it because the code had to pick something:
**equal HP is a draw and carries nothing**, and **momentum does not survive a round
boundary** (a fresh pool gets a fresh meter; a Special banked at the end of the
roast opening the fight cuts against the fight being where the match is decided).

**SPEC §2.2 moved — the trigger is a quick-draw, and the walk-through is what
caught it.** Nothing in the code made the trigger different from a 45-second
damage round, so it ran its full 2 seconds and let the word be typed three times
for 24 damage. §2.2 says *first* to type it correctly wins, which is a third end
condition, now in `tickRound`.

**The trigger's winner is read from progress, not HP** — and this is the part worth
remembering. Deciding it on HP made the answer depend on whether the caller
resolved the completing line before ticking or after: the quick-draw closes the
round on that keystroke, and if the damage had not landed yet both players sat at
100 and the +5 went to nobody. That is a footgun every future caller would have to
know about, so `roundResult` reads the trigger from `hasCompletedLine` instead.
Both orders now agree, and trigger damage is discarded with the round's pool.

**The countdown is a render, not a tick.** `RoundClock` runs a 100ms interval, and
it would be easy to read that as the loop invariant 8 forbids. It paints a number
derived from `endsAt` and the round's start and never touches game state — §4.6
puts the countdown on the client for exactly this reason. It also means a
backgrounded tab that throttles the interval catches up the moment it is looked at
again, rather than drifting.

**HP bars scale against the round's pool.** Round 3 opens above 100, so a bar
clamped to 100 would render the carried advantage as a full bar that cannot move
until it has been spent — the one place the +10 is visible would be the one place
it is invisible.

## What was not done, and why

- **No ghost, so the match is not a contest.** The opponent's HP only moves when
  you land a line. Every round is won by default. This is #7 and it is the next
  thing that should happen.
- **Rounds 2 and 3 serve debate lines.** The pool has one trigger line and six
  debate lines; roast and fight are unwritten. `dealThree`'s `candidates()` already
  widens when a round runs dry, so the match walks end to end — it just reads as
  the same six lines three times. #11 fills it. Authoring lines here would have put
  content review inside a flow PR.
- **The trigger has no provocation.** §2.2 wants "dev_p has left you on read for 4
  hours" above the word. The pool has the word and not the setup, and the schema
  has no field for arena-level framing. The word stands alone rather than under an
  invented line, which invariant 3 forbids. #11.
- **The intermission is a beat, not a screen.** The phase holds its 10 seconds and
  shows the round result, the carry — the only place the player learns why the
  fight opens above 100 — and a countdown to the next round. The taunt exchange is
  #8, and the space it will occupy is left empty rather than captioned: unbuilt
  work belongs in the issue tracker, not on the player's screen.
- **`match-end.tsx` is not the results screen.** #9 replaces the file. It shows the
  winner and the per-round HP so a hand-check can tell a fight won on HP from one
  won by knockout.
- **No React rendering test.** SPEC §7.3 puts the test weight in `packages/game`
  and rules out E2E for v1. The flow was verified headlessly instead — a full match
  driven through the real reducer and the real engine at ~90 WPM, which is what
  found the trigger bug. `packages/game` is at 90 tests.

## Verification

`pnpm test` (119 across all packages), `pnpm typecheck`, `pnpm lint` and
`pnpm build` all pass. The headless walk-through ends:

```
phase: results
  trigger  100 — 100  winner=0
  debate   100 — 0    winner=0
  roast    100 — 0    winner=0
  fight    125 — 0    winner=0
```

`125` is the carry working: 100 base + 5 trigger + 10 debate + 10 roast, the
ceiling §2.7 describes. The trigger closing at 100 — 100 with a winner is the
quick-draw working — it ended on the completing keystroke and its damage was
discarded with the pool.

**Not hand-checked in a browser.** The Chrome extension was not connected in this
session, so the runtime was exercised headlessly and through the build rather than
by playing it. Worth doing before the next issue builds on top: `pnpm dev`, then
`?round=0` for the whole arc, and note that the arena reveal costs 3 seconds on
every reload.

## The open question this issue could not answer

Still SPEC §9's, and still for the same reason #4 gave: there is no opponent
pressure. What #5 adds to the question is that the clock is now real — a haymaker
that takes 20 seconds is 20 seconds not spent landing jabs, which is the actual
cost the choice is supposed to weigh. That cost cannot be felt against an opponent
who never attacks. A verdict comes after #7 and #11.
