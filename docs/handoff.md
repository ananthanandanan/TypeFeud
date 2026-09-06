# Handoff

**One document, kept current.** It says where the project is, what to do next, and
which past decisions still constrain the work. It is rewritten in place at the end
of each issue rather than added to — per-issue handoffs are in git history, and
`SPEC.md` plus the code comments remain the source of truth for *why* anything
works the way it does.

**Last updated:** 2026-09-06, after #5 merged.
**Working dir:** `/Users/ananthan2k/Gitrepos/TypeFeud`

---

## Where the project is

```
M1 — Feel        #2 #3 done          · #1 (CI) open, unblocked
M2 — The Arc     #4 #5 done ← here   · #6 #7 #8 #9 open
M3 — Multiplayer #12 #13 #14 open
```

A full match runs solo, start to finish: arena reveal → trigger → debate →
intermission → roast → intermission → fight → results. `packages/game` has no
stubs left. #5 merged as
[PR #18](https://github.com/ananthanandanan/TypeFeud/pull/18) (`81c8bbc`).

Merged so far: #2 → [PR #15](https://github.com/ananthanandanan/TypeFeud/pull/15),
#3 → [PR #16](https://github.com/ananthanandanan/TypeFeud/pull/16),
#4 → [PR #17](https://github.com/ananthanandanan/TypeFeud/pull/17),
#5 → [PR #18](https://github.com/ananthanandanan/TypeFeud/pull/18). Each has a plan
in `docs/plan/`.

## What to do next

1. **[#7 — the scripted ghost](https://github.com/ananthanandanan/TypeFeud/issues/7).**
   The one that makes this a game. Solo, the opponent never attacks, so every round
   is won by default and the only way to lose is to self-damage to 0. The flow is
   proven; the *contest* is not. SPEC §9's named failure mode — does anyone ever
   pick anything but the safe line? — cannot be answered until there is pressure on
   the other side of the screen, and #5 sharpened the question by making the clock
   real: a haymaker that takes 20 seconds is 20 seconds not spent landing jabs.
2. **[#1 — CI](https://github.com/ananthanandanan/TypeFeud/issues/1).** Small,
   unblocked, and overdue. `pnpm test && pnpm typecheck && pnpm build` as a GitHub
   Actions job body. Four PRs have now merged on the strength of those commands
   passing on one machine.
3. **[#6 — seeded selection](https://github.com/ananthanandanan/TypeFeud/issues/6).**
   Cheap, and it deletes real debt: the `FIRST_DEAL` hydration workaround in
   `apps/web/src/match/use-match.ts` exists only because the deal is unseeded.
4. **[#11 — content](https://github.com/ananthanandanan/TypeFeud/issues/11)** is
   what makes the game readable rather than mechanical. See the gaps below.

## Decisions that still bind

Carried forward because they constrain what can be built next, not as a record of
what happened. Each is also written into `SPEC.md`.

**`packages/game` is pure and the round is deadline-based.** `tickRound(state, now)`
is the round's only end condition — the deadline, a player at 0 HP, or the trigger's
quick-draw — and it runs on keystrokes plus **one `setTimeout` per round boundary**.
There is no tick loop and there must never be one (invariant 8, SPEC §4.6). The HUD
countdown is a render that paints a number and touches no game state; do not read
its 100ms interval as permission to add a real one.

**A 0-HP player ends any round, not only round 3** (SPEC §2.7, decided in #5). HP
never rises and the carry is binary, so a knockout fixes the round's winner and the
remaining seconds cannot move it. Equal HP is a draw and carries nothing. Momentum
does not survive a round boundary. The alternative — clamp at 0 and play the round
out — is one condition in `tickRound` and stays cheap to reverse if #7's pressure
makes the dead time worth keeping.

**The trigger's winner is read from progress, not HP** (SPEC §2.2, decided in #5).
Deciding it on damage made the answer depend on whether the caller resolved the
completing line before ticking or after — the quick-draw closes the round on that
keystroke, and if the damage had not landed both players sat level and the +5 went
to nobody. Any future caller, the server included, gets the same answer either way
now. Trigger damage is discarded with the round's pool.

**`resolveLine` leaves `progress` standing, so the caller must resolve each
completed line exactly once** (decided in #3). Clearing it would blank the typing
surface at the moment the impact beat plays. Nothing in the state records that
resolution ran, so **resolving twice charges the damage twice**; `use-match.ts`
guards with a ref. If that needs to be structural — and it probably does once the
server resolves too — the fix is a `resolvedAt` field on `LineProgress`.

**Every tunable is injected, never read from module constants** (decided in #2).
Functions take a `Tuning` defaulting to `DEFAULT_TUNING`. This is what lets the dev
panel drive the live math without making the package mutable.

**Match sequence and match rules live in different places.** Round rules — the
carry, the winner, the end condition — are in `packages/game`. The phase sequence
is `apps/web/src/match/machine.ts`, kept pure and React-free with the clock as an
action parameter, so **#13 can move that file to the server rather than rewrite
it**. `use-match.ts` is the only impure half.

**Effects must never reach the text** (design rule 2, SPEC §6.5). The impact burst
renders in a fixed-height band outside the typing panel's bounding box —
structurally unable to overlap it, not merely positioned so it doesn't. Round 3
sabotage and screen shake inherit this.

**Imports inside internal packages carry no file extension.** Turbopack will not
resolve `./damage.js` to `damage.ts` in a transpiled source package and the web
build dies on the first import of `@typefeud/game`.

**Commit messages carry no tooling metadata** — no session URL, no co-author or
generated-by line.

## Known gaps, all deliberate

- **No opponent.** The ghost is #7. Momentum, HP and the Special all work for
  either slot in the engine; nothing drives slot 1. `?bot=1` only relabels the bar
  and says so in the footer.
- **Rounds 2 and 3 serve debate lines.** The pool holds one trigger line and six
  debate lines; roast and fight are unwritten. `dealThree`'s `candidates()` widens
  when a round runs dry, so a match walks end to end — it just reads as the same
  six lines three times. #11.
- **The trigger has no provocation.** SPEC §2.2 wants "dev_p has left you on read
  for 4 hours" above the word. The pool has the word and not the setup, and the
  schema has no field for arena-level framing. The word stands alone rather than
  under an invented line, which invariant 3 forbids. #11.
- **Intermission is a beat, not a screen.** It holds its 10 seconds showing the
  round result, the carry — the only place the player learns why the fight opens
  above 100 — and a countdown to the next round. The taunt exchange is #8, and the
  space it will occupy is left empty rather than captioned.
- **`match-end.tsx` is not the results screen.** #9 replaces the file wholesale.
- **No KO animation, no sabotage.** SPEC §2.8 is round 3 only and unbuilt.
- **No IME or composition handling**, and **no focus model** — a `window` keydown
  listener types wherever you last clicked. Both belong with #10.
- **No React rendering tests.** SPEC §7.3 puts the weight in `packages/game` and
  rules out E2E for v1. UI is verified by hand and by driving the real reducer
  headlessly.

## Open questions

- **Does anyone ever pick anything but the safe line?** SPEC §9's named failure
  mode, still unanswerable. Needs #7 and #11.
- **Is the speed ceiling too low?** At 89 WPM you are already clamped, so a fast
  typist gets no credit above 84. May be correct — it is the counterweight momentum
  exists to provide — but untested against a range of typists. #12, and the panel
  already drives it.
- **Should the Special have to be armed before the line starts?** Right now you can
  arm it mid-line and still take 1.8× on that line. Arguably it should commit you
  before you know how the line is going.
- **Does the pending/correct grey contrast carry?** `#E8EDF2` against `#5A6672`,
  straight from the design tokens, with only the caret marking progress. Open since
  #2. A design-system question if it does not read, not a code one.
- **Lunge distance and hang time** read well as stills and are unproven in motion.
  Milestone 5.
- **Next.js 16.3 vs `@opennextjs/cloudflare`** — the community adapter can lag Next
  majors. Verify before Milestone 4 and pin versions.

## Verification

`pnpm test` (119: game 90, content 19, protocol 4, web 6), `pnpm typecheck`,
`pnpm lint` and `pnpm build` all pass on `main` as of `81c8bbc`. **These run on
your machine only — #1 does not exist yet.**

A full match driven headlessly through the real reducer and engine at ~90 WPM ends:

```
trigger  100 — 100  winner=0
debate   100 — 0    winner=0
roast    100 — 0    winner=0
fight    125 — 0    winner=0
```

`125` is SPEC §2.7's carry ceiling — 100 base + 5 trigger + 10 debate + 10 roast.
The trigger closing level with a winner is the quick-draw working: it ended on the
completing keystroke and its damage was discarded with the pool.

#5's browser pass was done by the user, not in-session; the two things it caught —
a dead clock and a Special prompt offered where the keyboard is not live — are
fixed.

## Still outstanding

- The **GitHub Project board was never created**; the `gh` token lacks the scope.
  `gh auth refresh -s project,read:project`.
- The **design pass has no issue**. It would be **#19** now.
- **Merged branches are not deleted** on the remote — `feat/typing-surface`,
  `feat/damage-momentum-line-completion`, `feat/three-line-choice`,
  `feat/full-match-flow` all still exist.
