import type { Frontmatter } from "./types";

// Minimal YAML-frontmatter parse/serialize. ponytail: hand-rolled, not a YAML
// lib — WE write and read this frontmatter, so it's restricted to flat
// `key: scalar` pairs plus an inline `tags: [a, b]` list. Upgrade to a real YAML
// parser only if Profiles ever need nested/multiline frontmatter.

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseScalar(raw: string): unknown {
  const t = raw.trim();
  if (t === "") return "";
  if (t.startsWith("[") && t.endsWith("]")) {
    return t.slice(1, -1).split(",").map((x) => stripQuotes(x)).filter((x) => x !== "");
  }
  if (t === "true") return true;
  if (t === "false") return false;
  return stripQuotes(t);
}

export interface ParsedFile {
  frontmatter: Frontmatter | null; // null when the file has no frontmatter block (e.g. index.md)
  body: string;
}

/** Split a `.md` file into its frontmatter (if any) and markdown body. */
export function parseFile(text: string): ParsedFile {
  const norm = text.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return { frontmatter: null, body: norm.trim() };
  const end = norm.indexOf("\n---", 4);
  if (end === -1) return { frontmatter: null, body: norm.trim() };
  const yaml = norm.slice(4, end);
  const body = norm.slice(end + 4).replace(/^\n/, "");
  const fm: Record<string, unknown> = {};
  for (const line of yaml.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i === -1) continue;
    fm[line.slice(0, i).trim()] = parseScalar(line.slice(i + 1));
  }
  if (typeof fm.type !== "string" || !fm.type) return { frontmatter: null, body: norm.trim() };
  return { frontmatter: fm as Frontmatter, body: body.trim() };
}

function serializeValue(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => String(x)).join(", ")}]`;
  return String(v);
}

/** Serialize frontmatter + body back to a `.md` file (stable key order). */
export function serializeFile(fm: Frontmatter, body: string): string {
  const ordered = ["type", "title", "description", "resource", "tags", "timestamp", "source"];
  const keys = [...ordered.filter((k) => fm[k] !== undefined), ...Object.keys(fm).filter((k) => !ordered.includes(k))];
  const lines = keys
    .filter((k) => fm[k] !== undefined && !(Array.isArray(fm[k]) && (fm[k] as unknown[]).length === 0))
    .map((k) => `${k}: ${serializeValue(fm[k])}`);
  return `---\n${lines.join("\n")}\n---\n\n${body.trim()}\n`;
}

// ── self-check: `pnpm --filter @takt/profile check` ──────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  const src = serializeFile(
    { type: "Specs", title: "Ports", tags: ["io", "rear"], source: "owner-manual.pdf" },
    "Two USB-C ports on the rear. ![](media/ports.png)",
  );
  const { frontmatter, body } = parseFile(src);
  assert(frontmatter?.type === "Specs", "type round-trips");
  assert(frontmatter?.title === "Ports", "title round-trips");
  assert(Array.isArray(frontmatter?.tags) && frontmatter!.tags![1] === "rear", "tags list round-trips");
  assert(body.includes("![](media/ports.png)"), "body preserved");
  // no-frontmatter file (index.md) → null frontmatter, body intact
  const idx = parseFile("# Index\n\n* [Specs](specs.md)");
  assert(idx.frontmatter === null && idx.body.startsWith("# Index"), "index.md has no frontmatter");
  // a file whose frontmatter lacks `type` is treated as bodyless-invalid → null fm
  assert(parseFile("---\ntitle: x\n---\nhi").frontmatter === null, "missing type → no frontmatter");
  console.log("frontmatter self-check ok");
}
