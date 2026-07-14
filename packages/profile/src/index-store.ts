import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { profileDir } from "./store";
import type { MediaItem } from "./types";

// The regenerable media registry for a product, under <slug>/.index/media.json.
// Written at ingest (pages, meshes, video clips, images); the graph build reads
// it to create kg_media rows. The markdown Profile stays the source of truth.

export function indexDir(slug: string): string {
  return join(profileDir(slug), ".index");
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, "utf8")) as T; } catch { return fallback; }
}
function writeJson(path: string, data: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data));
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
