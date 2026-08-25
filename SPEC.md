# TYPEFEUD — Technical & Design Specification

**Version:** 0.1 (pre-build)
**Status:** Ready for implementation planning
**Name:** TypeFeud

---

## 1. Intent

### 1.1 What this is

A two-player online typing game. Two stick figures have an argument that escalates over three rounds — debate, roast, fistfight — and typing performance drives the outcome. All text is pre-authored. Players are performers delivering lines, not authors composing them.

### 1.2 What this is not

Not a typing benchmark. TypeRacer and Monkeytype already measure typing speed well, and this project will lose to them on that axis. Raw WPM must not be the sole determinant of victory.

### 1.3 The design thesis

> TypeRacer *measures* you. TypeFeud *casts* you — as the person in the argument, winning or losing it in public, in front of an audience.

Typing is the interface. The fantasy is being quick and funny on your feet. The game supplies the wit; the player supplies the execution and the timing.

### 1.4 The success condition

**Would someone screenshot or clip this?**

Every scoping decision defers to that test. It is the reason replay/clip export is a P1 feature rather than a nice-to-have, the reason writing quality is treated as core engineering work, and the reason new arenas are preferred over new mechanics.

### 1.5 Non-goals for v1

- Ranked ladders, ELO, competitive integrity infrastructure
- User-generated text
- Voice, video, or free-form chat
- Mobile-native clients (responsive web is in scope; touch typing is not the target)
- Tournaments, spectator mode, teams

---

## 2. Game Design

### 2.1 Match structure

| Phase | Duration | Purpose |
|---|---|---|
| Matchmaking | until paired | queue, bot fallback |
| Arena reveal | 3s | sets topic and context |
| **Round 0 — The Trigger** | ~2s | quick-draw, single word |
| **Round 1 — The Debate** | 45s | civil, long-form lines |
| Intermission | 10s | taunt exchange |
| **Round 2 — The Roast** | 45s | rhythmic, short lines |
| Intermission | 10s | taunt exchange |
| **Round 3 — The Fight** | 60s or KO | decider |
| Results | — | stats, clip, rematch |

Target total: **3–4 minutes.** Short enough that "one more" is the default reaction.

### 2.2 Round 0 — The Trigger

A single provocation line appears (`dev_p has left you on read for 4 hours`), then one word: `WHAT`, `SEEN`, `EXCUSE ME`.

First to type it correctly wins the trigger. Reward: **+5 HP in Round 1.** Deliberately small — this is a pacing beat and a topic-setter, not a swing.

### 2.3 The three-line choice (core mechanic)

During rounds 1–3, each player sees **three simultaneous options** at all times:

```
[JAB]       4–8 words     base damage 6     low risk
[COMBO]     10–16 words   base damage 13    medium
[HAYMAKER]  20–30 words   base damage 30    high risk, high payoff
```

The player begins typing any of them; the first keystroke that matches a line's first character **locks in** that line. Non-selected lines dim. On completion, all three refresh.

This is the mechanic that separates the game from a speed test. It creates a continuous risk/reward decision under time pressure, and it lets a slower, smarter player beat a faster, greedier one.

**Design rule:** if the three options ever collapse into an obvious correct answer, the mechanic is dead. Tuning must keep all three tiers viable in different situations.

### 2.4 Errors and backspace

The single most important interaction in the game. Both branches must stay viable.

- Typing a wrong character does **not** block progress. The character is marked wrong, the player continues.
- Each uncorrected error: **−15% outgoing damage** on that line (floor 40%) and **2 self-damage** (the figure stumbles).
- Backspacing to repair costs only **time** — no damage penalty.
- In-flight progress carries the **keys the player actually pressed**, not just the indices they got wrong. §6.2 requires a wrong character to stay on screen as typed, which is not recoverable from the line plus an error count. This is local render state and never goes on the wire — progress snapshots stay `{lineId, charIndex, errors}` (§4.3).

The result: every typo is a live decision. *Am I far enough ahead to afford the repair?* This deliberately rhymes with the jab/haymaker decision — the game should feel like it asks one kind of question in several places.

