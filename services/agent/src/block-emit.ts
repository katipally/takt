import type { MessageBlock, SseEvent } from "@takt/shared";

export type Emit = (e: SseEvent) => Promise<void> | void;

// Fold one SSE event into an ordered MessageBlock[] so a turn replays in order on
// reload. Shared by the HTTP chat server and the live-voice session (they used to
// each carry a copy). Pure — the caller owns forwarding over the wire + any gating.
export function foldBlock(blocks: MessageBlock[], e: SseEvent): void {
  switch (e.type) {
    case "text_delta":
    case "reasoning_delta": {
      const kind = e.type === "text_delta" ? "text" : "reasoning";
      const last = blocks[blocks.length - 1];
      if (last && last.type === kind) last.text += e.text;
      else blocks.push({ type: kind, text: e.text });
      break;
    }
    case "tool_start": blocks.push({ type: "tool", id: e.id, tool: e.tool, summary: e.summary, status: "done" }); break;
    case "tool_done": {
      const t = blocks.find((b) => b.type === "tool" && b.id === e.id);
      if (t && t.type === "tool") t.detail = e.detail;
      break;
    }
    case "source":
      blocks.push({ type: "source", citationId: e.citationId, url: e.url, page: e.page, manualKind: e.manualKind as any, manualTitle: e.manualTitle ?? null, caption: e.caption ?? null, productSlug: e.productSlug ?? null, productName: e.productName ?? null });
      break;
    case "canvas_start": {
      // Find-or-create: start_canvas (shell) then build_canvas reuse one id.
      const c = blocks.find((b) => b.type === "canvas" && b.canvasId === e.canvasId);
      if (c && c.type === "canvas") { if (e.title) c.title = e.title; }
      else blocks.push({ type: "canvas", canvasId: e.canvasId, title: e.title, html: "" });
      break;
    }
    case "canvas_delta": {
      // delta carries the FULL decoded HTML so far (idempotent replace).
      const c = blocks.find((b) => b.type === "canvas" && b.canvasId === e.canvasId);
      if (c && c.type === "canvas") c.html = e.html;
      else blocks.push({ type: "canvas", canvasId: e.canvasId, html: e.html });
      break;
    }
    case "canvas_end": {
      const c = blocks.find((b) => b.type === "canvas" && b.canvasId === e.canvasId);
      if (c && c.type === "canvas") { c.html = e.html; if (e.title) c.title = e.title; }
      else blocks.push({ type: "canvas", canvasId: e.canvasId, title: e.title, html: e.html });
      break;
    }
    case "ask_user": blocks.push({ type: "ask_user", askId: e.askId, questions: e.questions }); break;
    case "ask_answer": {
      const a = blocks.find((b) => b.type === "ask_user" && b.askId === e.askId);
      if (a && a.type === "ask_user") { a.answers = e.answers; a.cancelled = e.cancelled; }
      break;
    }
  }
}

// Fold + forward, serializing writes so concurrent emitters (main agent + a
// background canvas build) can't interleave a half-frame over the SSE stream.
export function makeBlockEmit(write: (e: SseEvent) => Promise<void> | void): { emit: Emit; blocks: MessageBlock[] } {
  const blocks: MessageBlock[] = [];
  let writeChain: Promise<void> = Promise.resolve();
  const emit: Emit = async (e) => {
    foldBlock(blocks, e);
    writeChain = writeChain.then(() => write(e));
    await writeChain;
  };
  return { emit, blocks };
}
