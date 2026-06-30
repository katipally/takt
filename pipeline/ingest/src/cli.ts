import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { resolve, join, isAbsolute, extname } from "node:path";
import { REPO_ROOT } from "@prox/db";
import { ingestProduct } from "./ingest.js";

// minimal .env loader so `pnpm ingest` picks up ANTHROPIC_API_KEY
function loadEnv() {
  const envPath = resolve(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  loadEnv();
  const slug = arg("product");
  const name = arg("name") ?? slug;
  const dir = arg("dir");
  if (!slug || !dir) {
    console.error('Usage: pnpm ingest --product <slug> --name "Name" --dir <folder> [--manufacturer "X"] [--summary "..."] [--hero <img>]');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required for page captioning. Set it in .env.");
    process.exit(1);
  }

  const fromRoot = (p: string) => (isAbsolute(p) ? p : resolve(REPO_ROOT, p));
  const pdfDir = fromRoot(dir);
  const heroSrc = arg("hero") ? fromRoot(arg("hero")!) : undefined;

  const pdfFiles = readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  if (!pdfFiles.length) { console.error(`No PDFs in ${pdfDir}`); process.exit(1); }

  await ingestProduct({
    slug, name: name!, manufacturer: arg("manufacturer") ?? null, summary: arg("summary") ?? null,
    pdfs: pdfFiles.map((f) => ({ filename: f, data: new Uint8Array(readFileSync(join(pdfDir, f))) })),
    hero: heroSrc && existsSync(heroSrc) ? { ext: extname(heroSrc), data: new Uint8Array(readFileSync(heroSrc)) } : undefined,
    onProgress: (m) => { process.stdout.write(`  · ${m}\r`); },
  });

  const manifestDir = resolve(REPO_ROOT, "seed");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(join(manifestDir, `${slug}.json`), JSON.stringify({ slug, name, dir }, null, 2));
  console.log(`\n✓ Ingest complete for "${name}".`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
