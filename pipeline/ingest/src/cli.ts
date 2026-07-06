import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join, isAbsolute, extname, basename } from "node:path";
import { REPO_ROOT, loadEnv } from "@takt/db";
import { BUILTIN_PROVIDERS } from "@takt/harness";
import { ingestProduct } from "./ingest.js";
import type { ModelFile } from "./mesh.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

// Collect all values for a repeatable flag, e.g. --url a --url b.
function args(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => { if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]!); });
  return out;
}

async function main() {
  loadEnv();
  const slug = arg("product");
  const name = arg("name") ?? slug;
  const dir = arg("dir");
  const urls = args("url"); // repeatable: web pages / youtube links
  if (!slug || (!dir && !urls.length)) {
    console.error('Usage: pnpm ingest --product <slug> --name "Name" (--dir <folder> | --url <link> [--url <link> …]) [--models <dir>] [--video <file>] [--manufacturer "X"] [--summary "..."] [--hero <img>] [--provider <id>] [--model <id>]');
    process.exit(1);
  }

  // Resolve the caption provider: --provider flag, else the first builtin whose
  // env key is present. --model picks the vision model (required for captioning).
  const wantProvider = arg("provider");
  const provider = wantProvider
    ? BUILTIN_PROVIDERS.find((p) => p.id === wantProvider)
    : BUILTIN_PROVIDERS.find((p) => p.envKeys?.some((k) => process.env[k]?.trim()));
  if (!provider) {
    console.error(wantProvider
      ? `Unknown provider "${wantProvider}".`
      : "No provider key found in env. Set one (e.g. ANTHROPIC_API_KEY / OPENAI_API_KEY) or pass --provider.");
    process.exit(1);
  }
  const apiKey = provider.envKeys?.map((k) => process.env[k]?.trim()).find(Boolean);
  if (!apiKey && !provider.keyless) {
    console.error(`No API key for ${provider.name}. Set ${provider.envKeys?.join(" or ")} in .env.`);
    process.exit(1);
  }
  const model = arg("model");
  if (!model) {
    console.error("--model is required (the vision model to caption pages, e.g. --model claude-sonnet-5 / gpt-5 / gemini-2.5-pro).");
    process.exit(1);
  }

  const fromRoot = (p: string) => (isAbsolute(p) ? p : resolve(REPO_ROOT, p));
  const heroSrc = arg("hero") ? fromRoot(arg("hero")!) : undefined;

  let pdfs: { filename: string; data: Uint8Array }[] = [];
  if (dir) {
    const pdfDir = fromRoot(dir);
    const pdfFiles = readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
    if (!pdfFiles.length && !urls.length) { console.error(`No PDFs in ${pdfDir}`); process.exit(1); }
    pdfs = pdfFiles.map((f) => ({ filename: f, data: new Uint8Array(readFileSync(join(pdfDir, f))) }));
  }

  // --models <dir>: recursively collect .stl part models; the top-level folder a
  // part sits under becomes its subsystem (Frame, Nextruder, Z-axis…).
  const models: ModelFile[] = [];
  const modelsDir = arg("models");
  if (modelsDir) {
    const root = fromRoot(modelsDir);
    const walk = (d: string, subsystem?: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const abs = join(d, e.name);
        if (e.isDirectory()) walk(abs, subsystem ?? e.name);
        else if (e.name.toLowerCase().endsWith(".stl")) models.push({ filename: e.name, data: new Uint8Array(readFileSync(abs)), subsystem });
      }
    };
    walk(root);
    console.log(`  · ${models.length} STL part models found`);
  }

  const videoArg = arg("video");
  const videoPath = videoArg ? fromRoot(videoArg) : undefined;
  const video = videoPath && existsSync(videoPath)
    ? { filename: basename(videoPath), data: new Uint8Array(readFileSync(videoPath)) } : undefined;

  await ingestProduct({
    slug, name: name!, manufacturer: arg("manufacturer") ?? null, summary: arg("summary") ?? null,
    pdfs,
    webSources: urls.map((url) => ({ url })),
    models, video,
    hero: heroSrc && existsSync(heroSrc) ? { ext: extname(heroSrc), data: new Uint8Array(readFileSync(heroSrc)) } : undefined,
    captionProvider: provider, captionModel: model, apiKey,
    onProgress: (m) => { process.stdout.write(`  · ${m}\r`); },
  });

  // The Profile bundle (data/products/<slug>/) is the canonical record — its
  // overview.md already holds name/maker/summary, so no separate manifest is kept.
  console.log(`\n✓ Ingest complete for "${name}" → data/products/${slug}/`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
