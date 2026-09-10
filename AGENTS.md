# Repository Guidelines

## Project Structure & Module Organization

TypeFeud is a pnpm/Turborepo TypeScript monorepo. Read `docs/handoff.md` for current work and `SPEC.md` for design rules.

- `apps/web/src/`: Next.js App Router client; `components/` holds UI, `match/` coordinates flow, and `dev/` holds tuning tools.
- `apps/server/src/`: Node WebSocket server and transport adapter.
- `packages/game/src/`: shared game engine, damage calculations, and tuning.
- `packages/protocol/src/`: wire schemas and the `Transport` interface.
- `packages/content/`: schemas, validators, and committed JSON text in `pool/`.
- Workspace `test/` directories contain tests. `docs/design/canvas/` contains design sources; `scripts/` documents the planned offline authoring pipeline.

## Build, Test, and Development Commands

Use Node 22+ and the pinned pnpm version (`11.18.0`). Run from the repository root:

- `pnpm install`: install workspace dependencies.
- `pnpm dev`: start web on port 3000 and WebSocket server on 3001.
- `pnpm build`: create the Next.js production build; internal packages are consumed as TypeScript source.
- `pnpm test`: run workspace Vitest suites.
- `pnpm typecheck`: check TypeScript across workspaces.
- `pnpm lint`: run Next.js ESLint rules in `apps/web`.
- `pnpm --filter @typefeud/game test:watch`: watch engine tests.
- `pnpm --filter @typefeud/content validate`: validate content pools.

## Coding Style & Naming Conventions

Follow existing TypeScript: two-space indentation, double quotes, semicolons, explicit type imports, camelCase functions, and PascalCase types/components. Use kebab-case component filenames. Keep internal-package imports extensionless. Strict TypeScript is enabled; no Prettier configuration exists.

Keep game logic pure, deterministic, and non-mutating. Inject time, randomness, and tuning; store tunables in `packages/game/src/tuning.ts`. Read `docs/design/README.md` before UI changes. Effects must never obscure typing text.

## Testing Guidelines

Use Vitest with `test/**/*.test.ts` filenames and descriptive behavior assertions. Prioritize engine rules, edge cases, and SPEC worked examples. No numeric coverage threshold is configured; v1 excludes browser E2E tests. Verify UI changes manually. Run tests, typecheck, lint, and build before submitting.

## Commit & Pull Request Guidelines

Follow history’s prefixes, such as `feat: full match flow` or `docs: update handoff`. Omit tooling metadata and co-author/generated-by lines. Keep one issue per demoable PR, shipping engine and UI changes together. Link the issue, describe behavior and validation, and include screenshots for visual changes. Update `SPEC.md` when rules change and rewrite `docs/handoff.md` in place when completing an issue.
