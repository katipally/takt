import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { PRODUCTS_DIR } from "@takt/db";
import { parseFile, serializeFile } from "./frontmatter";
import { type Concept, type Frontmatter, RESERVED } from "./types";

// Filesystem layer for Profile bundles under data/products/<slug>/. Concept id =
// path within the bundle minus the `.md` suffix (OKF §concept-id).

export function profileDir(slug: string): string {
  return join(PRODUCTS_DIR, slug);
}
export function mediaDir(slug: string): string {
  return join(profileDir(slug), "media");
}
export function profileExists(slug: string): boolean {
  return existsSync(profileDir(slug));
}

// Recursively collect concept ids (non-reserved `.md` files), forward-slashed.
export function listConceptIds(slug: string): string[] {
  const root = profileDir(slug);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "media") walk(abs); continue; }
      if (!entry.name.endsWith(".md") || RESERVED.has(entry.name)) continue;
      out.push(relative(root, abs).slice(0, -3).split(sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

export function readConcept(slug: string, id: string): Concept | undefined {
  const file = join(profileDir(slug), `${id}.md`);
  if (!existsSync(file)) return undefined;
  const { frontmatter, body } = parseFile(readFileSync(file, "utf8"));
  if (!frontmatter) return undefined;
  return { id, frontmatter, body };
}

export function listConcepts(slug: string): Concept[] {
  return listConceptIds(slug).map((id) => readConcept(slug, id)).filter((c): c is Concept => !!c);
}

export function writeConcept(slug: string, id: string, frontmatter: Frontmatter, body: string): void {
  const file = join(profileDir(slug), `${id}.md`);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, serializeFile(frontmatter, body));
}

/** Media asset path inside the bundle (writes into media/). Returns the bundle-relative link. */
export function writeMedia(slug: string, filename: string, data: Uint8Array): string {
  mkdirSync(mediaDir(slug), { recursive: true });
  writeFileSync(join(mediaDir(slug), filename), data);
  return `media/${filename}`;
}

// ── reserved files ───────────────────────────────────────────────────────────
export function readIndex(slug: string): string | undefined {
  const file = join(profileDir(slug), "index.md");
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}
export function writeIndex(slug: string, content: string): void {
  mkdirSync(profileDir(slug), { recursive: true });
  writeFileSync(join(profileDir(slug), "index.md"), content.trim() + "\n");
}

/** Build index.md body from concepts' frontmatter (OKF progressive disclosure). */
export function generateIndex(slug: string, productName: string): string {
  const concepts = listConcepts(slug);
  const byType = new Map<string, Concept[]>();
  for (const c of concepts) {
    const t = c.frontmatter.type;
    (byType.get(t) ?? byType.set(t, []).get(t)!).push(c);
  }
  const lines = [`# ${productName}`, ""];
  for (const [type, list] of byType) {
    lines.push(`## ${type}`);
    for (const c of list) {
      const title = c.frontmatter.title ?? c.id;
      const desc = c.frontmatter.description ? ` — ${c.frontmatter.description}` : "";
      lines.push(`* [${title}](${c.id}.md)${desc}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Remove a product's bundle so an ingest/author can rebuild it cleanly. */
export function deleteProfile(slug: string): void {
  const root = profileDir(slug);
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
}
