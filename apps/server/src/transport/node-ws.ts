import { randomUUID } from "node:crypto";
import type { WebSocket, WebSocketServer } from "ws";
import {
  clientMessageSchema,
  type ClientMessage,
  type ServerMessage,
  type Transport,
} from "@typefeud/protocol";

/**
 * Local-dev transport. SPEC §4.6.
 *
 * The production counterpart is DurableObjectTransport (Milestone 4). Room
 * logic must depend only on the Transport interface so the two are
 * interchangeable — SPEC §10.7 step 9 keeps this one alive permanently for
 * fast local iteration.
 */
export class NodeWsTransport implements Transport {
  private readonly sockets = new Map<string, WebSocket>();
  private messageCb: ((playerId: string, msg: ClientMessage) => void) | null = null;
  private closeCb: ((playerId: string) => void) | null = null;

  constructor(wss: WebSocketServer) {
    wss.on("connection", (ws) => {
      const playerId = randomUUID();
      this.sockets.set(playerId, ws);

      ws.on("message", (raw) => {
        // Validate at the boundary — nothing downstream sees unparsed input. SPEC §4.4.
        const parsed = clientMessageSchema.safeParse(safeJson(raw.toString()));
        if (!parsed.success) {
          console.warn(`[transport] dropped malformed message from ${playerId}`);
          return;
        }
        this.messageCb?.(playerId, parsed.data);
      });

      ws.on("close", () => {
        this.sockets.delete(playerId);
        this.closeCb?.(playerId);
      });
    });
  }

  send(playerId: string, msg: ServerMessage): void {
    this.sockets.get(playerId)?.send(JSON.stringify(msg));
  }

  broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const ws of this.sockets.values()) ws.send(payload);
  }

  onMessage(cb: (playerId: string, msg: ClientMessage) => void): void {
    this.messageCb = cb;
  }

  onClose(cb: (playerId: string) => void): void {
    this.closeCb = cb;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
