import { z } from "zod";

/**
 * Wire protocol. SPEC §4.4.
 *
 * Every inbound message is validated with zod at the transport boundary —
 * both directions, both ends. Nothing downstream of the parse may assume
 * a shape it didn't get from here.
 */

export const tierSchema = z.enum(["jab", "combo", "haymaker"]);
export const roundNameSchema = z.enum(["trigger", "debate", "roast", "fight"]);

export const lineSchema = z.object({
  id: z.string(),
  tier: tierSchema,
  text: z.string(),
  wordCount: z.number().int().positive(),
});

export const keystrokeSchema = z.object({
  t: z.number().nonnegative(),
  key: z.string().min(1),
});

export const keystrokeTraceSchema = z.array(keystrokeSchema);

/**
 * The whole of what one player's in-flight typing tells the other. SPEC §4.3.
 *
 * One schema, used by the client's `progress` and the server's
 * `opponent.progress`, because they are the same payload seen from two ends —
 * the server relays it, it does not enrich it. Keeping it in one place is what
 * lets the scripted ghost (#7) and a live socket (#14) feed the identical
 * shape into `applyProgressSnapshot`.
 */
export const progressSnapshotSchema = z.object({
  lineId: z.string(),
  charIndex: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});

export type ProgressSnapshot = z.infer<typeof progressSnapshotSchema>;

// ── client → server ─────────────────────────────────────────────────────────

export const clientMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("queue.join"), nickname: z.string().min(1).max(20) }),
  z.object({ t: z.literal("queue.leave") }),
  progressSnapshotSchema.extend({ t: z.literal("progress") }),
  z.object({
    t: z.literal("line.commit"),
    lineId: z.string(),
    keystrokes: keystrokeTraceSchema,
  }),
  z.object({ t: z.literal("special.use") }),
  z.object({ t: z.literal("taunt.send"), tauntId: z.string() }),
  z.object({ t: z.literal("ping"), clientTime: z.number() }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ── server → client ─────────────────────────────────────────────────────────

export const serverMessageSchema = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("match.found"),
    matchId: z.string(),
    arena: z.string(),
    opponent: z.object({ nickname: z.string() }),
    seed: z.number().int(),
  }),
  z.object({
    t: z.literal("round.start"),
    round: roundNameSchema,
    options: z.tuple([lineSchema, lineSchema, lineSchema]),
    serverTime: z.number(),
    endsAt: z.number(),
  }),
  progressSnapshotSchema.extend({ t: z.literal("opponent.progress") }),
  z.object({
    t: z.literal("line.resolved"),
    by: z.enum(["self", "opponent"]),
    damage: z.number(),
    newHp: z.number(),
    special: z.boolean(),
  }),
  z.object({ t: z.literal("sabotage"), durationMs: z.number().positive() }),
  z.object({
    t: z.literal("round.end"),
    hp: z.object({ self: z.number(), opponent: z.number() }),
    winner: z.union([z.literal(0), z.literal(1), z.null()]),
  }),
  z.object({
    t: z.literal("match.end"),
    outcome: z.enum(["win", "loss", "draw"]),
    stats: z.record(z.string(), z.number()),
    replayId: z.string(),
  }),
  z.object({ t: z.literal("pong"), clientTime: z.number(), serverTime: z.number() }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

// ── transport ───────────────────────────────────────────────────────────────

/**
 * SPEC §4.6. Room logic never touches a raw `ws` object. NodeWsTransport for
 * local dev, DurableObjectTransport for production (Milestone 4) — swapping
 * one for the other must not require touching room logic.
 */
export interface Transport {
  send(playerId: string, msg: ServerMessage): void;
  broadcast(msg: ServerMessage): void;
  onMessage(cb: (playerId: string, msg: ClientMessage) => void): void;
  onClose(cb: (playerId: string) => void): void;
}

/** Progress snapshots are sent at ~10Hz, never per keystroke. SPEC §4.3. */
export const PROGRESS_SNAPSHOT_INTERVAL_MS = 100;

/** Clock sync: ping 5×, take the median offset. SPEC §4.5. */
export const CLOCK_SYNC_PING_COUNT = 5;

/** Disconnect grace before forfeit. SPEC §4.6. */
export const RECONNECT_GRACE_MS = 15_000;
