# Handoff — TypeFeud repo scaffold

**Crux:** Turned a bare repo containing only a spec into an installable, green pnpm
monorepo. No game logic implemented.
**Branch:** `main` — scaffold committed as the repo's first commit and pushed to
`git@github.com:ananthanandanan/TypeFeud.git` (public)
**Date:** 2026-08-09
**Working dir:** `/Users/ananthan2k/Gitrepos/TypeFeud`

---

## ✅ COMPLETED — this handoff is history, not instructions

**Everything below is a record of the 2026-08-09 scaffold session. Do not act on
it.** Its original "START HERE" block told the next session to run `/ank:tasks`
before any coding. That happened on 2026-08-25:

- `/ank:tasks` ran — `TASKS.md` at repo root, GitHub issues #1–#14 created,
  T-01…T-14 mapping one-to-one with no offset
- the visual design followed — see `docs/design/README.md`
- the board was recut vertically (one issue = one PR = one demoable thing), which
  is why there are 14 issues rather than 25 and no A/B/C/D track structure

```
/ank:third-degree → /ank:spec → /ank:tasks → (build) → /ank:review-board
      done          skipped        done       ← YOU ARE HERE
```

**For what to do next, read `CLAUDE.md`.** Short version: start at issue #2, the
typing surface. Do not re-run `/ank:spec` or `/ank:tasks`.

What is still accurate below: the "Fixes made during scaffold" and "Key decisions"
sections explain why the tsconfigs are `noEmit`, why `engine.ts` exports stubs that
throw, and why content ids are unabbreviated. The "Next steps" list at the bottom is
superseded by `TASKS.md`.

---

## Agenda

Set up README + this handoff + project scaffolding so the next session can start
Milestone 1 immediately. Also decided whether to re-run `/ank:spec` over the
existing spec (no) and when to run `/ank:tasks` (next session).

## Files read

- `typefeud-spec.md` — the full design + technical spec; renamed to `SPEC.md`
- `~/.claude/plugins/marketplaces/ank-skills/skills/engineering/tasks/SKILL.md` — to
  confirm `/ank:tasks` requires `SPEC.md` at repo root and a git remote
- `~/.claude/plugins/marketplaces/ank-skills/skills/engineering/handoff/SKILL.md` —
  format for this document

## Files written / edited

| File | Change |
|---|---|
| `SPEC.md` | renamed from `typefeud-spec.md` (content untouched) |
| `README.md` | new — quick start, layout, implemented-vs-not table, build order, non-negotiables |
| `docs/scaffold-handoff.md` | this file |
| `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore` | new — workspace root |
| `packages/game/src/{tuning,types,damage,engine,index}.ts` | new |
| `packages/game/test/damage.test.ts` | new — 10 tests, includes SPEC §2.5 worked examples |
| `packages/protocol/src/index.ts` | new — full §4.4 wire schema, `Transport` interface, timing constants |
| `packages/protocol/test/schemas.test.ts` | new — 4 tests |
| `packages/content/src/{schema,validate,index}.ts` | new |
| `packages/content/pool/groupchat-debate.json` | new — 7 dev-fixture lines |
| `packages/content/test/pool.test.ts` | new — 5 tests; validates every file in `pool/` |
| `apps/server/src/index.ts`, `apps/server/src/transport/node-ws.ts` | new — ws server + `NodeWsTransport` |
| `apps/web/**` | `create-next-app` output, de-boilerplated |
| `scripts/README.md` | new — documents the unwritten content pipeline |

## Fixes made during scaffold

- `create-next-app` emitted a nested `apps/web/pnpm-workspace.yaml` that would have
  broken the monorepo — deleted. Also removed its `README.md`, `AGENTS.md`, a
  `CLAUDE.md` containing only `@AGENTS.md` (dangling reference), and the demo SVGs.
- `tsc` error TS6059: `rootDir: "src"` conflicted with `include: ["src", "test"]`.
  Removed `rootDir`/`outDir` from all four package tsconfigs — they are all
  `noEmit` (consumed as TS source across the workspace), so neither was doing work.
- `apps/web/src/app/layout.tsx` used `LayoutProps<"/">`, a Next 16 global that only
  exists in generated `.next/types` — so a cold `pnpm typecheck` failed. Replaced
  with an explicit `{ children: React.ReactNode }`.
- pnpm 11 blocked `esbuild` and `unrs-resolver` postinstalls; approved both via
  `allowBuilds` in `pnpm-workspace.yaml`.

## Key decisions

- **Do not re-run `/ank:spec`.** The existing spec is already in ank-spec shape
  (intent → non-goals → binding decisions → build order → deferred/open). Renaming
  it to `SPEC.md` at repo root is all `/ank:tasks` needs.
- **`packages/game` exports API stubs that throw** (`engine.ts`) rather than
  omitting them. Both apps code against those signatures; fixing the shape now is
  the point of the package.
- **Damage math implemented in full**, with SPEC §2.5's three worked examples
  encoded as tests. If those numbers move, the spec moves too.
- **Package tsconfigs are all `noEmit`**; packages are consumed as TypeScript
  source via `"main": "./src/index.ts"`. No build step for the internal packages,
  which keeps Milestone 1–3 iteration fast (SPEC §7.4).
- **Content line ids use the unabbreviated arena slug** (`groupchat-debate-haymaker-001`).
  SPEC §3.3's example uses `grpchat-...-hay-...`; the validator enforces the
  unabbreviated form. Noted in README.
- `packages/content/drafts/*.json` is git-ignored — only human-reviewed pool files
  are committed (SPEC §3.2).

## Current state

Verified, not assumed:

```
pnpm test        → 5 tasks successful; 19 tests passed (game 10, protocol 4, content 5)
pnpm typecheck   → 5 tasks successful
pnpm build       → next build ✓ compiled, 3 static pages
pnpm dev         → web HTTP 200 on :3000, "[server] listening on ws://localhost:3001"
```

Not done: no game logic, no typing surface, no rooms, no queue, no content beyond
7 fixture lines. `apps/web` is a placeholder page.

## Open questions / not done

- **Next.js 16.3 vs `@opennextjs/cloudflare`.** SPEC §10.6 warns the adapter can
  lag Next majors. Verify support before Milestone 4; consider pinning down to a
  supported Next major if it does not.
- No CI workflow yet. `pnpm test && pnpm typecheck && pnpm build` is the obvious
  job body.
- No ESLint/Prettier config outside `apps/web` (which has `eslint-config-next`).

## Next steps _(superseded — see `TASKS.md` and `CLAUDE.md`)_

1. Run `/ank:tasks`. It reads `SPEC.md`, hard-stops for approval at Stage 3, then
   again at Stage 4 before touching GitHub, then creates issues + a project board +
   empty dirs. Its Stage 6 `mkdir -p` pass is a no-op against this scaffold.
2. Start Milestone 1 at `packages/game/src/engine.ts` — implement `applyKeystroke`
   against the `LineProgress` shape in `packages/game/src/types.ts`. The rule that
   drives the design: a wrong character marks and advances, it never blocks;
   backspace repairs and costs only time (SPEC §2.4).
3. Build the typing surface in `apps/web/src/app/page.tsx` per SPEC §6.2:
   monospace ≥24px, per-character `pending`/`correct`/`wrong`/`current` states,
   moving caret rather than a background block, wrong characters never replaced,
   zero layout shift.
4. Add the `?bot=1` and `?round=3` dev shortcuts early (SPEC §7.2) — they pay for
   themselves across Milestones 2–4.
