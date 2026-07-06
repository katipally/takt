import { readdirSync } from "node:fs";
import { loadEnv, PRODUCTS_DIR } from "@takt/db";
import { BUILTIN_PROVIDERS, type ProviderInfo } from "@takt/harness";
import { listConcepts, pkbExists, loadGraph } from "@takt/profile";
import { buildPkb, type ExtractUnit } from "./extract.js";

// Backfill a product's PKB (knowledge graph + chunks + vectors) from its EXISTING
// OKF concept markdown — no original PDF/source needed. The markdown is the
// canonical source of truth, so a product ingested from web/markdown (e.g. ps5,
// vulcan) can still get a real graph instead of falling back to grep-only.
//
//   pnpm pkb:build --product ps5 [--model gpt-5-mini] [--provider openai] [--force]
//   pnpm pkb:build --all           (every product missing a .pkb)
//
// Guarded: won't clobber a product that already has a .pkb unless --force — a
// product with a proper multimodal ingest (mesh/video/page anchors) should be
// re-ingested through the full pipeline, not rebuilt from markdown alone.

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

// Split a concept body into ~1500-char units at paragraph boundaries so each
// extraction call sees a coherent, self-contained slice (not one giant blob).
function sliceBody(body: string, target = 1500): string[] {
  const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const units: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > target) { units.push(cur); cur = ""; }
    cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) units.push(cur);
  return units;
}

function unitsFor(slug: string): ExtractUnit[] {
  const out: ExtractUnit[] = [];
  for (const c of listConcepts(slug)) {
    const title = c.frontmatter.title ?? c.id;
    sliceBody(c.body).forEach((text, i) => {
      out.push({ sourceId: `${c.id}#s${i + 1}`, conceptId: c.id, title, text });
    });
  }
  return out;
}

async function buildOne(slug: string, provider: ProviderInfo, model: string, apiKey?: string, force = false): Promise<void> {
  if (pkbExists(slug) && !force) {
    console.log(`· ${slug}: already has a .pkb (skip; pass --force to rebuild from markdown)`);
    return;
  }
  const units = unitsFor(slug);
  if (!units.length) { console.log(`· ${slug}: no concept markdown found — skip`); return; }
  console.log(`· ${slug}: ${units.length} units → building graph with ${provider.id}/${model}…`);
  const res = await buildPkb(slug, units, {
    provider, model, apiKey, concurrency: 4,
    onProgress: (m) => { process.stdout.write(`    ${m}\r`); },
  });
  const g = loadGraph(slug);
  console.log(`\n✓ ${slug}: ${res.entities} entities, ${res.edges} links, ${g.hyperedges?.length ?? 0} procedures, ${res.chunks} chunks`);
}

async function main() {
  loadEnv();

  // Provider: --provider, else first builtin with an env key. Prefer OpenAI's
  // cheap tier for the bulk extraction (configurable via --model).
  const wantProvider = arg("provider");
  const provider = wantProvider
    ? BUILTIN_PROVIDERS.find((p) => p.id === wantProvider)
    : BUILTIN_PROVIDERS.find((p) => p.envKeys?.some((k) => process.env[k]?.trim()));
  if (!provider) { console.error("No provider key in env (set OPENAI_API_KEY / ANTHROPIC_API_KEY) or pass --provider."); process.exit(1); }
  const apiKey = provider.envKeys?.map((k) => process.env[k]?.trim()).find(Boolean);
  if (!apiKey && !provider.keyless) { console.error(`No API key for ${provider.name}.`); process.exit(1); }

  // Default to a cheap model when on OpenAI; otherwise --model is required.
  const model = arg("model") ?? (provider.id === "openai" ? "gpt-5-mini" : undefined);
  if (!model) { console.error("--model is required for this provider (e.g. --model claude-haiku-4-5)."); process.exit(1); }

  const force = flag("force");
  const slugs = flag("all")
    ? listAllProducts()
    : [arg("product")].filter((s): s is string => !!s);
  if (!slugs.length) { console.error("Usage: pnpm pkb:build --product <slug> [--model <id>] [--force] | --all"); process.exit(1); }

  for (const slug of slugs) await buildOne(slug, provider, model, apiKey, force);
  process.exit(0);
}

// Product slugs = directories under data/products/.
function listAllProducts(): string[] {
  return readdirSync(PRODUCTS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}

main().catch((err) => { console.error(err); process.exit(1); });
