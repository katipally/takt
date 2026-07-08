// A canvas block the user double-clicked to scope the next message to (surgical
// edit). We encode it as a prefix on the outgoing message so the agent can read the
// data-takt-id and target it; the chat UI parses it back out to show a clean chip
// instead of the raw prefix. Keep the format in sync on both sides — here.
export interface CanvasSelection { id: string; text: string }

const RE = /^Selected on canvas \(data-takt-id="([^"]*)"\): "([\s\S]*?)"\n\n([\s\S]*)$/;

export function encodeSelection(sel: CanvasSelection, body: string): string {
  return `Selected on canvas (data-takt-id="${sel.id}"): "${sel.text}"\n\n${body}`;
}

export function parseSelection(text: string): { selection: CanvasSelection | null; body: string } {
  const m = RE.exec(text);
  if (m) return { selection: { id: m[1]!, text: m[2]! }, body: m[3]! };
  return { selection: null, body: text };
}

// A short human label for a selection chip (prefer the block's text, fall back to id).
export function selectionLabel(sel: CanvasSelection): string {
  const t = (sel.text || "").trim();
  return t ? (t.length > 48 ? t.slice(0, 47) + "…" : t) : sel.id;
}
