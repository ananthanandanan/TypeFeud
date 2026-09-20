# Handoff

Issue #1, CI and repository-wide linting, is implemented and verified locally on
`main`. The work is not committed or pushed yet. The last pushed commit is
`e419b85` (`feat: results and intermission taunts`).

A self-contained visual walkthrough now exists at
`docs/review/commit-e419b85.html`. It explains the starting gap, CI control
flow, monorepo lint coverage, formatting baseline, version decisions, local
verification and the final hosted-run gate. Use it as the review artifact for
this working-tree change; the filename reflects the current HEAD beneath the
uncommitted work, not a commit containing the CI implementation.

**Branch:** `main`, ahead of `origin/main` only through uncommitted changes
**Last updated:** 2026-09-20
**Working dir:** `/Users/ananthan2k/Gitrepos/TypeFeud`

## What #1 built

`.github/workflows/ci.yml` runs on every push and pull request. It has one
read-only `verify` job with a 15-minute timeout and cancels an older run when a
new commit arrives on the same ref. Its steps are intentionally separate so the
GitHub UI says exactly which contract failed:

1. lint every workspace and check formatting;
2. run all tests;
3. typecheck all workspaces;
4. validate the committed content pools;
5. create the production build.

The workflow uses `actions/checkout@v7` and `pnpm/setup@v2`. The pnpm action
reads the exact `pnpm@11.18.0` version from `package.json`, installs Node 22,
requires the committed lockfile and caches the pnpm store. Telemetry is disabled
for Next.js and Turbo in CI.

## Repository-wide lint and format

The four workspaces that previously had no lint command now run `eslint .`.
Turbo invokes all five workspace lint tasks; dependency-aware ordering is wired
through `turbo.json`. The web app retains its Next.js Core Web Vitals and
TypeScript config. A new root flat config supplies the recommended ESLint and
TypeScript ESLint rules to the server and shared packages.

Root `pnpm lint` now runs both Turbo lint and `pnpm format:check`. Prettier uses
the repository's established two-space, double-quote, semicolon style with a
120-column width. Generated design/plan HTML, Markdown and generated/cache
directories are excluded. The first run mechanically normalized 37 existing
source/config files; tests and typechecks prove the rewrite did not alter
behavior.

The repo stays on ESLint 9 for now. ESLint 10 is current and the top-level Next
config accepts it, but the import, JSX accessibility and React plugins bundled
by `eslint-config-next@16.3.0` still declare ESLint 9 as their maximum peer.
Forcing 10 would leave every install with peer warnings. Revisit this with the
next Next.js/plugin upgrade.

The local pnpm repair created `.pnpm-store/` in the repo, so that cache directory
is now explicitly ignored alongside `node_modules/`.

## Files and scope

| Area | Change |
|---|---|
| `.github/workflows/ci.yml` | Push/PR verification job with pinned runtime/package-manager behavior. |
| `eslint.config.mjs` | Root flat ESLint config for non-web TypeScript. |
| `.prettierrc.json`, `.prettierignore` | Repository source/config format contract; generated review artifacts are excluded. |
| Root `package.json` | Lint + format scripts and explicit lint/format dependencies. |
| Four non-web `package.json` files | Added workspace lint scripts. |
| `turbo.json` | Dependency-aware lint task. |
| `pnpm-lock.yaml` | Locked the new tooling dependencies. |
| `.gitignore` | Ignores the local pnpm store. |
| 37 source/config files | Mechanical first Prettier baseline only. |
| `TASKS.md` | Marks #1 done locally. |
| `docs/review/commit-e419b85.html` | Visual walkthrough of the completed local CI implementation. |

## Verification

All checks were run after the Prettier baseline:

- `pnpm lint` — five workspace ESLint tasks passed; Prettier reported every
  matched file formatted.
- `pnpm test` — **188 passed**: game 108, web 48, content 28, protocol 4;
  server has no test files yet and exits successfully by design.
- `pnpm typecheck` — passed in all five workspaces.
- `pnpm --filter @typefeud/content validate` — 11 passed.
- `pnpm build` — passed with the normal Next.js Turbopack production path.
- `pnpm peers check` — no peer dependency issues.
- `git diff --check` — passed after the handoff rewrite.

After creating the visual walkthrough, `docs/review` was added to
`.prettierignore` so the review-board skill's canonical CSS and JavaScript stay
unchanged. `pnpm lint` was rerun: all five Turbo lint tasks succeeded and
Prettier reported `All matched files use Prettier code style!`.

The workflow itself cannot run until these files are pushed to GitHub. After
push, confirm the first **CI / verify** run is green before closing #1.

## Next session

The highest-value next feature is #11, the offline content pipeline and complete
Group Chat arena. It unlocks #12, the Milestone 2 tuning pass. #10 accessibility
is also unblocked and can run independently.

Suggested order:

1. inspect `git status --short` and the pending diff, including
   `docs/review/commit-e419b85.html`;
2. commit the complete #1 working tree with a history-compatible message such
   as `chore: add CI and repo-wide linting`;
3. push `main`, then use GitHub Actions (or `gh run list --workflow CI`) to find
   and confirm the first **CI / verify** run;
4. close #1 only after that hosted run is green;
5. start #11: `scripts/generate-content.ts`, ignored drafts, human-review
   promotion, about 270 gameplay lines, 10 triggers and 12 taunts;
6. complete #10 accessibility;
7. run #12 tuning to close Milestone 2;
8. move to #13 rooms/clock sync and #14 live multiplayer.

## Skills used this session

- `/ank:review-board` — produced
  `docs/review/commit-e419b85.html` for the finished local CI feature.
- `/ank:handoff` — updated this canonical handoff in place for the next session,
  as required by the repository guidelines.

## Previous completed feature state

#8 intermission taunts and #9 results/rematch are merged on `main` in `e419b85`.
The user manually verified both behaviors before that commit was pushed. The
results screen stores recent WPM for later ghost matching; taunts are committed,
validated canned content and replay as completed ID/text events.
