# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before writing code: run `/ank:tasks`

The repo is a green scaffold with no game logic. Work has not been broken into
issues yet, and the user deliberately deferred that step (see
`docs/scaffold-handoff.md`). If asked what to work on or to start building, the
answer is `/ank:tasks` — not `engine.ts`, not an implementation plan. Do not
offer to re-run `/ank:spec`; `SPEC.md` was hand-written and is already approved.

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

`packages/game/src/engine.ts` holds four exported stubs that throw
`not implemented`. That is intentional: the signatures were fixed first because
both apps code against them. Filling them in is Milestone 1–2 work.

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
  in resolution code, so the dev tuning panel can drive them.
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
