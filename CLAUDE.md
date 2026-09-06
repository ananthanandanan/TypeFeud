# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start here: issue #5

Planning is finished. `SPEC.md` is approved, `TASKS.md` holds 14 tasks, and GitHub
issues **#1–#14** exist mapping T-01…T-14 one-to-one. Do not run `/ank:spec` or
`/ank:tasks` again — both are done.

**Milestone 1 is done.** #2 merged as [PR #15](https://github.com/ananthanandanan/TypeFeud/pull/15)
(`applyKeystroke` and the SPEC §6.2 typing surface) and #3 as
[PR #16](https://github.com/ananthanandanan/TypeFeud/pull/16) (`resolveLine`,
momentum, the Special). A clean haymaker at 89 WPM reads 42 and the opponent drops
to 58, confirmed by hand. See `docs/milestone-1-handoff.md` and
`docs/issue-3-handoff.md`.

**#4 merged as [PR #17](https://github.com/ananthanandanan/TypeFeud/pull/17) on
2026-08-26**, opening Milestone 2 — three options at all times, first-keystroke
lock-in, `lockIn` and `dealOptions` in the engine, `dealThree` in
`packages/content`. Confirmed by hand at `?round=1`. See
`docs/issue-4-handoff.md`, and `docs/plan/three-line-choice.html` for the plan it
was built from.

