import { randomUUID } from "node:crypto";
import type {
  Product, Manual, PageImage, Provider,
  ChatSummary, ChatMessage, ManualKind,
  ProviderKind, MessageBlock, MessageRole,
} from "@takt/shared";
import { isReservedSlug } from "@takt/shared";
import { getDb } from "./connection";
import { encryptSecret, decryptSecret } from "./crypto";

const db = () => getDb();

// ─── Products ──────────────────────────────────────────────────────────────
export function listProducts(): Product[] {
  return db().prepare(
    `SELECT id, slug, name, manufacturer, summary, hero_path AS heroPath, created_at AS createdAt
     FROM products ORDER BY name`,
  ).all() as Product[];
}

export function getProductBySlug(slug: string): Product | undefined {
  return db().prepare(
    `SELECT id, slug, name, manufacturer, summary, hero_path AS heroPath, created_at AS createdAt
     FROM products WHERE slug = ?`,
  ).get(slug) as Product | undefined;
}

export function upsertProduct(p: {
  slug: string; name: string; manufacturer?: string | null;
  summary?: string | null; heroPath?: string | null;
}): Product {
  // Guard: a product must never take a reserved slug — it would shadow a static
  // route like /master or /gallery.
  if (isReservedSlug(p.slug)) {
    throw new Error(`Slug "${p.slug}" is reserved and can't be used for a product. Pick a different slug.`);
  }
  const existing = getProductBySlug(p.slug);
  if (existing) {
    db().prepare(
      `UPDATE products SET name=?, manufacturer=?, summary=COALESCE(?, summary), hero_path=COALESCE(?, hero_path) WHERE slug=?`,
    ).run(p.name, p.manufacturer ?? null, p.summary ?? null, p.heroPath ?? null, p.slug);
    return getProductBySlug(p.slug)!;
  }
  const id = randomUUID();
  db().prepare(
    `INSERT INTO products (id, slug, name, manufacturer, summary, hero_path) VALUES (?,?,?,?,?,?)`,
  ).run(id, p.slug, p.name, p.manufacturer ?? null, p.summary ?? null, p.heroPath ?? null);
  return getProductBySlug(p.slug)!;
}

// ─── Manuals ───────────────────────────────────────────────────────────────
export function getManualsByProduct(productId: string): Manual[] {
  return db().prepare(
    `SELECT id, product_id AS productId, kind, title, pdf_path AS pdfPath, page_count AS pageCount
     FROM manuals WHERE product_id = ? ORDER BY kind`,
  ).all(productId) as Manual[];
}

export function getManualByKind(productId: string, kind: ManualKind): Manual | undefined {
  return db().prepare(
    `SELECT id, product_id AS productId, kind, title, pdf_path AS pdfPath, page_count AS pageCount
     FROM manuals WHERE product_id = ? AND kind = ?`,
  ).get(productId, kind) as Manual | undefined;
}

export function upsertManual(m: {
  productId: string; kind: ManualKind; title: string; pdfPath: string; pageCount: number;
}): Manual {
  const existing = getManualByKind(m.productId, m.kind);
  if (existing) {
    db().prepare(`UPDATE manuals SET title=?, pdf_path=?, page_count=? WHERE id=?`)
      .run(m.title, m.pdfPath, m.pageCount, existing.id);
    return { ...existing, ...m };
  }
  const id = randomUUID();
  db().prepare(
    `INSERT INTO manuals (id, product_id, kind, title, pdf_path, page_count) VALUES (?,?,?,?,?,?)`,
  ).run(id, m.productId, m.kind, m.title, m.pdfPath, m.pageCount);
  return { id, ...m };
}

// A non-PDF source (web page / youtube) reuses the `manuals` table but is keyed
// by its URL (pdf_path) instead of kind, so a product can hold many of them.
export function upsertSourceManual(m: {
  productId: string; kind: ManualKind; title: string; sourceRef: string; pageCount: number;
}): Manual {
  const existing = db().prepare(`SELECT id FROM manuals WHERE product_id=? AND pdf_path=?`)
    .get(m.productId, m.sourceRef) as { id: string } | undefined;
  const id = existing?.id ?? randomUUID();
  if (existing) {
    db().prepare(`UPDATE manuals SET title=?, kind=?, page_count=? WHERE id=?`)
      .run(m.title, m.kind, m.pageCount, id);
  } else {
    db().prepare(`INSERT INTO manuals (id, product_id, kind, title, pdf_path, page_count) VALUES (?,?,?,?,?,?)`)
      .run(id, m.productId, m.kind, m.title, m.sourceRef, m.pageCount);
  }
  return { id, productId: m.productId, kind: m.kind, title: m.title, pdfPath: m.sourceRef, pageCount: m.pageCount };
}

