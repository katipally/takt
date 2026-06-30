#!/usr/bin/env node
// Lightweight accuracy smoke test. Hits the running agent service (pnpm dev) with
// a set of golden questions and checks each answer is grounded/cited/non-refusal.
// Not a unit-test framework — just a confidence + regression net for the demo.
//
//   pnpm dev      # in one terminal (web :3000, agent :8787)
//   pnpm smoke    # in another
//
// ponytail: plain node (fetch + async-iterable body, Node 20+), no deps, no build.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_URL = process.env.AGENT_URL || "http://localhost:8787";
const PER_Q_TIMEOUT_MS = 180_000;

const { questions } = JSON.parse(readFileSync(resolve(ROOT, "seed/golden-questions.json"), "utf8"));
const CITE = /\[p\.?\s*\d+\]/i;
const REFUSAL = /\b(?:don'?t|do not|cannot|can'?t|could ?n'?t|not able to|unable to)\b[^.]*\b(?:find|locate|cover|have|see|available|information)\b|not (?:covered|mentioned|included|in (?:the|these) manual)/i;

async function ask({ product, q, expect }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_Q_TIMEOUT_MS);
  const seen = { text: "", image: false, artifact: false, ask: false, error: null };
  try {
    const res = await fetch(`${AGENT_URL}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // chatId "" → server skips DB writes, so smoke runs never pollute chat history.
      body: JSON.stringify({ productSlug: product, chatId: "", messages: [{ role: "user", text: q }] }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const decoder = new TextDecoder();
    let buf = "";
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let sep;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          let e;
          try { e = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (e.type === "text_delta") seen.text += e.text;
          else if (e.type === "page_image") seen.image = true;
          else if (e.type === "artifact") seen.artifact = true;
          else if (e.type === "error") seen.error = e.message;
          else if (e.type === "ask_user") {
            seen.ask = true;
            // Unblock the agent (it awaits an answer up to 280s) so the stream ends.
            fetch(`${AGENT_URL}/chat/answer`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ askId: e.askId, cancelled: true }),
            }).catch(() => {});
          } else if (e.type === "done") { buf = ""; }
        }
      }
    }
  } catch (err) {
    if (!seen.error) seen.error = String(err?.message ?? err);
  } finally {
    clearTimeout(timer);
  }

  const text = seen.text.trim();
  let pass, why;
  if (seen.error) { pass = false; why = `error: ${seen.error}`; }
  else if (expect === "ask") { pass = seen.ask; why = seen.ask ? "asked to clarify" : "no clarifying question"; }
  else if (expect === "image") { pass = seen.image; why = seen.image ? "surfaced a page" : "no page image"; }
  else if (!text) { pass = false; why = "empty answer"; }
  else if (REFUSAL.test(text)) { pass = false; why = "looks like a refusal"; }
  else if (expect === "cited") { pass = CITE.test(text); why = CITE.test(text) ? "cited" : "no [p.N] citation"; }
  else { pass = true; why = seen.artifact ? "answered (+artifact)" : "answered"; }
  return { product, q, expect, pass, why };
}

const results = [];
for (const item of questions ?? []) {
  process.stdout.write(`· ${item.q.slice(0, 60)}… `);
  const r = await ask(item);
  results.push(r);
  console.log(r.pass ? `\x1b[32mPASS\x1b[0m (${r.why})` : `\x1b[31mFAIL\x1b[0m (${r.why})`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length) {
  console.log("Failures:");
  for (const r of failed) console.log(`  ✗ [${r.expect}] ${r.q} — ${r.why}`);
  process.exit(1);
}
