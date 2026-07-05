import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { profileDir } from "./store";
import { parseFile } from "./frontmatter";
import { RESERVED } from "./types";

export interface ValidationIssue { file: string; problem: string }

// Check a bundle against OKF's conformance rules (SPEC §9):
//   1. every non-reserved `.md` has parseable YAML frontmatter
//   2. every frontmatter has a non-empty `type`
//   3. reserved files (index.md, log.md) are not required to have frontmatter
// Returns [] when the bundle is conformant.
export function validateProfile(slug: string): ValidationIssue[] {
  const root = profileDir(slug);
  if (!existsSync(root)) return [{ file: slug, problem: "no Profile bundle" }];
  const issues: ValidationIssue[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "media") walk(abs); continue; }
      if (!e.name.endsWith(".md") || RESERVED.has(e.name)) continue;
      const rel = relative(root, abs).split(sep).join("/");
      const { frontmatter } = parseFile(readFileSync(abs, "utf8"));
      if (!frontmatter) issues.push({ file: rel, problem: "missing/invalid YAML frontmatter (OKF rule 1)" });
      else if (!String(frontmatter.type ?? "").trim()) issues.push({ file: rel, problem: "frontmatter has no `type` (OKF rule 2)" });
    }
  };
  walk(root);
  return issues;
}
