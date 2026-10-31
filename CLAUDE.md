# CLAUDE.md

## Start here

**Read [`docs/handoff.md`](./docs/handoff.md) first.** It says where the project is
and what to build next; this file carries only the standing rules. Planning is
finished: `SPEC.md` is approved and `TASKS.md` maps T-01…T-14 to GitHub issues
#1–#14. Do not run `/ank:spec` or `/ank:tasks` again. If asked what to build, the
answer is code.

Issues are cut **vertically**: one issue = one PR = one demoable thing. Engine work
and the UI that renders it ship together. Do not split a task into an engine PR and
a UI PR.

## Commands

Node 22+, pnpm 11.18.0 (pinned in `package.json`). No Docker, no database, no
external services.

```bash
pnpm install
pnpm dev          # turbo: web on :3000, ws server on :3001
pnpm lint         # eslint in every workspace + prettier --check
pnpm format       # prettier --write .
pnpm test         # vitest across all packages
pnpm typecheck    # tsc --noEmit across all packages
pnpm build        # next build

pnpm --filter @typefeud/game test -- test/damage.test.ts -t "haymaker"   # single file / single test
pnpm --filter @typefeud/game test:watch
pnpm --filter @typefeud/content validate                                 # content pool gate
```

CI (`.github/workflows/ci.yml`) runs lint, test, typecheck, validate, build in
that order on every push and PR.

## Source of truth

- `SPEC.md` is the design and technical spec; code comments cite its sections
  (`SPEC §2.5`). When a change contradicts the spec, the spec moves too. Say so
  rather than silently diverging.
- `docs/handoff.md` is the one handoff. Rewrite it in place at the end of an
  issue; never add a second dated handoff beside it. Per-issue detail lives in git
  history and the approved plan under `docs/plan/`.
- The visual system is settled on the design canvas at
  <https://claude.ai/code/artifact/5c1997e1-3227-48cd-9f5b-643510e5db82> (source in
  `docs/design/canvas/`). Read `docs/design/README.md` (palette, type ramp, the two
  non-negotiable rules) before building any UI. Do not re-derive colours from a
  mockup.

## Architecture rules

- `packages/game` (pure logic) is imported by **both** `apps/web` and
  `apps/server`. `packages/protocol` holds zod schemas for every wire message; both
  ends validate at the boundary, in both directions.
- Internal packages are consumed as **TypeScript source** (`"main":
  "./src/index.ts"`, all tsconfigs `noEmit`). Do not add a build step.
- **Imports inside the internal packages carry no file extension.** Turbopack will
  not resolve `./damage.js` to `damage.ts`, and the web build fails on the first
  import of `@typefeud/game` if you add one.
- Every key goes through `applyKeystroke`; it delegates to `lockIn` when no line is
  locked in (SPEC §2.3).
- `resolveLine` leaves `progress` standing. Resolve each completed line exactly
  once; resolving twice charges the damage twice. `dealOptions` is what clears it.
- Which three lines get dealt is `dealThree` in `packages/content`. `packages/game`
  may not know the pool exists; randomness arrives as a parameter.
- The typing surface renders from `packages/game/src/progress.ts` helpers, never by
  reaching into `LineProgress` directly.

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
10. **Round-3 sabotage and screen shake never obscure the player's own text.**
    Effects render behind the typing surface or outside its bounding box.

## Conventions

- Every tunable number lives in `packages/game/src/tuning.ts`, never as a magic
  number in resolution code. Functions that read a tunable take a `Tuning` argument
  defaulting to `DEFAULT_TUNING` and never read the module constants directly.
- Dev shortcuts (SPEC §7.2) live in `apps/web/src/dev/flags.ts` and its header
  comment lists them. Add new ones there.
- Content line ids are `<arena-without-underscores>-<round>-<tier>-<nnn>`, e.g.
  `groupchat-debate-haymaker-001`. The validator uses this unabbreviated form, not
  SPEC §3.3's sketch.
- Tests live in `test/*.test.ts` per package. Test weight belongs in
  `packages/game`; SPEC §7.3 orders the priorities and rules out E2E browser tests
  for v1, so verify UI changes by running the app.
- SPEC §2.5's worked examples are encoded in `packages/game/test/damage.test.ts`.
  If those numbers move, the spec moves too.
- Build order is by milestone (SPEC §8). Do not build the single-player game and
  then bolt on multiplayer.
- Commits use history's prefixes (`feat:`, `chore:`, `docs:`) and carry no
  tooling metadata, session trailers, or co-author/generated-by lines. PRs link
  the issue, describe behaviour and validation, and include screenshots for visual
  changes.
- Before Milestone 4, verify `@opennextjs/cloudflare` supports the Next.js version
  in use and pin both.

## Working rules

- Before saying a task is done, run `pnpm lint`, `pnpm test`, `pnpm typecheck`,
  `pnpm --filter @typefeud/content validate` and `pnpm build` (CI's gate) and
  report what ran and what passed. If you could not run a check, say so plainly.
  Never write "should work" in place of a result.
- Change only what the task needs. No drive-by refactors, renames, reformatting, or
  dependency bumps. If you spot an unrelated problem, mention it at the end of your
  reply instead of fixing it.
- Write the simplest code that solves the task. No abstractions, config options, or
  fallback paths for cases the task doesn't have. Three similar lines are better
  than a premature helper.
- If a requirement can be read two ways and the readings lead to different code,
  ask one question before building. If the choice is low-stakes or easy to reverse,
  pick the conventional option and say which one you picked.
- When two approaches are both correct, choose the one that is better for the
  player, then for the developer who maintains it, then for the next agent that
  reads it. If those pull in different directions, name the trade-off in your
  reply. "Don't break anything" means existing tests pass and the engine exports,
  wire schemas, dev flags, and localStorage data stay compatible unless the task
  says otherwise.
- For a feature you haven't built before, search GitHub and npm for existing
  implementations first. Compare two or three approaches in a short note, then
  build. Prefer a maintained library over hand-rolled code unless the dependency
  cost is higher than the code.
- Cut taglines, helper text, and secondary labels. If a screen needs them to make
  sense, fix the layout instead. Every visible string must be the label, the data,
  or the error.
- Never edit this file to make it match what you just did. If a rule here is wrong
  or blocks the task, stop and propose the change to the user.

