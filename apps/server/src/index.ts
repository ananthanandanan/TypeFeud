import { WebSocketServer } from "ws";
import { NodeWsTransport } from "./transport/node-ws";

/**
 * Authoritative game server. SPEC §4.3, §4.6.
 *
 * Stands up in Milestone 3. Until then this is a health-check socket that
 * proves the toolchain and the Transport seam are wired correctly.
 *
 * Timing is deadline-based — there is no setInterval game loop here, and
 * there must never be one. See SPEC §4.6 and §10.5.
 */

const PORT = Number(process.env.PORT ?? 3001);

const wss = new WebSocketServer({ port: PORT });
const transport = new NodeWsTransport(wss);

transport.onMessage((playerId, msg) => {
  if (msg.t === "ping") {
    transport.send(playerId, { t: "pong", clientTime: msg.clientTime, serverTime: Date.now() });
  }
  // Milestone 3: route into the room's message handler.
});

transport.onClose((playerId) => {
  console.log(`[server] ${playerId} disconnected`);
});

console.log(`[server] listening on ws://localhost:${PORT}`);
