# TASKS — TypeFeud

Two-player typing game where an argument escalates over three rounds. Derived from
[`SPEC.md`](./SPEC.md); section references below point back into it.

Task IDs map 1:1 to GitHub issue numbers (T-01 (#1) = #1) once issues are created.

## How to read this

**One task = one PR = one thing you can look at and use.** Tasks are cut vertically
through the stack: the engine function and the UI that renders it ship together,
because neither is demoable alone. A task is done when you can open the app (or run
the test) and see the behaviour work end to end.

- **Depends on** — the upstream task must merge first.
- **Size** — `S` = hours, `M` = 1–2 days, `L` = 3+ days.

## Scope

This board covers **Milestones 1–3** from SPEC §8 — feel, the arc, and multiplayer.
Milestones 4–7 (Cloudflare port, art, clips, content scale) are deliberately
unwritten: they depend on tuning constants and a core mechanic that Milestones 1–2
are expected to change. Write them once Milestone 2's exit criterion is met.

The repo skeleton already exists (see `docs/scaffold-handoff.md`), so only its gaps
appear below.

---

## M1 — Feel

**Exit criterion:** typing feels good. This is 90% of the game. If it does not feel
good here, no amount of animation will save it.

- [ ] **[T-01 #1](https://github.com/ananthanandanan/TypeFeud/issues/1)** `chore: add CI and repo-wide linting` `S`
  - GitHub Actions running `pnpm test && pnpm typecheck && pnpm build` on push and PR.
  - Extend eslint + prettier beyond `apps/web` and wire `lint` into the turbo pipeline.

- [ ] **[T-02 #2](https://github.com/ananthanandanan/TypeFeud/issues/2)** `feat: typing surface with live correctness tracking` `L`
  - **Engine:** `applyKeystroke` — a wrong character marks and advances, it never blocks; backspace repairs and costs time only. Never penalise both the error and the correction (SPEC §2.4).
  - **UI:** the typing surface per SPEC §6.2 — monospace ≥24px, per-character pending/correct/wrong/current, smoothly moving caret rather than a background block, wrong characters underlined and **never** replaced, zero layout shift.
  - **Dev:** `?bot=1` and `?round=3` shortcuts plus the tuning panel (SPEC §7.2) — they pay for themselves across every later milestone.
  - Done when you can type a hardcoded line in the browser and it feels good.
  - _Unblocks_ everything

- [ ] **[T-03 #3](https://github.com/ananthanandanan/TypeFeud/issues/3)** `feat: damage and momentum on line completion` `M`
  - **Engine:** `resolveLine` composing the existing `computeDamage` with momentum charge/reset and special consumption — +1 per clean line, reset on any uncorrected error, special at 4 charges for 1.8× (SPEC §2.5, §2.6).
  - **UI:** damage number and momentum meter, both firing **on line completion, not per keystroke** — per-keystroke feedback is noise at speed (SPEC §6.3).
  - Done when finishing a line shows a number that responds to your accuracy and speed.
  - **Depends on:** T-02 (#2)

---

## M2 — The Arc

**Exit criterion:** the debate→roast→fight escalation lands, and HP/damage/timers
are tuned. All solo, no network.

- [ ] **[T-04 #4](https://github.com/ananthanandanan/TypeFeud/issues/4)** `feat: three-line choice with first-keystroke lock-in` `M`
  - **Content:** pool loader with arena/round/tier queries over the committed JSON.
  - **UI:** three options visible at all times; the first keystroke matching a line's first character locks it in and dims the rest; all three refresh on completion (SPEC §2.3).
  - Watch the failure mode: if players always take the first line, the mechanic needs rework (SPEC §9).
  - **Depends on:** T-03 (#3)

- [ ] **[T-05 #5](https://github.com/ananthanandanan/TypeFeud/issues/5)** `feat: full match flow — rounds, timers, HP, and outcome` `L`
  - **Engine:** `tickRound` and `resolveMatch`. Deadline-based against `endsAt`, no tick loop (SPEC §4.6). Rounds 1–2 hold their own 100 HP pools; winners carry +10 into Round 3, trigger winner +5; Round 3 ends on KO or timer (SPEC §2.7).
  - **UI:** split-screen layout, player always left, HP bars top corners, round timers rendered locally (SPEC §6.1).
  - Done when a full trigger→debate→roast→fight match runs start to finish solo.
  - **Depends on:** T-04 (#4)

- [ ] **[T-06 #6](https://github.com/ananthanandanan/TypeFeud/issues/6)** `feat: seeded line selection and replay trace format` `M`
  - Seeded PRNG; never repeat a line within a match, nor within the player's last 3 matches via a localStorage ring buffer (SPEC §3.6).
  - Replay format stores seed, chosen lines, and keystroke traces; everything else regenerates by re-running the engine (SPEC §5.3).
  - Test asserts replaying a trace reproduces an identical final state.
  - Built now though export ships at Milestone 6 — retrofitting determinism later is miserable work.
  - **Depends on:** T-05 (#5)

- [ ] **[T-07 #7](https://github.com/ananthanandanan/TypeFeud/issues/7)** `feat: scripted ghost opponent` `M`
  - Replays a canned trace with light timing jitter, consumed as a stream of `{lineId, charIndex, errors}` so T-11 (#11) swaps the data source rather than restructuring anything.
  - Not throwaway scaffolding — this becomes the launch bot (SPEC §4.8).
  - **Depends on:** T-06 (#6)

- [ ] **[T-08 #8](https://github.com/ananthanandanan/TypeFeud/issues/8)** `feat: intermission and taunt exchange` `S`
  - 10s intermission, three canned taunts, type one to send; lands on the opponent's screen as a chat bubble (SPEC §2.9).
  - Canned lines only — zero moderation surface.
  - **Depends on:** T-05 (#5)

- [ ] **[T-09 #9](https://github.com/ananthanandanan/TypeFeud/issues/9)** `feat: results screen` `M`
  - Not a stats dump. Lead with the clip, then WPM / accuracy / biggest hit; rematch button large and centred as the obvious next action (SPEC §6.6).
  - **Depends on:** T-05 (#5)

- [ ] **[T-10 #10](https://github.com/ananthanandanan/TypeFeud/issues/10)** `feat: accessibility pass` `M`
  - Reduced-motion disables shake and turns sabotage into a dimmed overlay; dyslexia-friendly font option; no red/green-only signalling; full keyboard navigation (SPEC §6.7).
  - Kept as its own task deliberately — folded into a UI task, it gets dropped when that task runs long.
  - **Depends on:** T-05 (#5)

- [ ] **[T-11 #11](https://github.com/ananthanandanan/TypeFeud/issues/11)** `feat: content pipeline and the Group Chat arena` `L`
  - **Pipeline:** `scripts/generate-content.ts` prompts an LLM offline and writes candidates to the git-ignored `drafts/`. **No LLM calls at match time, ever** (SPEC §3.2). Human review between `drafts/` and `pool/` is the quality gate.
  - **Content:** ~270 lines — 40 jabs / 30 combos / 20 haymakers per round, plus 10 triggers and 12 taunts (SPEC §3.4), all passing `pnpm --filter @typefeud/content validate`.
  - **Depends on:** T-04 (#4)

- [ ] **[T-12 #12](https://github.com/ananthanandanan/TypeFeud/issues/12)** `chore: tuning pass on damage, HP, and timers` `M`
  - Tune until the escalation lands and all three tiers stay viable in different situations.
  - Answer here: is 45s the right round length, and does the three-line choice overload players at high WPM (SPEC §9)?
  - If SPEC §2.5's numbers move, update the spec and `packages/game/test/damage.test.ts` together.
  - **Depends on:** T-07 (#7), T-09 (#9), T-11 (#11)

---

## M3 — Multiplayer

**Exit criterion:** two browser tabs play a full match correctly.

- [ ] **[T-13 #13](https://github.com/ananthanandanan/TypeFeud/issues/13)** `feat: server room lifecycle and clock sync` `L`
  - `waiting → countdown → round(0..3) → intermission → results → closed`, in-memory `Map<matchId, MatchState>` (SPEC §4.6).
  - Server sends `endsAt` once per round. **One timer per round boundary, no `setInterval` game loop** — a prerequisite for the Cloudflare port.
  - Clock sync: client pings 5×, takes the median offset; the `3… 2… 1… ARGUE` countdown fires from synced time (SPEC §4.5).
  - Room logic touches only the `Transport` interface, never a raw `ws` object.
  - **Depends on:** T-05 (#5)

- [ ] **[T-14 #14](https://github.com/ananthanandanan/TypeFeud/issues/14)** `feat: live multiplayer over the socket` `M`
  - Swap the ghost's trace source for a real connection. Progress snapshots at ~10Hz — never stream keystrokes, never send animation events (SPEC §4.3).
  - Done when two browser tabs play a full match and agree on damage, HP, round winners, and outcome.
  - **Depends on:** T-07 (#7), T-13 (#13)

---

## Dependency map

```
#1  CI + lint

#2  typing surface   ← the milestone that matters
 │
 ▼
#3  damage + momentum
 │
 ▼
#4  three-line choice ──────────────────→ #11 pipeline + arena ──┐
 │                                                                │
 ▼                                                                │
#5  full match flow                                               │
 ├──→ #6 seeded selection + replay ──→ #7 ghost ──────────────────┤
 ├──→ #8  taunts                                │                 │
 ├──→ #9  results ───────────────────────────────┼────────────────┤
 ├──→ #10 a11y                                  │                 ▼
 └──→ #13 rooms + clock sync                    │           #12 tuning pass
        │                                       │
        └───────────────→ #14 live multiplayer ◀┘
```

Critical path: **T-02 (#2) → T-03 (#3) → T-04 (#4) → T-05 (#5) → T-06 (#6) → T-07 (#7) → T-14 (#14).**

---

## Labels

| Label | Purpose |
|---|---|
| `area:game` | Pure game logic in `packages/game` |
| `area:content` | Content pools, loader, and the authoring pipeline |
| `area:web` | Next.js client in `apps/web` |
| `area:server` | Authoritative server in `apps/server` |
| `area:infra` | CI, linting, and repo tooling |
| `size:S` | Hours |
| `size:M` | 1–2 days |
| `size:L` | 3+ days |
| `blocked` | Waiting on an upstream task |

Vertical tasks carry more than one `area:` label — that is expected.

---

## Milestones

| Milestone | Goal | Issues |
|---|---|---|
| **M1 — Feel** | Typing feels good. Single player, ugly HTML. 90% of the game. | T-01 (#1), T-02 (#2), T-03 (#3) |
| **M2 — The Arc** | The debate→roast→fight escalation lands and the numbers are tuned. | T-04 (#4), T-05 (#5), T-06 (#6), T-07 (#7), T-08 (#8), T-09 (#9), T-10 (#10), T-11 (#11), T-12 (#12) |
| **M3 — Multiplayer** | Two browser tabs play a full match correctly. | T-13 (#13), T-14 (#14) |
