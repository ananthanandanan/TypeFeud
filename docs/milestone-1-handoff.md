# Handoff — Milestone 1: the typing surface

**Crux:** Implemented `applyKeystroke` and the SPEC §6.2 typing surface, so a line
can be typed in the browser. Milestone 1's exit criterion — *typing feels good* —
was confirmed by hand and is met.
**Branch:** merged to `main` as
[PR #15](https://github.com/ananthanandanan/TypeFeud/pull/15) (`4e450a0`), closing
[issue #2](https://github.com/ananthanandanan/TypeFeud/issues/2)
**Date:** 2026-08-26
**Working dir:** `/Users/ananthan2k/Gitrepos/TypeFeud`

---

## Where the project is

```
/ank:third-degree → /ank:spec → /ank:tasks → (build) → /ank:review-board
      done          skipped        done       ← YOU ARE HERE
```

Milestone 1 of 7 is done. **Next is [issue #3](https://github.com/ananthanandanan/TypeFeud/issues/3)
— damage and momentum on line completion.** `CLAUDE.md` carries the short version;
this document is why things are the way they are.

## What was built

**Engine.** `applyKeystroke` in `packages/game/src/engine.ts` folds one keystroke
into the round. A wrong character marks and advances and never blocks; backspace
walks back one position and repairs whatever was there, costing only the time it
took. An error is therefore charged once, at resolution, and only if it is still
standing — never both the error and the correction (SPEC §2.4).

Keystrokes it deliberately ignores, returning the argument object unchanged so the
caller can skip a render: modifiers and arrows, characters past the end of the line,
backspace at index 0, and anything arriving before a line is locked in.

**`packages/game/src/progress.ts`** is new — the read side of `LineProgress`.
`createLineProgress`, `lineCharStates`, `displayLine`, `uncorrectedErrors`. The
surface renders from these rather than reaching into the state shape itself.

**UI.** `apps/web/src/components/typing-surface.tsx` and `typing-stage.tsx`, plus
`src/dev/flags.ts` and `src/dev/tuning.tsx`. JetBrains Mono and the design tokens
are now wired through `globals.css` and `layout.tsx`.

**Content.** `packages/content` gained `pool.ts`, exporting `POOL` and
`linesForRound` — zod-validated at import. The stage picks its line from there
rather than hardcoding a string.

## Key decisions

- **`LineProgress` gained `typedChars`.** SPEC §6.2 requires a wrong character to
  stay on screen *as typed*, which cannot be reconstructed from the line plus a set
  of error indices — the original shape recorded where you erred, not what you
  pressed. It is local render state and never goes on the wire; progress snapshots
  stay `{lineId, charIndex, errors}` (SPEC §4.3). Written back into SPEC §2.4.
- **The damage math takes an injected `Tuning` object**, defaulting to
  `DEFAULT_TUNING` built from the constants in `tuning.ts`. Without this the tuning
  panel is decorative, because `tuning.ts` exports immutable consts and
  `packages/game` must not become mutable. Written back into SPEC §2.5.
- **`KeyEvent` gained an optional `slot`**, defaulting to 0. The signature in SPEC
  §4.2 carries no player, and a client only ever has its own keystrokes — but the
  server needs to say whose trace it is folding.
- **Reset is a remount, not an effect.** `TypingStage` keys `<LineRun>` on
  `${line.id}-${attempt}`, so a new line is a new `RoundState` and a fresh clock
  with nothing reaching in to clear the old one. The first version used an effect
  and tripped `react-hooks/set-state-in-effect`, correctly.
- **The round clock starts on the first keystroke**, not at mount — reading
  `performance.now()` during render is impure and the lint rules catch it. It is
  only ever a base for differences, so the choice of origin cancels out.
- **Words are chunked as `inline-block`.** Per-character spans otherwise let a line
  wrap mid-word. Each chunk keeps its trailing space with `white-space: pre`.
- **The caret is measured, not computed.** It reads real character bounding boxes
  through refs and re-measures under a `ResizeObserver`, rather than multiplying
  `charIndex` by a character width — which would desync the moment a line wraps.

## Fixes made along the way

- **Internal packages dropped their `.js` import extensions.** Turbopack will not
  resolve `./damage.js` to `damage.ts` in a transpiled source package, so
  `pnpm build` failed on the very first import of `@typefeud/game` — 30 errors, all
  the same cause. tsc (`moduleResolution: bundler`), vitest and tsx all resolve
  extensionless, so this is uniform across the workspace now.
- **`transpilePackages`** added to `next.config.ts`. The internal packages ship as
  TS source with no build step, so Next has to compile them itself.
- **`agentRules: false`.** The Next 16 build writes its own `apps/web/CLAUDE.md` and
  `AGENTS.md`. Repo guidance lives in the root `CLAUDE.md`; scattered generated
  copies are how it goes stale.

## Verified, not assumed

```
pnpm test        → 5 tasks successful; 42 tests passed
                   (game 28, content 5, protocol 4, web 5)
pnpm typecheck   → 5 tasks successful
pnpm lint        → clean
pnpm build       → next build ✓, 3 pages
```

Feel confirmed by typing on `localhost:3000` by hand — the one part of the exit
criterion no test can assert.

## Known gaps, deliberately left

- **No IME or composition-event handling.** Dead keys and non-Latin input will
  misbehave. Fine for the ASCII pool, wrong eventually.
- **No focus model.** It is a `window` keydown listener, so the page types wherever
  you last clicked (inputs excepted). Belongs with the accessibility pass, #10.
- **The surface component has no tests.** The engine has 18 and the flag parser 5,
  but the caret measurement and word chunking are untested. SPEC §7.3 rules out E2E
  browser tests for v1, which is why verification there was by hand.
- **Line completion does nothing** except freeze the HUD and wait for enter. The
  `DAMAGE` figure is a readout computed from `computeDamage`, not a resolution —
  that is #3.
- **One line at a time.** The three-line choice is #4.
- **`?bot=1` parses but does nothing.** The ghost is #7.

## Open questions

- **Does the pending/correct grey contrast carry?** `#E8EDF2` correct against
  `#5A6672` pending is straight from the design tokens, but the only thing marking
  how far you have got is the caret. Worth a second look during #3; if it does not
  read, it is a design-system question, not a code one.
- **Caret motion across a line wrap** slides diagonally to the next row. It may
  read better as a snap. Unproven either way.
- **Next.js 16.3 vs `@opennextjs/cloudflare`** — still open from the scaffold
  session. Verify before Milestone 4 and pin versions.
- **CI still does not exist** (#1). The gate above runs on your machine only.

## Next steps

1. **#3 — damage and momentum on line completion.** `resolveLine` composing
   `computeDamage` with momentum charge/reset and special consumption (+1 per clean
   line, reset on any uncorrected error, special at 4 charges for 1.8×). Then the
   damage number and momentum meter in the UI, firing **on completion, not per
   keystroke** — per-keystroke feedback is noise at speed (SPEC §6.3).
2. **#1 — CI and repo-wide linting**, unblocked and worth doing early so the gate
   runs on PRs rather than locally.
3. The design pass still has no issue. It would be **#16** — PR #15 took the number
   that was earmarked for it.
