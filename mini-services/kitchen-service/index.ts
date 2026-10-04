/**
 * Kitchen Service — Socket.io mini-service.
 *
 * Responsibilities:
 *   1. Hold a long-lived Socket.io server on port 3003 (Next.js API routes
 *      are stateless, so a separate process is required for a real WS server).
 *   2. Expose an internal HTTP endpoint `POST /broadcast` that the Next.js
 *      backend calls when a new kitchen order is created or updated.
 *      The body is forwarded to every connected client.
 *   3. Expose `GET /healthz` for sanity checks.
 *
 * Frontend connection contract (per Caddy gateway rules):
 *   io("/", { query: { XTransformPort: "3003" } })
 *   — Socket.io uses its default path `/socket.io/` so requests hit
 *     `/socket.io/?XTransformPort=3003&EIO=4&transport=polling`.
 *
 * Event names pushed to clients:
 *   - `kitchen:order:new`         — a new order arrived from the POS
 *   - `kitchen:order:update`      — an existing order changed status
 *   - `kitchen:connected`         — initial handshake
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { Server } from "socket.io";

const PORT = 3003;
const SOCKET_IO_PATH = "/socket.io/"; // default

// ─── Create the HTTP server FIRST with no callback ─────────────────────────
// We attach our own "request" listener AFTER Socket.io so the order is:
//   1. Socket.io's listener (handles /socket.io/* paths)
//   2. Our listener (handles /healthz, /broadcast, returns 404 otherwise)
// Both listeners fire for every request because Node emits "request" to
// ALL registered listeners.

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  path: SOCKET_IO_PATH,
});

// Attach our own HTTP handler. We must register it AFTER `new Server(httpServer)`
// so Socket.io has the first chance to handle /socket.io/* requests.
httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
  // Skip Socket.io's own paths — Socket.io's listener (registered earlier)
  // handles those, and if we also try to respond we'll crash with
  // ERR_HTTP_HEADERS_SENT.
  if ((req.url ?? "/").startsWith(SOCKET_IO_PATH)) {
    return;
  }

  // CORS — permissive for the hackathon spike.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = (req.url ?? "/").split("?")[0];

  if (req.method === "GET" && url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        port: PORT,
        clients: io.engine.clientsCount,
      })
    );
    return;
  }

  // Internal endpoint: POST /broadcast
  // Body: { event: string, payload: any }
  if (req.method === "POST" && url === "/broadcast") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (!data?.event) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "missing event" }));
          return;
        }
        io.emit(data.event, data.payload);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ ok: true, delivered: io.engine.clientsCount })
        );
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  // Let other paths 404.
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

io.on("connection", (socket) => {
  console.log(`[kitchen-service] client connected: ${socket.id}`);
  socket.emit("kitchen:connected", { ts: Date.now() });

  socket.on("disconnect", (reason) => {
    console.log(
      `[kitchen-service] client disconnected: ${socket.id} (${reason})`
    );
  });
});

httpServer.listen(PORT, "127.0.0.1", () => {
  console.log(
    `[kitchen-service] HTTP + Socket.io (path=${SOCKET_IO_PATH}) listening on http://localhost:${PORT}`
  );
});