**Anti-pattern to avoid:** penalising both the error *and* the correction. That is double jeopardy and kills flow.

### 2.5 Scoring math (starting values — expect to tune)

```
damage = baseDamage × accuracyMult × speedMult

accuracyMult = clamp(1.0 − 0.15 × uncorrectedErrors, 0.4, 1.0)
speedMult    = clamp(lineWPM / 60, 0.7, 1.4)
```

- **Clean haymaker at 80 WPM:** 30 × 1.0 × 1.33 = **~40 damage**
- **Two-error haymaker at 80 WPM:** 30 × 0.7 × 1.33 = **~28 damage**, plus 4 self-damage
- **Clean jab at 60 WPM:** 6 × 1.0 × 1.0 = **6 damage**

Every function above takes its tunables as a `Tuning` argument defaulting to `DEFAULT_TUNING`, rather than reading module constants. The dev tuning panel (§7.2) drives the live math by passing its own object, so nothing in `packages/game` has to become mutable to support it.

### 2.6 Momentum meter

- +1 charge per line completed with zero uncorrected errors
- Resets to 0 on any uncorrected error
- At **4 charges**, a Special unlocks; the player triggers it and it consumes the meter

Specials are round-flavoured: laminated chart (debate), triple-speed verse (roast), heavy swing (fight). Effect: **1.8× damage on the next completed line** plus a large visual payoff.

Rewards precision explicitly, which is the counterweight to raw speed.

### 2.7 Round outcomes

Rounds 1 and 2 do **not** end the match. Each has its own 100 HP pools; the player with more HP remaining at the timer wins the round.

**Round winners carry +10 starting HP into Round 3** (max +20 combined, plus trigger bonus).

Round 3 is the decider: 100 HP base + carried advantage, ends on KO or timer. Timer expiry → higher HP wins.

**Rationale:** a best-of-three would let a player clinch after Round 2, meaning the fight — the climax the whole escalation builds toward — sometimes never happens or doesn't matter. Feeding earlier rounds into the fight as advantage guarantees the arc always resolves where it should.

### 2.8 Sabotage (Round 3 only)

Landing a Combo or Haymaker briefly **scrambles the opponent's prompt** — their figure staggers across their own text for ~1.5s, characters jitter.

Use sparingly. Round 3 only, cooldown of 8s. Over-application makes the game feel unfair rather than chaotic.

### 2.9 Taunts

10s intermission. Three canned taunt lines offered; type one to send it. Appears on the opponent's screen as a chat bubble.

Gives the player a voice with **zero moderation surface** and gives the losing player something to do besides wait.

---

## 3. Content System

### 3.1 Content is the product

Players will return for the writing the way people return to Cards Against Humanity for the cards. This is not decoration on top of an engine — it is the thing being sold. Budget real time here.

### 3.2 Generation pipeline — offline, not runtime

**Decision: no LLM API calls at match time.**

Rationale:
1. **Replay determinism.** Clip export requires that a match be exactly reproducible from a trace. Runtime generation breaks that.
2. **Latency.** Lines must appear instantly. A 600ms generation stall mid-round destroys flow.
3. **Cost.** Per-match inference cost scales linearly with players, for content that is reused thousands of times.
4. **Quality control.** Comedy fails often. Every line must be read by a human before it ships.
5. **Safety.** Unvetted generated insults in a PvP context is an unacceptable risk.

**The pipeline is an authoring tool, run by you, offline:**

```
scripts/generate-content.ts
  → prompt an LLM with arena + topic + tier + tone constraints
  → produce 50–100 candidate lines per batch
  → write to content/drafts/<arena>-<round>.json
  → HUMAN REVIEW: keep / cut / rewrite  ← the actual quality gate
  → promote to content/pool/<arena>-<round>.json
  → validate: word counts, tier bounds, banned terms, duplicates
```

Committed JSON is the source of truth. The generator is a drafting aid.

### 3.3 Content schema

