import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { resolve, join, isAbsolute, extname } from "node:path";
import { REPO_ROOT, loadEnv } from "@takt/db";
import { BUILTIN_PROVIDERS } from "@takt/harness";
import { ingestProduct } from "./ingest.js";

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
    console.error('Usage: pnpm ingest --product <slug> --name "Name" (--dir <folder> | --url <link> [--url <link> …]) [--manufacturer "X"] [--summary "..."] [--hero <img>] [--provider <id>] [--model <id>]');
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

  await ingestProduct({
    slug, name: name!, manufacturer: arg("manufacturer") ?? null, summary: arg("summary") ?? null,
    pdfs,
    webSources: urls.map((url) => ({ url })),
    hero: heroSrc && existsSync(heroSrc) ? { ext: extname(heroSrc), data: new Uint8Array(readFileSync(heroSrc)) } : undefined,
    captionProvider: provider, captionModel: model, apiKey,
    onProgress: (m) => { process.stdout.write(`  · ${m}\r`); },
  });

  const manifestDir = resolve(REPO_ROOT, "seed");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(join(manifestDir, `${slug}.json`), JSON.stringify({ slug, name, dir }, null, 2));
  console.log(`\n✓ Ingest complete for "${name}".`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