// ─── Page images ───────────────────────────────────────────────────────────
export function upsertPageImage(pi: {
  manualId: string; productId: string; pageNumber: number;
  pngPath: string; width: number; height: number; caption?: string | null;
}): void {
  db().prepare(
    `INSERT INTO page_images (id, manual_id, product_id, page_number, png_path, width, height, caption)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(manual_id, page_number) DO UPDATE SET
       png_path=excluded.png_path, width=excluded.width, height=excluded.height,
       caption=COALESCE(excluded.caption, page_images.caption)`,
  ).run(randomUUID(), pi.manualId, pi.productId, pi.pageNumber, pi.pngPath, pi.width, pi.height, pi.caption ?? null);
}

// All page images (with captions) for a manual, in page order — the author step
// reads these to build the Profile bundle from already-extracted content.
export function listPageImages(manualId: string): PageImage[] {
  return db().prepare(
    `SELECT id, manual_id AS manualId, product_id AS productId, page_number AS pageNumber,
            png_path AS pngPath, width, height, caption
     FROM page_images WHERE manual_id = ? ORDER BY page_number`,
  ).all(manualId) as PageImage[];
}

export function setPageCaption(manualId: string, pageNumber: number, caption: string): void {
  db().prepare(`UPDATE page_images SET caption=? WHERE manual_id=? AND page_number=?`)
    .run(caption, manualId, pageNumber);
}

export function getPageImage(productId: string, manualKind: ManualKind | null, page: number): (PageImage & { manualKind: ManualKind; manualTitle: string }) | undefined {
  const sql = `
    SELECT pi.id, pi.manual_id AS manualId, pi.product_id AS productId, pi.page_number AS pageNumber,
           pi.png_path AS pngPath, pi.width, pi.height, pi.caption,
           m.kind AS manualKind, m.title AS manualTitle
    FROM page_images pi JOIN manuals m ON m.id = pi.manual_id
    WHERE pi.product_id = ? ${manualKind ? "AND m.kind = ?" : ""} AND pi.page_number = ?`;
  const args = manualKind ? [productId, manualKind, page] : [productId, page];
  return db().prepare(sql).get(...args) as any;
}

// ─── Providers ─────────────────────────────────────────────────────────────
function rowToProvider(r: any): Provider {
  return {
    id: r.id, name: r.name, kind: r.kind,
    keyLast4: r.keyLast4, hasKey: !!r.hasKey, isDefault: !!r.isDefault,
  };
}

export function listProviders(): Provider[] {
  return (db().prepare(
    `SELECT id, name, kind, key_last4 AS keyLast4,
            (api_key_ciphertext IS NOT NULL) AS hasKey, is_default AS isDefault
     FROM providers ORDER BY is_default DESC, name`,
  ).all() as any[]).map(rowToProvider);
}

export function createProvider(p: {
  name: string; kind: ProviderKind; apiKey?: string | null; isDefault?: boolean;
}): Provider {
  const id = randomUUID();
  const key = p.apiKey?.trim() || null; // trim: pasted keys often carry a stray space/newline → 401
  const ciphertext = key ? encryptSecret(key) : null;
  const last4 = key ? key.slice(-4) : null;
  if (p.isDefault) db().prepare(`UPDATE providers SET is_default = 0`).run();
  db().prepare(
    `INSERT INTO providers (id, name, kind, api_key_ciphertext, key_last4, is_default)
     VALUES (?,?,?,?,?,?)`,
  ).run(id, p.name, p.kind, ciphertext, last4, p.isDefault ? 1 : 0);
  return listProviders().find((x) => x.id === id)!;
}