```jsonc
{
  "id": "grpchat-debate-hay-014",
  "arena": "group_chat",
  "round": "debate",          // trigger | debate | roast | fight
  "tier": "haymaker",         // jab | combo | haymaker
  "text": "There is no universe in which four hours of silence followed by a single consonant is not a declaration of war.",
  "wordCount": 22,
  "tags": ["texting", "passive_aggression"],
  "responseTo": ["dismissal"],  // optional: enables reactive pairing
  "tone": "exasperated"
}
```

`responseTo` enables a later upgrade: if the opponent's last line was tagged `dismissal`, weight your next options toward lines that answer dismissal. Cheap to add, makes exchanges feel like actual arguments rather than parallel monologues.

### 3.4 Volume targets

Per arena, per round: **40 jabs / 30 combos / 20 haymakers** ≈ 90 lines.
Three rounds → ~270 lines + 10 triggers + 12 taunts per arena.

**Launch with 3 arenas fully written** (~850 lines). Fewer arenas written well beats more written thinly.

### 3.5 Arenas

Arenas are the content lever — **new arena = new writing + new backdrop, no new code.** This is the scaling strategy and the natural shape for paid packs later.

Launch set:
1. **Group Chat** — read receipts, typing indicators, reply-all
2. **Thanksgiving Dinner** — family, gravy, "so how's the job going"
3. **Office Standup** — process, blockers, "let's take this offline"

Backlog: Comment Section, Courtroom, Parents' Evening, Group Project.

### 3.6 Selection algorithm

- Never repeat a line within a match
- Never repeat within a player's last 3 matches (localStorage ring buffer, no DB needed)
- Weight by `responseTo` match against opponent's last line (phase 2)
- Prefer unseen tags for variety

---

## 4. Architecture

### 4.1 Monorepo layout

```
typefeud/
├─ apps/
│  ├─ web/                Next.js 14+ App Router, TS, Tailwind
│  └─ server/             Node + ws, authoritative game server
├─ packages/
│  ├─ game/               PURE game logic — no I/O, no DOM
│  ├─ protocol/           wire message types + zod schemas
│  └─ content/            JSON pools + loader + validator
├─ scripts/
│  └─ generate-content.ts LLM authoring pipeline
└─ pnpm-workspace.yaml
```

### 4.2 `packages/game` — the critical decision

Pure functions. Zero I/O, zero DOM, zero network. Imported by **both** client and server.

```ts
applyKeystroke(state: RoundState, ev: KeyEvent): RoundState
resolveLine(state: RoundState, lineId: string): LineOutcome
tickRound(state: RoundState, now: number): RoundState
resolveMatch(rounds: RoundResult[]): MatchOutcome
```

**Why this matters:** it makes it structurally impossible for client and server to disagree about what a haymaker is worth. It eliminates the entire bug class where the loser's screen says they won. It also makes the game logic unit-testable with no browser and no socket — which is where the majority of your tests should live.

Everything in this package must be deterministic. Time and randomness are injected as parameters, never read from `Date.now()` or `Math.random()` internally. This is what makes replay possible.

### 4.3 Netcode model

Typing games are unusually friendly to netcode: **no physics, no collision, and each player's input affects only their own screen.** There is nothing to resolve between clients. That eliminates the hardest part of multiplayer.

**Rules:**

1. **Never stream keystrokes.** Send progress snapshots at ~10Hz: `{lineId, charIndex, errors}`.
2. **Local input renders instantly**, zero latency, correct by construction.
3. **Opponent is a slightly-delayed replica.** A stick figure winding up 80ms late is visually identical to one that isn't.
4. **Derive animations from progress; never send animation events.** Client sees opponent progress cross a threshold and plays the punch. Fewer messages, fewer desync bugs.
5. **Server owns text, clock, and outcome.** Clients never decide who won.

### 4.4 Wire protocol

