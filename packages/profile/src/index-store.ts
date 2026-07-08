import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { profileDir } from "./store";
import type { Chunk, MediaItem } from "./types";

// The compiled, regenerable index for a product, under <slug>/.index/.
// Built once at ingest; read (and cached) at runtime. The markdown Profile is
// the source of truth — everything here can be rebuilt from it + the media/.

export function indexDir(slug: string): string {
  return join(profileDir(slug), ".index");
}
export function indexExists(slug: string): boolean {
  return existsSync(join(indexDir(slug), "chunks.json"));
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, "utf8")) as T; } catch { return fallback; }
}
function writeJson(path: string, data: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data));
}

// ── chunks ───────────────────────────────────────────────────────────────────
export function loadChunks(slug: string): Chunk[] {
  return readJson<Chunk[]>(join(indexDir(slug), "chunks.json"), []);
}
export function saveChunks(slug: string, chunks: Chunk[]): void {
  writeJson(join(indexDir(slug), "chunks.json"), chunks);
}

// ── media index ──────────────────────────────────────────────────────────────
export function loadMedia(slug: string): MediaItem[] {
  return readJson<MediaItem[]>(join(indexDir(slug), "media.json"), []);
}
export function saveMedia(slug: string, media: MediaItem[]): void {
  writeJson(join(indexDir(slug), "media.json"), media);
}
export function addMedia(slug: string, items: MediaItem[]): void {
  saveMedia(slug, [...loadMedia(slug), ...items]);
}
