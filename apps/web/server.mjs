// Custom web server. Next handles all HTTP as usual; we add ONE thing it can't:
// a WebSocket at /live that we proxy to the internal agent service. On Hugging
// Face Spaces only this web port is public, so the browser reaches the agent's
// live socket through here (adding the shared secret the browser must not hold).
import { createServer } from "node:http";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.WEB_PORT || process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8787";
const SECRET = process.env.TAKT_AGENT_SECRET || "";

const app = next({ dev, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();
const upgrade = app.getUpgradeHandler(); // Next's own HMR/websocket upgrades

const server = createServer((req, res) => handle(req, res));
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  let pathname = "/", search = "";
  try { const u = new URL(req.url ?? "", "http://localhost"); pathname = u.pathname; search = u.search; } catch { /* keep defaults */ }
  if (pathname === "/live") wss.handleUpgrade(req, socket, head, (client) => proxyLive(client, search));
  else upgrade(req, socket, head); // let Next handle _next/webpack-hmr etc.
});

// Bridge the browser socket to the agent's /live socket, both directions.
function proxyLive(client, search) {
  const target = AGENT_URL.replace(/^http/, "ws") + "/live" + search;
  const upstream = new WebSocket(target, { headers: { "x-takt-secret": SECRET } });
  const queue = [];
  upstream.on("open", () => { for (const [d, b] of queue) upstream.send(d, { binary: b }); queue.length = 0; });
  client.on("message", (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
    else if (upstream.readyState === WebSocket.CONNECTING) queue.push([data, isBinary]);
  });
  upstream.on("message", (data, isBinary) => { if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary }); });
  const close = () => { try { client.close(); } catch { /* */ } try { upstream.close(); } catch { /* */ } };
  client.on("close", close); client.on("error", close);
  upstream.on("close", close); upstream.on("error", (e) => { console.error("[web] live upstream error:", e.message); close(); });
}

server.listen(port, hostname, () => console.log(`▸ Takt web on http://${hostname}:${port}`));