```ts
// client → server
{ t: "queue.join",  nickname: string }
{ t: "queue.leave" }
{ t: "progress",    lineId: string, charIndex: number, errors: number }
{ t: "line.commit", lineId: string, keystrokes: KeystrokeTrace }
{ t: "special.use" }
{ t: "taunt.send",  tauntId: string }
{ t: "ping",        clientTime: number }

// server → client
{ t: "match.found",   matchId, arena, opponent, seed }
{ t: "round.start",   round, options: Line[3], serverTime, endsAt }
{ t: "opponent.progress", lineId, charIndex, errors }
{ t: "line.resolved", by: "self"|"opponent", damage, newHp, special }
{ t: "sabotage",      durationMs }
{ t: "round.end",     hp: {self, opponent}, winner }
{ t: "match.end",     outcome, stats, replayId }
{ t: "pong",          clientTime, serverTime }
```

Validate every inbound message with zod at the boundary.

### 4.5 Clock sync

At match start, client pings 5×, takes the median offset. The `3… 2… 1… ARGUE` countdown fires from synced time so both players start on the same instant. Cheap to implement, feels broken if omitted.

### 4.6 Room lifecycle

```
waiting → countdown → round(0..3) → intermission → results → closed
```

In-memory `Map<matchId, MatchState>`. Rooms self-destruct 60s after `results`. On disconnect: 15s reconnect grace, then forfeit.

**Timing is deadline-based, not tick-based.** The server sends `endsAt` once at round start; clients render the countdown locally from synced time. The server evaluates elapsed time only when a message arrives, plus **one timer per round boundary** as backstop. No `setInterval` game loop.

This matters for two reasons: it removes an entire class of drift bug, and it is a prerequisite for the Cloudflare migration in §10 (Durable Objects bill CPU duration, so a 10Hz idle loop is pure waste).

**Transport must be behind an interface.** Room logic never touches a raw `ws` object:

```ts
interface Transport {
  send(playerId: string, msg: ServerMessage): void
  broadcast(msg: ServerMessage): void
  onMessage(cb: (playerId: string, msg: ClientMessage) => void): void
  onClose(cb: (playerId: string) => void): void
}
```

`NodeWsTransport` for local dev, `DurableObjectTransport` for production. This is what makes §10 a few hours of work instead of a rewrite.

### 4.7 Anti-cheat (proportionate)

Do **not** build full server-side keystroke validation for v1. Sufficient:

- Reject WPM above a hard ceiling (~220)
- **Keystroke interval variance check** — humans have jittery inter-key timings; scripts do not. Low variance is a strong bot signal.
- Server owns the timer; client-reported durations are ignored

This catches essentially every casual cheater. Revisit only if ranked play ships.

### 4.8 Bots

**Non-negotiable for launch.** The queue will be empty for months, and an empty lobby kills the game before anyone sees the good part.

Record real progress traces, replay them as ghost opponents with light timing jitter. Match ghost skill to player's recent WPM. Do not advertise loudly.

The ghost is built in Milestone 2 as a development tool and is reused as the launch bot — it is not throwaway scaffolding.

---

## 5. Data & Persistence

### 5.1 v1 needs no database

| Data | v1 storage |
|---|---|
| Content pools | JSON files in repo |
| Match state | server memory |
| Player identity | nickname in localStorage |
| Recently-seen lines | localStorage ring buffer |
| Queue | in-memory array |

Ship without Postgres, without Redis, without auth. Every one of them is addable later; every one slows you down now.

### 5.2 What forces a database (and when)

| Feature | Requires |
|---|---|
| Persistent replays / shareable clips | Blob storage (R2/S3) + a table of trace metadata |
| Accounts, stats history | Postgres |
| Leaderboards | Postgres + cache |
| Multi-instance matchmaking | Redis (Upstash) — single-instance memory works until then |
| Cosmetics / purchases | Postgres |

**First real need is replay storage**, since clip sharing is P1. That can start as R2 + a single `replays` table. Do not provision a schema before that.

### 5.3 Replay format

Deterministic and small. Store the seed, the chosen lines, and the keystroke traces; regenerate everything else by re-running `packages/game`.

```jsonc
{
  "matchId": "...",
  "seed": 918273,
  "arena": "group_chat",
  "players": [{"nickname": "maya"}, {"nickname": "dev_p"}],
  "events": [
    {"t": 1240, "p": 0, "lineId": "grpchat-debate-jab-003", "trace": [...]},
    {"t": 2100, "p": 1, "lineId": "grpchat-debate-hay-014", "trace": [...]}
  ]
}
```

