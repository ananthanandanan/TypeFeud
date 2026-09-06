# TypeFeud

A two-player online typing game. Two stick figures have an argument that escalates
over three rounds — **debate → roast → fistfight** — and typing performance drives
the outcome. All text is pre-authored; players are performers delivering lines, not
authors composing them.

> TypeRacer *measures* you. TypeFeud *casts* you — as the person in the argument,
> winning or losing it in public, in front of an audience.

**Status:** Milestone 1 done. You can type a line in the browser and it feels good —
which was the milestone's whole exit criterion. Nothing resolves yet: finishing a
line shows a readout, not damage.

**Next action is [issue #3](https://github.com/ananthanandanan/TypeFeud/issues/3)** —
damage and momentum on line completion. See [`TASKS.md`](./TASKS.md) for the
14-issue board, [`docs/handoff.md`](./docs/handoff.md) for
what the last session decided, and [`docs/design/README.md`](./docs/design/README.md)
for the design system.

The full design and technical spec is [`SPEC.md`](./SPEC.md). It is the source of
truth — this README is the operator's manual.

---

## Quick start

```bash
pnpm install
pnpm dev        # web on :3000, ws server on :3001
```

No Docker, no database, no external services. Node 22+ and pnpm 11+.

```bash
pnpm test        # vitest across all packages
pnpm typecheck   # tsc --noEmit across all packages
pnpm build       # next build
pnpm lint
```

Single package:

```bash
pnpm --filter @typefeud/game test
pnpm --filter @typefeud/game test:watch
```

---

## Layout

```
typefeud/
├─ apps/
│  ├─ web/            Next.js App Router, TS, Tailwind — the client
│  └─ server/         Node + ws, authoritative game server (Milestone 3)
├─ packages/
│  ├─ game/           PURE game logic — no I/O, no DOM, no network
│  ├─ protocol/       wire message types + zod schemas + Transport interface
│  └─ content/        JSON pools + schema + validator
├─ scripts/           offline LLM content-authoring pipeline (not yet written)
└─ SPEC.md            the source of truth
```

### `packages/game` is the load-bearing decision

Pure functions, imported by **both** client and server. This makes it structurally
impossible for the two to disagree about what a haymaker is worth, and eliminates
the bug class where the loser's screen says they won.

Two rules apply to everything in that package, without exception:

1. **No I/O.** No DOM, no network, no filesystem.
2. **Deterministic.** Time and randomness arrive as parameters. Never call
   `Date.now()` or `Math.random()` inside. This is what makes replay possible, and
   retrofitting it later is miserable work.

Most of the test suite should live here.

---

## What is already implemented

| Area | State |
|---|---|
| `packages/game` — tuning constants (§2.5–2.8) | done |
| `packages/game` — damage math + spec worked examples as tests | done |
| `packages/game` — state types | done |
| `packages/game` — `applyKeystroke` + `progress.ts` derivations | done |
| `packages/game` — `resolveLine` / `tickRound` / `resolveMatch` | **stubs that throw** — #3 and Milestone 2 |
| `packages/protocol` — full wire schema (§4.4) + `Transport` interface (§4.6) | done |
| `packages/content` — schema, mechanical validator, CI test over `pool/` | done |
| `packages/content` — actual writing | 7 dev-fixture lines only; ~850 needed |
| `apps/server` — `NodeWsTransport`, ping/pong | done |
| `apps/server` — rooms, queue, matchmaking | Milestone 3–4 |
| `apps/web` — typing surface (§6.2), live WPM/error readout | done |
| `apps/web` — dev flags + tuning panel (§7.2) | done |
| `apps/web` — three-line choice, HP bars, match flow | Milestone 2 |

`pnpm test` is green (42 tests). The remaining stubs in `packages/game/src/engine.ts`
throw `not implemented` on purpose — the signatures are fixed first because both
apps code against them.

### Dev shortcuts

```
?bot=1                        ghost opponent (inert until #7)
?round=0..3                   0 trigger, 1 debate, 2 roast, 3 fight
?tier=jab|combo|haymaker      which tier of line to serve
?tuning=1                     open the tuning panel on load
```

Backtick toggles the tuning panel, enter advances a line, esc restarts it.

---

## Build order

Do **not** build the game and then add multiplayer. From SPEC §8:

| Milestone | Scope | Exit criterion |
|---|---|---|
| **1 — Feel** ✅ | single-player, one prompt, correctness, WPM, backspace cost, error damage. Ugly HTML. | typing feels good — **met 2026-08-26** |
| **2 — The Arc** | three-line choice, momentum, scripted ghost opponent, all three rounds | the escalation lands; HP/damage/timers tuned |
| **3 — Multiplayer** | stand up `apps/server`, swap ghost's trace source for a live socket | two browser tabs play a full match |
| **4 — Matchmaking + Cloudflare** | queue, rooms, reconnect, ghost fallback — built directly as Durable Objects | — |
| **5 — Art** | Rive, animation states, backdrops, sound | — |
| **6 — Clips** | replay storage, `/r/[matchId]`, GIF/MP4 export | — |
| **7 — Content scale** | arenas 2 and 3 written, `responseTo` pairing | — |

Milestone 1 is 90% of the game. If typing does not feel good there, no amount of
animation will save it.

---

## Content

Content is the product, not decoration. The pipeline is an **offline authoring
tool** — there are no LLM calls at match time (SPEC §3.2), because runtime
generation breaks replay determinism, adds latency, costs money per match, and
ships unvetted insults into a PvP context.

```
scripts/generate-content.ts  (draft)
  → packages/content/drafts/   git-ignored
  → HUMAN REVIEW               ← the actual quality gate
  → packages/content/pool/     committed, source of truth
  → pnpm --filter @typefeud/content test   (word counts, tier bounds, dupes)
```

Line ids are `<arena-without-underscores>-<round>-<tier>-<nnn>`, e.g.
`groupchat-debate-haymaker-001`. (SPEC §3.3 sketches `grpchat-debate-hay-014`
with abbreviations; the validator standardises on unabbreviated ids.)

---

## Conventions that are not negotiable

These come straight from SPEC §11. Breaking one is a design change, not a
refactor:

1. All text is pre-authored and human-reviewed. No runtime LLM calls.
2. Game logic is pure and deterministic, shared by client and server.
3. Progress snapshots at ~10Hz. Never stream keystrokes. Never send animation
   events — derive animations from progress.
4. Server is authoritative for text, clock, and outcome.
5. Uncorrected errors cost damage but never block progress; backspace costs time
   only. Never penalise both the error and the correction.
6. No database in v1.
7. Timing is deadline-based. There is **no server tick loop** — one timer per
   round boundary, nothing else.
8. Room logic sits behind the `Transport` interface so Node and Durable Objects
   stay interchangeable.

---

## Known risks

- **Next.js 16 vs OpenNext.** The scaffold is on Next 16.3. SPEC §10.6 warns that
  `@opennextjs/cloudflare` is a community adapter that can lag Next releases —
  verify adapter support before Milestone 4, and pin versions.
- **Round-3 sabotage and screen shake must never obscure the player's own text.**
  Effects render behind the typing surface or outside its bounding box (SPEC §6.5).
