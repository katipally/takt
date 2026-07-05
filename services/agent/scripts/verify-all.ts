// End-to-end wiring check: CHAT (HTTP/SSE) and LIVE (WebSocket) each across the
// PS5 product, the Vulcan product, and master (no product) — proving the agent
// grounds in the RIGHT product's data dynamically, shifts per product with no
// cross-bleed, and that master searches across all. Needs the dev stack running.
//   cd services/agent && pnpm exec tsx scripts/verify-all.ts
import WebSocket from "ws";

const WEB = process.env.WEB_URL || "http://localhost:3000";
const AGENT_WS = process.env.AGENT_WS || "ws://localhost:8787";

function sseParser(onEvent: (e: any) => void) {
  let buf = "";
  return (chunk: string) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const p = line.slice(5).trim(); if (!p) continue;
        try { onEvent(JSON.parse(p)); } catch { /* */ }
      }
    }
  };
}

async function chat(productSlug: string | null, text: string) {
  const res = await fetch(`${WEB}/api/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ productSlug, chatId: "", messages: [{ role: "user", text }] }),
  });
  let out = ""; const tools: string[] = []; const pages: string[] = [];
  const push = sseParser((e) => {
    if (e.type === "text_delta") out += e.text;
    else if (e.type === "tool_start") tools.push(e.tool);
    else if (e.type === "page_image") pages.push(e.productSlug ?? e.manualTitle ?? "?");
  });
  const dec = new TextDecoder();
  for await (const chunk of res.body as any) push(dec.decode(chunk));
  return { out, tools, pages };
}

function live(productSlug: string, text: string): Promise<{ out: string; tools: string[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${AGENT_WS}/live?product=${productSlug}&chat=`);
    let out = ""; const tools: string[] = [];
    const to = setTimeout(() => { try { ws.close(); } catch { /* */ } resolve({ out, tools }); }, 70000);
    ws.on("open", () => ws.send(JSON.stringify({ t: "user_text", text })));
    ws.on("message", (d) => {
      let m: any; try { m = JSON.parse(d.toString()); } catch { return; }
      if (m.t !== "sse") return;
      const e = m.event;
      if (e.type === "text_delta") out += e.text;
      else if (e.type === "tool_start") tools.push(e.tool);
      else if (e.type === "done") { clearTimeout(to); ws.close(); resolve({ out, tools }); }
    });
    ws.on("error", (e) => { clearTimeout(to); reject(e); });
  });
}

const has = (s: string, re: RegExp) => re.test(s);
let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail: string) {
  console.log(`${cond ? "✓" : "✗"} ${label} — ${detail}`);
  cond ? pass++ : fail++;
}

async function main() {
  console.log("── CHAT ──");
  const c1 = await chat("ps5", "In one sentence, what is this product and what storage does it use?");
  check("chat/ps5 grounds in PS5", has(c1.out, /playstation|console|ssd|game/i) && !has(c1.out, /weld|amp|electrode/i), `tools=[${c1.tools}] · "${c1.out.replace(/\n/g, " ").slice(0, 90)}"`);

  const c2 = await chat("vulcan-omnipro-220", "What is the duty cycle at 200 amps? Cite the page.");
  check("chat/vulcan grounds in Vulcan", has(c2.out, /duty cycle|amp|%/i) && !has(c2.out, /playstation|dualsense/i), `tools=[${c2.tools}] · "${c2.out.replace(/\n/g, " ").slice(0, 90)}"`);

  const c3 = await chat(null, "Name every product you have data on and one fact about each.");
  check("chat/master searches all + names both", c3.tools.includes("search_all_products") || c3.tools.includes("list_products"), `tools=[${c3.tools}]`);
  check("chat/master mentions BOTH products", has(c3.out, /playstation|ps5|console/i) && has(c3.out, /vulcan|weld/i), `"${c3.out.replace(/\n/g, " ").slice(0, 120)}"`);

  console.log("── LIVE (voice WS) ──");
  const l1 = await live("ps5", "In one sentence, what is this?");
  check("live/ps5 connects + grounds in PS5", has(l1.out, /playstation|console|game|sony/i) && !has(l1.out, /weld|electrode/i), `"${l1.out.replace(/\n/g, " ").slice(0, 90)}"`);

  const l2 = await live("vulcan-omnipro-220", "In one sentence, what is this?");
  check("live/vulcan connects + grounds in Vulcan", has(l2.out, /weld|welder|mig|multiprocess/i) && !has(l2.out, /playstation|console/i), `"${l2.out.replace(/\n/g, " ").slice(0, 90)}"`);

  const l3 = await live("master", "What products do you have data on?");
  check("live/master connects (no product) + knows both", has(l3.out, /playstation|ps5/i) && has(l3.out, /vulcan|weld/i), `"${l3.out.replace(/\n/g, " ").slice(0, 110)}"`);

  console.log(`\n${fail === 0 ? "ALL PASS" : `${fail} FAILED`} · ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("verify-all crashed:", e); process.exit(1); });