**Build the replay format in Milestone 1, even if export ships much later.** Retrofitting determinism into an engine that assumed it could call `Math.random()` is miserable work.

---

## 6. UI / UX

### 6.1 Layout

Split screen, mirrored. Player always on the **left**. Stick figures face each other at centre. HP bars top-left and top-right. The three line options occupy the lower third on the player's side.

### 6.2 The typing surface

This is the most-looked-at element in the game and deserves disproportionate polish.

- Monospace, large (≥24px), generous line-height
- **Per-character states:** pending / correct / wrong / current
- Current character marked with a caret that moves smoothly, not a background block
- Wrong characters: red underline, **never remove or replace the character** — the player must be able to see what they typed
- No layout shift, ever. Reserve space for the full line before typing starts.

### 6.3 Feedback timing

Damage numbers, screen shake, and hit animations fire **on line completion**, not per keystroke. Per-keystroke feedback is noise and makes the screen unreadable at speed.

### 6.4 Animation

**Recommendation: Rive.** Small runtime, state-machine driven, blends between states properly, built for exactly this. If you are not an animator, this gets you further faster than hand-rigged SVG.

Alternative: SVG + CSS transforms. Free, total control, tedious — but stick figures are line segments, so it is genuinely viable.

Avoid Canvas/Pixi. Two characters and no particle load does not justify it.

**Required states:** idle, typing (small bob), windup, strike, hit-taken, stagger, special, victory, defeat.

### 6.5 Readability under chaos

Sabotage, screen shake, and crowd reactions must never obscure the player's own text. Hard rule: **effects render behind the typing surface, or outside its bounding box.** When in doubt, reduce the effect.

### 6.6 Results screen

Not a stats dump. Lead with the clip. Then WPM / accuracy / biggest hit. **Rematch button large and centred** — it should be the obvious next action.

### 6.7 Accessibility

- Reduced-motion setting disables shake and sabotage jitter (sabotage becomes a dimmed overlay instead)
- Dyslexia-friendly font option
- No red/green-only signalling — pair colour with underline/weight
- Full keyboard navigation; the game is already keyboard-first

---

## 7. Local Development

### 7.1 Setup

```bash
pnpm install
pnpm dev          # turbo: web on :3000, server on :3001
```

- `apps/web` — `next dev`
- `apps/server` — `tsx watch src/index.ts`
- No Docker, no database, no external services required to run the game

### 7.2 Development tooling to build early

- **`?bot=1`** — instantly start a match against a ghost, skipping the queue
- **`?round=3`** — jump straight to a round for tuning
- **Tuning panel** (dev-only) — live-edit damage constants, timers, WPM par
- **Two-tab local multiplayer** — open two browser tabs, both hit the local server

### 7.3 Testing priorities

1. `packages/game` — pure unit tests, highest coverage. Damage math, error handling, round resolution, determinism.
2. `packages/protocol` — schema round-trip tests
3. Replay determinism — replaying a trace must reproduce identical final state
4. Server room lifecycle — join, disconnect, reconnect, forfeit

Skip E2E browser tests for v1.

### 7.4 Deployment

Local development runs entirely on plain Node — no Cloudflare tooling, no `wrangler`, no build step beyond `next dev`. Iteration speed is the priority through Milestones 1–3.

Production target is **all-Cloudflare**, executed at Milestone 4. See §10 for the full migration plan.

---

## 8. Build Order

Do **not** build the game and then add multiplayer.

### Milestone 1 — Feel
Single-player. One prompt, correctness tracking, WPM, backspace cost, damage on error. Ugly HTML, no art, no opponent, no network.

**Exit criterion:** typing feels good. This is 90% of the game. If it does not feel good here, no amount of animation will save it.

### Milestone 2 — The Arc
Add the three-line choice, momentum meter, and a **scripted ghost opponent** replaying a canned trace. All three rounds, intermissions, full match flow.

**Exit criterion:** the debate→roast→fight escalation lands, and HP/damage/timers are tuned. All solo, instant iteration, no network.