**#5 is done** — the full match runs arena → trigger → debate → intermission →
roast → intermission → fight → results. `tickRound`, `roundResult`, `startingHp`
and `resolveMatch` are implemented and `packages/game` has no stubs left. The
match sequence is `apps/web/src/match/machine.ts` (pure, React-free, ready for
#13 to move server-side) and the clock is `use-match.ts`. See
`docs/issue-5-handoff.md`.

It moved the spec three times, all written down: §2.7 gained the 0-HP rule for
rounds 1–2 (a knockout ends **any** round, because HP never rises and the carry is
binary) plus the draw and momentum rules; §2.2 gained the trigger's quick-draw end
condition; §4.2 gained `roundResult` and `startingHp`.

**The next coding task is [#7 — the scripted ghost opponent](https://github.com/ananthanandanan/TypeFeud/issues/7)
or [#6 — seeded selection](https://github.com/ananthanandanan/TypeFeud/issues/6).**
#7 is the one that makes the game a contest: solo, the opponent never attacks, so
every round is won by default and SPEC §9's open question — does anyone ever pick
anything but the safe line? — still cannot be answered. #6 deletes the hydration
workaround in `use-match.ts`.

**#1 (CI and repo-wide linting) is still open and unblocked** — `pnpm test &&
pnpm typecheck && pnpm build` as a GitHub Actions job body. Worth doing early so the
gate runs on PRs rather than on your machine.

Issues are cut **vertically**: one issue = one PR = one demoable thing. Engine work
and the UI that renders it ship together. Do not split a task into an engine PR and
a UI PR.

Two things outstanding, neither blocking: the GitHub Project board was never created
(the token needs `gh auth refresh -s project,read:project`), and the design pass has
no issue yet — it would land as #18 now that #4 took #17.

## Commands

```bash
pnpm install
pnpm dev          # turbo: web on :3000, ws server on :3001
pnpm test         # vitest across all packages
pnpm typecheck    # tsc --noEmit across all packages
pnpm build        # next build
pnpm lint         # eslint (apps/web only — no lint config elsewhere)

pnpm --filter @typefeud/game test
pnpm --filter @typefeud/game test:watch
pnpm --filter @typefeud/game test -- test/damage.test.ts -t "haymaker"   # single file / single test
pnpm --filter @typefeud/content validate                                 # content pool gate
```

Node 22+, pnpm 11+. No Docker, no database, no external services.

## Source of truth

`SPEC.md` at repo root is the design and technical spec, and code comments cite
its section numbers (`SPEC §2.5`). When a change contradicts the spec, the spec
moves too — say so rather than silently diverging. `README.md` is the operator's
manual; `docs/scaffold-handoff.md` records what the scaffold session decided and
why.

## Design

The visual system is settled and lives on a canvas at
<https://claude.ai/code/artifact/5c1997e1-3227-48cd-9f5b-643510e5db82> — fight
screen, results, typing surface, impact beat, physics, tokens, figure states, and
match flow. Source is `docs/design/canvas/`; `docs/design/README.md` has the
palette, type ramp, and the two non-negotiable rules. Read it before building any
UI, and do not re-derive colours from a mockup.

## Architecture

Five workspaces, layered so client and server can never disagree:

- `packages/game` — pure game logic (tuning constants, damage math, engine).
  Imported by **both** `apps/web` and `apps/server`.
- `packages/protocol` — zod schemas for every wire message + the `Transport`
  interface. Both ends validate at the boundary, in both directions.
- `packages/content` — line schema, mechanical validator, committed JSON pools.
- `apps/web` — Next.js 16 App Router client.
- `apps/server` — Node + `ws`, authoritative server (Milestone 3).

Internal packages are consumed as **TypeScript source** (`"main": "./src/index.ts"`,
all tsconfigs `noEmit`). There is no build step for them — do not add one; it
exists to keep Milestone 1–3 iteration fast.

`packages/game/src/engine.ts` exports `applyKeystroke`, `lockIn`, `dealOptions`,
`resolveLine`, `triggerSpecial`, `tickRound`, `roundResult`, `startingHp` and
`resolveMatch` — all implemented, no stubs left. The signatures were fixed before
the bodies because both apps code against them.

`resolveLine` is the exception that proves it. Its declared signature could not
survive contact and is now
`resolveLine(state, { now, slot? }, tuning?) => { state, outcome }` — it has to
return new state, and WPM needs the completing keystroke's timestamp, which
invariant 1 forbids the package from reading itself. It also leaves `progress`
standing rather than clearing it, so the caller must resolve each completed line
exactly once; resolving twice charges the damage twice. `dealOptions` is what
clears it and puts the next three lines up.

`applyKeystroke` delegates to `lockIn` when the player has no line locked in, so
every key goes through one entry point (SPEC §2.3). Which three lines get dealt is
`dealThree` in `packages/content` — game may not know the pool exists — and it
takes its randomness as a parameter, ready for #6 to seed.

`packages/game/src/progress.ts` is the read side of that state — `lineCharStates`,
`displayLine`, `uncorrectedErrors`, `createLineProgress`. The typing surface renders
from these rather than reaching into `LineProgress` itself.

## Non-negotiable invariants

Breaking one of these is a design change, not a refactor. From SPEC §11:

1. **`packages/game` is pure and deterministic.** No DOM, no network, no
   filesystem. Never call `Date.now()` or `Math.random()` inside it — time and
   randomness arrive as parameters. This is what makes replay possible.
2. **Non-mutating.** Engine functions return new state, never edit the argument.
3. **All text is pre-authored and human-reviewed.** No runtime LLM calls. The
   `scripts/` pipeline is an offline drafting aid only; `packages/content/drafts/`
   is git-ignored, `packages/content/pool/` is the committed source of truth.
4. **Never stream keystrokes.** Progress snapshots at ~10Hz
   (`{lineId, charIndex, errors}`). Never send animation events — derive
   animations from progress crossing thresholds.
5. **Server is authoritative** for text, clock, and outcome.
6. **Errors never block.** A wrong character marks and advances; backspace
   repairs and costs time only. Never penalise both the error and the correction.
7. **No database in v1.** Per-player state that needs to persist goes in
   localStorage (e.g. the recently-seen-lines ring buffer).
8. **Timing is deadline-based.** One timer per round boundary. There is no server
   tick loop and there must never be one.
9. **Room logic sits behind `Transport`** so `NodeWsTransport` and a future
   `DurableObjectTransport` stay interchangeable.

## Conventions

- Every tunable number lives in `packages/game/src/tuning.ts` — no magic numbers
  in resolution code, so the dev tuning panel can drive them. Functions that read a
  tunable take a `Tuning` argument defaulting to `DEFAULT_TUNING`; they never reach
  for the module constants directly, which is what lets the panel drive the live
  math without making the package mutable.
- **Imports inside the internal packages carry no file extension.** Turbopack will
  not resolve `./damage.js` to `damage.ts` in a transpiled source package, and the
  web build fails on the first import of `@typefeud/game` if you add one. tsc,
  vitest and tsx all resolve extensionless.
- Dev shortcuts (SPEC §7.2) live in `apps/web/src/dev/flags.ts`: `?bot=1`,
  `?round=0..3`, `?tier=jab|combo|haymaker` (deals all three options from one tier,
  for testing it in isolation — unset in normal play), `?tuning=1`. Backtick toggles
  the tuning panel and tab arms the Special when the meter is full. `?round=` now
  seeds where the match *opens* rather than pinning it — `?round=2` still ends at
  the fight. Enter and esc no longer deal: #5 gave that to the round clock, and the
  next three arrive `impactBeatMs` after the line lands.
- Content line ids are `<arena-without-underscores>-<round>-<tier>-<nnn>`, e.g.
  `groupchat-debate-haymaker-001`. SPEC §3.3 sketches an abbreviated form; the
  validator standardises on the unabbreviated one.
- Tests live in `test/*.test.ts` per package (vitest `include` is scoped to that).
  Test weight belongs in `packages/game`; SPEC §7.3 orders the priorities and
  rules out E2E browser tests for v1.
- SPEC §2.5's worked examples are encoded as tests in
  `packages/game/test/damage.test.ts`. If those numbers move, the spec moves too.
- Build order is by milestone (SPEC §8) — do not build the single-player game and
  then bolt on multiplayer.

## Known risks

- Next.js 16.3 vs `@opennextjs/cloudflare`: the community adapter can lag Next
  majors. Verify before Milestone 4 and pin versions.
- Round-3 sabotage and screen shake must never obscure the player's own text —
  effects render behind the typing surface or outside its bounding box.