export function updateProvider(id: string, p: {
  name?: string; apiKey?: string | null; isDefault?: boolean;
}): Provider | undefined {
  if (p.name !== undefined) db().prepare(`UPDATE providers SET name=? WHERE id=?`).run(p.name, id);
  const key = p.apiKey?.trim(); // trim: pasted keys often carry a stray space/newline → 401
  if (key) {
    db().prepare(`UPDATE providers SET api_key_ciphertext=?, key_last4=? WHERE id=?`)
      .run(encryptSecret(key), key.slice(-4), id);
  }
  if (p.isDefault) {
    db().prepare(`UPDATE providers SET is_default = 0`).run();
    db().prepare(`UPDATE providers SET is_default = 1 WHERE id=?`).run(id);
  }
  return listProviders().find((x) => x.id === id);
}

/** Remove a provider's stored key (so a wrong/stale one can be cleared). */
export function clearProviderKey(id: string): Provider | undefined {
  db().prepare(`UPDATE providers SET api_key_ciphertext=NULL, key_last4=NULL WHERE id=?`).run(id);
  return listProviders().find((x) => x.id === id);
}

/** Server-only: decrypt a provider's API key. Never exposed over HTTP.
 * Tolerant of a decrypt failure (e.g. the enc-key changed after a restart):
 * returns null so the app degrades to "no key set" instead of throwing. */
export function getProviderApiKey(id: string): string | null {
  const row = db().prepare(`SELECT api_key_ciphertext AS c FROM providers WHERE id=?`).get(id) as { c: string | null } | undefined;
  if (!row?.c) return null;
  try { return decryptSecret(row.c); } catch { return null; }
}

// ─── Chats + messages ──────────────────────────────────────────────────────
// productId null → a master (no-product) chat.
export function createChat(productId: string | null, id?: string, title = "New chat"): ChatSummary {
  const chatId = id ?? randomUUID();
  db().prepare(`INSERT OR IGNORE INTO chats (id, product_id, title) VALUES (?,?,?)`)
    .run(chatId, productId, title);
  return db().prepare(
    `SELECT id, product_id AS productId, title, created_at AS createdAt FROM chats WHERE id=?`,
  ).get(chatId) as ChatSummary;
}

export function listChats(productId: string): ChatSummary[] {
  return db().prepare(
    `SELECT id, product_id AS productId, title, created_at AS createdAt
     FROM chats WHERE product_id=? ORDER BY created_at DESC`,
  ).all(productId) as ChatSummary[];
}

// Master-mode chat list: the no-product conversations.
export function listMasterChats(): ChatSummary[] {
  return db().prepare(
    `SELECT id, product_id AS productId, title, created_at AS createdAt
     FROM chats WHERE product_id IS NULL ORDER BY created_at DESC`,
  ).all() as ChatSummary[];
}

export function renameChat(id: string, title: string): void {
  db().prepare(`UPDATE chats SET title=? WHERE id=?`).run(title, id);
}

export function deleteChat(id: string): void {
  db().prepare(`DELETE FROM chats WHERE id=?`).run(id);
}

// ─── Settings (key/value) ──────────────────────────────────────────────────
export function getSetting(key: string): string | undefined {
  return (db().prepare(`SELECT value FROM settings WHERE key=?`).get(key) as { value: string } | undefined)?.value;
}