### Milestone 3 — Multiplayer
Stand up `apps/server`. Swap the ghost's trace source for a live socket. Because Milestone 2 already consumed opponent progress as a stream of `{lineId, charIndex, errors}`, this replaces a data source rather than restructuring anything.

**Exit criterion:** two browser tabs play a full match correctly.

### Milestone 4 — Matchmaking + Cloudflare port
Queue, room lifecycle, disconnect/reconnect, ghost fallback when the queue is empty — implemented directly as Durable Objects rather than built on Node and ported afterwards. See §10.

**Why here and not earlier:** this is the first milestone where Durable Objects *save* work rather than relocate it. Before Milestone 4 there is no queue and no room registry, so the platform buys you nothing and costs you iteration speed. After Milestone 4, you would be throwing away queue logic you had just written.

### Milestone 5 — Art
Rive integration, all animation states, arena backdrops, crowd figures, sound.

### Milestone 6 — Clips
Replay storage, `/r/[matchId]` playback route, GIF/MP4 export, share cards.

### Milestone 7 — Content scale
Arenas 2 and 3 fully written. `responseTo` reactive pairing.

---

## 9. Deferred / Open

**Deliberately deferred:** accounts, ranked/ELO, cosmetics shop, spectator mode, tournaments, mobile native, user-generated content.

**Open questions:**
- Does the three-line choice overload players at high WPM? Watch for players ignoring the options and always taking the first line — if that happens, the mechanic needs rework or a reduction to two options.
- Is 45s the right round length? Tune in Milestone 2.
- Should Round 2 (roast) sync to a beat? Musically strong, adds real complexity. Prototype only after Milestone 5.
- Rejected: an "apology/reconciliation" fourth round. Funny on paper, deflates the match exactly when players should be hitting rematch.

---

## 10. Phase 2 — Cloudflare Deployment

Executed at **Milestone 4**, not before. Milestones 1–3 run on plain Node + `ws` on localhost.

### 10.1 Why Cloudflare for this specific game

A match is a small, isolated, stateful session with exactly two connected clients and a lifetime of ~4 minutes. That is precisely the shape of a Durable Object. The alternative (Fly/Railway + Vercel) requires you to hand-build room registry, instance routing, sticky sessions, and cleanup — all of which DOs provide as a property of the runtime.

Concretely, the port **deletes** code:
- No `Map<matchId, MatchState>` registry — `idFromName(matchId)` routes both players to the same object globally
- No cross-instance matchmaking problem — no Redis needed
- No orphaned-room cleanup — DOs evict themselves when idle
- No sticky-session config

### 10.2 Component mapping

| Component | Cloudflare service |
|---|---|
| `apps/web` (Next.js) | Workers via `@opennextjs/cloudflare` |
| Match rooms | Durable Object — one instance per `matchId` |
| Matchmaking queue | Durable Object — one instance (shard by region later) |
| Replay traces | R2 |
| Static assets, Rive files | Workers Assets |
| Next.js ISR cache | KV (`NEXT_INC_CACHE_KV`) |
| Accounts / stats (Phase 3) | D1 |
| Rate limiting | Workers Rate Limiting binding |

Note: **no Redis and no Postgres.** The queue lives in a DO; replays live in R2.

### 10.3 Durable Object design

**`MatchRoom`** — one per match.

```ts
export class MatchRoom {
  private state: MatchState        // from packages/game
  private sockets: Map<string, WebSocket>

  fetch(req)                       // WebSocket upgrade
  webSocketMessage(ws, raw)        // validate → applyKeystroke → broadcast
  webSocketClose(ws)               // 15s grace, then forfeit
  alarm()                          // round boundary only
}
```

Storage: keep `MatchState` in memory during the match. Persist to DO storage **only** at round boundaries, as reconnect insurance. Persisting per keystroke is unnecessary and expensive.

**`Queue`** — one instance.

Holds waiting players. On pair: mint `matchId`, send `match.found` to both, they connect to the `MatchRoom` DO. If a player waits beyond a threshold (start at 8s), dispatch a ghost instead.

### 10.4 Hibernation policy

