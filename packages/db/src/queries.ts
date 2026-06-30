import { randomUUID } from "node:crypto";
import type {
  Product, Manual, PageImage, SearchResult, Provider,
  Artifact, ChatSummary, ChatMessage, ManualKind, ChunkKind,
  ProviderKind, ArtifactKind, MessageBlock, MessageRole,
} from "@prox/shared";
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

// ─── Chunks + vectors ──────────────────────────────────────────────────────
export function chunkExists(contentHash: string): boolean {
  return !!db().prepare(`SELECT 1 FROM chunks WHERE content_hash = ?`).get(contentHash);
}

export function insertChunk(c: {
  productId: string; manualId: string; pageNumber: number;
  kind: ChunkKind; content: string; contentHash: string; embedding: Float32Array;
}): void {
  const tx = db().transaction(() => {
    const info = db().prepare(
      `INSERT OR IGNORE INTO chunks (product_id, manual_id, page_number, kind, content, content_hash)
       VALUES (?,?,?,?,?,?)`,
    ).run(c.productId, c.manualId, c.pageNumber, c.kind, c.content, c.contentHash);
    if (info.changes === 0) return; // already present (idempotent)
    const chunkId = BigInt(info.lastInsertRowid); // vec0 metadata column needs a true INTEGER
    db().prepare(
      `INSERT INTO vec_chunks (product_id, chunk_id, embedding) VALUES (?, ?, ?)`,
    ).run(c.productId, chunkId, JSON.stringify(Array.from(c.embedding)));
  });
  tx();
}

export function matchChunks(
  productId: string, queryEmbedding: Float32Array, k: number, kinds?: ChunkKind[],
): SearchResult[] {
  // KNN within the product partition, then join chunk metadata. Over-fetch a
  // little so an optional kind filter still returns k results.
  const fetchK = kinds && kinds.length ? k * 3 : k;
  const rows = db().prepare(
    `SELECT chunk_id AS chunkId, distance FROM vec_chunks
     WHERE product_id = ? AND embedding MATCH ? AND k = ? ORDER BY distance`,
  ).all(productId, JSON.stringify(Array.from(queryEmbedding)), fetchK) as { chunkId: number; distance: number }[];
  if (!rows.length) return [];

  const byId = new Map(rows.map((r) => [Number(r.chunkId), r.distance]));
  const ids = rows.map((r) => Number(r.chunkId));
  const placeholders = ids.map(() => "?").join(",");
  const chunkRows = db().prepare(
    `SELECT c.id AS id, c.content, c.page_number AS pageNumber, c.kind, m.kind AS manualKind, m.title AS manualTitle
     FROM chunks c JOIN manuals m ON m.id = c.manual_id
     WHERE c.id IN (${placeholders})`,
  ).all(...ids) as { id: number; content: string; pageNumber: number; kind: ChunkKind; manualKind: ManualKind; manualTitle: string }[];

  return chunkRows
    .filter((r) => !kinds || !kinds.length || kinds.includes(r.kind))
    .map((r) => ({
      content: r.content, pageNumber: r.pageNumber, manualKind: r.manualKind,
      manualTitle: r.manualTitle, kind: r.kind,
      score: 1 - (byId.get(r.id) ?? 1), // cosine distance → rough similarity
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
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
  const ciphertext = p.apiKey ? encryptSecret(p.apiKey) : null;
  const last4 = p.apiKey ? p.apiKey.slice(-4) : null;
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
  if (p.apiKey) {
    db().prepare(`UPDATE providers SET api_key_ciphertext=?, key_last4=? WHERE id=?`)
      .run(encryptSecret(p.apiKey), p.apiKey.slice(-4), id);
  }
  if (p.isDefault) {
    db().prepare(`UPDATE providers SET is_default = 0`).run();
    db().prepare(`UPDATE providers SET is_default = 1 WHERE id=?`).run(id);
  }
  return listProviders().find((x) => x.id === id);
}

/** Server-only: decrypt a provider's API key. Never exposed over HTTP. */
export function getProviderApiKey(id: string): string | null {
  const row = db().prepare(`SELECT api_key_ciphertext AS c FROM providers WHERE id=?`).get(id) as { c: string | null } | undefined;
  return row?.c ? decryptSecret(row.c) : null;
}

// ─── Chats + messages ──────────────────────────────────────────────────────
export function createChat(productId: string, id?: string, title = "New chat"): ChatSummary {
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

export function addMessage(chatId: string, role: MessageRole, content: MessageBlock[]): ChatMessage {
  const id = randomUUID();
  db().prepare(`INSERT INTO messages (id, chat_id, role, content_json) VALUES (?,?,?,?)`)
    .run(id, chatId, role, JSON.stringify(content));
  return db().prepare(
    `SELECT id, chat_id AS chatId, role, content_json AS content, created_at AS createdAt FROM messages WHERE id=?`,
  ).get(id) as any as ChatMessage;
}

export function listMessages(chatId: string): ChatMessage[] {
  const rows = db().prepare(
    `SELECT id, chat_id AS chatId, role, content_json AS content, created_at AS createdAt
     FROM messages WHERE chat_id=? ORDER BY created_at`,
  ).all(chatId) as any[];
  return rows.map((r) => ({ ...r, content: JSON.parse(r.content) as MessageBlock[] }));
}

// ─── Artifacts ─────────────────────────────────────────────────────────────
const ARTIFACT_COLS = `id, product_id AS productId, chat_id AS chatId, title, kind, code,
  group_key AS groupKey, version, thumbnail_path AS thumbnailPath, created_at AS createdAt`;

// Next version number for an artifact lineage (chat + groupKey). 1 if none yet.
export function nextArtifactVersion(chatId: string | null | undefined, groupKey: string): number {
  const row = db().prepare(
    `SELECT COALESCE(MAX(version), 0) AS maxV FROM artifacts WHERE group_key=? AND chat_id IS ?`,
  ).get(groupKey, chatId ?? null) as { maxV: number };
  return row.maxV + 1;
}

export function createArtifact(a: {
  productId: string; chatId?: string | null; title: string; kind: ArtifactKind; code: string;
  groupKey?: string; version?: number;
}): Artifact {
  const id = randomUUID();
  const groupKey = a.groupKey ?? id;
  const version = a.version ?? 1;
  db().prepare(
    `INSERT INTO artifacts (id, product_id, chat_id, title, kind, code, group_key, version) VALUES (?,?,?,?,?,?,?,?)`,
  ).run(id, a.productId, a.chatId ?? null, a.title, a.kind, a.code, groupKey, version);
  return getArtifact(id)!;
}

export function getArtifact(id: string): Artifact | undefined {
  return db().prepare(`SELECT ${ARTIFACT_COLS} FROM artifacts WHERE id=?`).get(id) as Artifact | undefined;
}

export function listArtifacts(productId: string): Artifact[] {
  return db().prepare(
    `SELECT ${ARTIFACT_COLS} FROM artifacts WHERE product_id=? ORDER BY created_at DESC`,
  ).all(productId) as Artifact[];
}

export function listArtifactsByChat(chatId: string): Artifact[] {
  return db().prepare(
    `SELECT ${ARTIFACT_COLS} FROM artifacts WHERE chat_id=? ORDER BY created_at ASC`,
  ).all(chatId) as Artifact[];
}