export function setSetting(key: string, value: string): void {
  db().prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = db().prepare(`SELECT key, value FROM settings`).all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ─── Suggested questions (frequency-driven) ─────────────────────────────────
// The most-asked opening questions for a product (or all products when
// productId is null → master). We take the FIRST user message of each chat as
// its "question", normalize it, and rank by how many chats started with it, then
// recency. `minCount` keeps one-off/chit-chat noise out of the empty state until
// a question has actually been asked repeatedly.
export function getFrequentQuestions(productId: string | null, limit = 6, minCount = 2): string[] {
  const rows = db().prepare(
    `SELECT m.chat_id AS chatId, m.role, m.content_json AS content, m.created_at AS createdAt
     FROM messages m JOIN chats c ON c.id = m.chat_id
     WHERE (? IS NULL OR c.product_id = ?)
     ORDER BY m.created_at ASC`,
  ).all(productId, productId) as { chatId: string; role: string; content: string; createdAt: string }[];

  // Per chat: its opening user question + whether the chat actually engaged the
  // product (assistant searched, cited a page, or showed a page image). The
  // grounded flag filters out chit-chat / off-topic openers, so only real
  // product questions surface as suggestions.
  const firstByChat = new Map<string, { text: string; at: string; grounded: boolean }>();
  for (const r of rows) {
    let entry = firstByChat.get(r.chatId);
    if (r.role === "user") {
      if (entry?.text) continue; // keep only the first user message
      let text = "";
      try {
        const blocks = JSON.parse(r.content) as { type: string; text?: string }[];
        text = (blocks.find((b) => b.type === "text")?.text ?? "").trim();
      } catch { /* skip */ }
      if (text) firstByChat.set(r.chatId, { text, at: r.createdAt, grounded: entry?.grounded ?? false });
    } else if (r.role === "assistant") {
      let grounded = false;
      try {
        const blocks = JSON.parse(r.content) as { type: string; tool?: string }[];
        grounded = blocks.some((b) => b.type === "source" || (b.type === "tool" && /search/.test(b.tool ?? "")));
      } catch { /* skip */ }
      if (grounded) firstByChat.set(r.chatId, { text: entry?.text ?? "", at: entry?.at ?? r.createdAt, grounded: true });
    }
  }

  const agg = new Map<string, { text: string; count: number; at: string }>();
  for (const { text, at, grounded } of firstByChat.values()) {
    if (!grounded || !text) continue; // only count real, product-engaged questions
    const key = text.toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "").trim();
    if (!key) continue;
    const cur = agg.get(key);
    if (cur) { cur.count++; if (at > cur.at) cur.at = at; }
    else agg.set(key, { text, count: 1, at });
  }

  return [...agg.values()]
    .filter((x) => x.count >= minCount)
    .sort((a, b) => b.count - a.count || (a.at < b.at ? 1 : -1))
    .slice(0, limit)
    .map((x) => x.text);
}

// Suggestions for a product's empty state: most-asked questions first, padded
// with the ingest-generated starters (cold start), deduped. Master (null) has no
// generated starters — the UI falls back to a generic set when this is empty.
export function getSuggestions(productId: string | null, limit = 4): string[] {
  const frequent = getFrequentQuestions(productId, limit, 2);
  let generated: string[] = [];
  if (productId) {
    const raw = getSetting(`starters:${productId}`);
    if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a)) generated = a.filter((s) => typeof s === "string"); } catch { /* ignore */ } }
  }
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const q of [...frequent, ...generated]) {
    const k = q.toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k); merged.push(q);
    if (merged.length >= limit) break;
  }
  return merged;
}

export function addMessage(chatId: string, role: MessageRole, content: MessageBlock[], live = false): ChatMessage {
  const id = randomUUID();
  db().prepare(`INSERT INTO messages (id, chat_id, role, content_json, live) VALUES (?,?,?,?,?)`)
    .run(id, chatId, role, JSON.stringify(content), live ? 1 : 0);
  return db().prepare(
    `SELECT id, chat_id AS chatId, role, content_json AS content, live, created_at AS createdAt FROM messages WHERE id=?`,
  ).get(id) as any as ChatMessage;
}

export function listMessages(chatId: string): ChatMessage[] {
  const rows = db().prepare(
    // `created_at` is second-granularity (`datetime('now')`), so live-mode turns
    // written in the same second tie. `rowid` (monotonic insertion order) breaks
    // the tie — otherwise reloaded live chats reorder (assistant before its user)
    // and the transcript "breaks up".
    `SELECT id, chat_id AS chatId, role, content_json AS content, live, created_at AS createdAt
     FROM messages WHERE chat_id=? ORDER BY created_at, rowid`,
  ).all(chatId) as any[];
  return rows.map((r) => ({ ...r, live: !!r.live, content: JSON.parse(r.content) as MessageBlock[] }));
}

/** Overwrite a message's blocks — used to re-persist an assistant turn after a
 *  background build lands its surface AFTER the turn was first saved (live mode). */
export function updateMessage(id: string, content: MessageBlock[]): void {
  db().prepare(`UPDATE messages SET content_json=? WHERE id=?`).run(JSON.stringify(content), id);
}