Use the **WebSocket Hibernation API** for the `Queue` DO — players may genuinely idle there, and hibernation means you aren't billed for it.

Do **not** hibernate `MatchRoom`. Matches have continuous traffic for their entire lifetime, so hibernation gains nothing and the wake-up path adds complexity to the hottest code in the system.

### 10.5 Timing under Durable Objects

DO billing is duration-based, which makes a 10Hz `setInterval` actively wasteful. The deadline-based model in §4.6 is what makes this economical:

- Server sends `endsAt` at round start
- Clients render countdown locally from synced time
- Server computes elapsed time only on inbound messages
- **One `alarm()` per round boundary** — 4 alarms per match, not 2,400 ticks

### 10.6 Next.js on Workers — known sharp edges

Budget real time for these; they are the main friction in the port.

1. **Build-time vs runtime env vars.** Worker environment variables are only available at runtime. Any variable Next.js needs during `next build` must be supplied to the build step separately — variables set only in Worker runtime settings will cause build failures. This is the single most common deployment failure.
2. **Build step changes** from `next build` to `opennextjs-cloudflare build`. Slower than `next dev`; use `next dev` for day-to-day work and the Workers build only for preview/deploy.
3. **`next/image`** defaults to the Vercel optimizer. Set the Cloudflare Images binding or use a custom loader.
4. **Use one package manager consistently.** Mixed lockfiles are a known cause of build failure with this adapter.
5. **Set `compatibility_date` to a recent date** and enable `nodejs_compat`. Older compatibility dates change how env vars surface in `process.env`.

### 10.7 Migration checklist

1. `pnpm add -D @opennextjs/cloudflare wrangler`
2. Write `wrangler.jsonc`: `main: .open-next/worker.js`, `nodejs_compat`, assets binding, DO bindings, R2 bucket
3. Implement `DurableObjectTransport` against the §4.6 `Transport` interface
4. Move room logic from `apps/server` into `MatchRoom` — logic unchanged, transport swapped
5. Implement `Queue` DO; delete the in-memory queue array
6. Wire replay writes to R2
7. Verify locally with `wrangler dev` (DOs run locally in `workerd`)
8. Deploy; smoke-test a full two-client match against the deployed URL
9. Keep the Node server working for local dev — do not delete it

Step 9 matters. Losing fast local iteration to gain production parity is a bad trade; the `Transport` interface exists so you can keep both.

### 10.8 Cost

- Workers Paid: **$5/mo** (Durable Objects require it)
- DO duration: a 4-minute match with two sockets is a fraction of a cent
- R2: generous free tier; replay traces are small JSON
- Realistically **under $20/mo until several thousand daily matches**

### 10.9 Accepted trade-offs

- **Local dev is slower** under `wrangler dev` than plain Node. Mitigated by keeping the Node path alive for Milestones 1–3 and day-to-day work.
- **Vendor coupling.** Durable Objects have no direct equivalent elsewhere. Contained by `packages/game` (pure, portable) and the `Transport` interface — a move would mean rewriting transport, not game logic.
- **OpenNext is a community adapter**, not first-party Next.js support. Mature and GA, but Next.js releases can outpace it. Pin versions; do not upgrade Next.js majors casually.

---

## 11. Summary of Binding Decisions

1. All text is pre-authored and human-reviewed. No runtime LLM calls.
2. Game logic lives in a pure, deterministic package shared by client and server.
3. Progress snapshots at 10Hz; never stream keystrokes; never send animation events.
4. Server is authoritative for text, clock, and outcome.
5. Rounds 1 and 2 grant HP advantage into Round 3; the fight always decides.
6. Uncorrected errors cost damage but never block progress; backspace costs time only.
7. No database in v1. First real need is replay storage.
8. Ghost/bot opponents are required at launch, not optional.
9. Replay determinism is designed in from Milestone 1.
10. New arenas over new mechanics.
11. Production target is all-Cloudflare (Workers + Durable Objects + R2), ported at Milestone 4 — not earlier.
12. Room logic sits behind a `Transport` interface so Node and Durable Objects are interchangeable.
13. Timing is deadline-based; there is no server tick loop.
