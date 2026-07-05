import { listConcepts } from "./store";

// Direct Corpus Interaction over a Profile: a pure-JS line grep across the
// bundle's concept markdown. No embeddings, no index — the .md files ARE the
// store. Bundles are KB-scale so a linear scan is instant and dependency-free
// (works identically in dev / Docker / HF). Swap in ripgrep behind this same
// signature only if a corpus ever grows large enough to need it.

export interface GrepHit {
  conceptId: string;
  conceptTitle: string;
  line: number;      // 1-based line within the concept body
  text: string;      // the matching line, trimmed
}

export interface GrepGroup {
  conceptId: string;
  conceptTitle: string;
  count: number;     // total matches in this concept
  hits: GrepHit[];   // capped sample
}

function toRegExp(pattern: string, flags = "i"): RegExp {
  try { return new RegExp(pattern, flags); }
  catch { return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags); } // literal fallback
}

/**
 * Grep a product's Profile. Returns matches grouped by concept, densest first
 * (a cheap relevance signal), with per-concept and total caps so a common word
 * can't flood the agent's context.
 */
export function grepProfile(
  slug: string, pattern: string,
  opts: { maxPerConcept?: number; maxConcepts?: number } = {},
): GrepGroup[] {
  const re = toRegExp(pattern);
  const maxPer = opts.maxPerConcept ?? 6;
  const maxConcepts = opts.maxConcepts ?? 12;
  const groups: GrepGroup[] = [];
  for (const c of listConcepts(slug)) {
    const title = c.frontmatter.title ?? c.id;
    const lines = c.body.split("\n");
    let count = 0;
    const hits: GrepHit[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i]!)) continue;
      count++;
      if (hits.length < maxPer) hits.push({ conceptId: c.id, conceptTitle: title, line: i + 1, text: lines[i]!.trim().slice(0, 240) });
    }
    if (count) groups.push({ conceptId: c.id, conceptTitle: title, count, hits });
  }
  return groups.sort((a, b) => b.count - a.count).slice(0, maxConcepts);
}
