import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import { getProductBySlug, getManualsByProduct } from "@prox/db";
import { LiveSession } from "./session.js";

// Attach the /live WebSocket to the agent's existing http.Server (the one
// @hono/node-server's serve() returns), leaving every HTTP route untouched.
// ponytail: raw ws.WebSocketServer on serve()'s server — avoids bumping
// @hono/node-server v1→v2 just to get upgradeWebSocket.
export function attachLiveWs(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const AGENT_SECRET = process.env.PROX_AGENT_SECRET?.trim() || "";

  server.on("upgrade", (req, socket, head) => {
    let url: URL;
    try { url = new URL(req.url ?? "", "http://localhost"); } catch { socket.destroy(); return; }
    if (url.pathname !== "/live") { socket.destroy(); return; }
    // Only the trusted web proxy (which holds the secret) may open a live socket.
    if (AGENT_SECRET && req.headers["x-prox-secret"] !== AGENT_SECRET) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); return;
    }
    // No product (or "master") → a master live session that can search across all
    // products. A given-but-unknown slug is still a 404 (stale link / typo).
    const slug = url.searchParams.get("product") ?? "";
    const product = slug && slug !== "master" ? getProductBySlug(slug) : null;
    if (slug && slug !== "master" && !product) { socket.write("HTTP/1.1 404 Not Found\r\n\r\n"); socket.destroy(); return; }
    const manuals = product ? getManualsByProduct(product.id) : [];
    const chatId = url.searchParams.get("chat") ?? "";
    wss.handleUpgrade(req, socket, head, (ws) => {
      void new LiveSession(ws, product ?? null, manuals, chatId).start();
    });
  });
  // The browser runs the voice models on-device now; the server just streams LLM
  // text and persists the conversation, so /live is cheap and free-tier friendly.
  return wss;
}
