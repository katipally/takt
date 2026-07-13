import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, join, isAbsolute, extname, basename, dirname } from "node:path";
import { REPO_ROOT, loadEnv } from "@takt/db";
import { BUILTIN_PROVIDERS, defaultModel } from "@takt/harness";
import { ingestProduct } from "./ingest.js";
import type { ModelFile } from "./mesh.js";

// `pnpm ingest <folder>` — drop a folder holding everything for a product (PDF
// manuals, STL/STP 3D models in subsystem-named subfolders, a walkthrough video,
// images, gcode/misc). We recursively scan, classify by extension, vision-detect
// the product identity, and build the whole knowledge bundle in one pass.

const read = (p: string) => new Uint8Array(readFileSync(p));

// Parse "<positional> --flag value …". Every flag here takes a value.
function parseArgs(argv: string[]): { positionals: string[]; flags: Record<string, string> } {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]!;
    if (t === "--") continue; // pnpm forwards a bare `--` separator; ignore it
    if (t.startsWith("--")) flags[t.slice(2)] = argv[++i] ?? "";
    else positionals.push(t);
  }
  return { positionals, flags };
}

// Recursively collect every file with its absolute path.
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs));
    else if (e.isFile()) out.push(abs);
  }
  return out;
}

async function main() {
  loadEnv();
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const dirArg = positionals[0] ?? flags.dir;
  if (!dirArg) {
    console.error('Usage: pnpm ingest <folder> [--name "X"] [--slug x] [--provider id] [--model id] [--manufacturer "X"] [--summary "..."] [--hero <img>]');
    process.exit(1);
  }
  const root = isAbsolute(dirArg) ? dirArg : resolve(REPO_ROOT, dirArg);
  if (!existsSync(root) || !statSync(root).isDirectory()) { console.error(`Not a folder: ${root}`); process.exit(1); }

  // Resolve the vision provider: --provider, else the first builtin whose env key
  // is present. All three builtins (anthropic/openai/minimax) are vision-capable.
  const provider = flags.provider
    ? BUILTIN_PROVIDERS.find((p) => p.id === flags.provider)
    : BUILTIN_PROVIDERS.find((p) => p.envKeys?.some((k) => process.env[k]?.trim()));
  if (!provider) {
    console.error(flags.provider
      ? `Unknown provider "${flags.provider}".`
      : "No provider key found in env. Set one (e.g. ANTHROPIC_API_KEY / OPENAI_API_KEY / MINIMAX_API_KEY) or pass --provider.");
    process.exit(1);
  }
  const apiKey = provider.envKeys?.map((k) => process.env[k]?.trim()).find(Boolean);
  if (!apiKey && !provider.keyless) {
    console.error(`No API key for ${provider.name}. Set ${provider.envKeys?.join(" or ")} in .env.`);
    process.exit(1);
  }
  const model = flags.model || defaultModel(provider.id);
  if (!model) { console.error(`No default model for ${provider.id}; pass --model.`); process.exit(1); }

  // Classify every file under the drop folder by extension.
  const pdfs: { filename: string; data: Uint8Array }[] = [];
  const models: ModelFile[] = [];
  const images: { filename: string; data: Uint8Array }[] = [];
  const audios: { filename: string; data: Uint8Array }[] = [];
  const resources: { filename: string; kind: string }[] = [];
  const videos: string[] = [];

  for (const abs of walk(root)) {
    const ext = extname(abs).toLowerCase();
    const filename = basename(abs);
    switch (ext) {
      case ".pdf": pdfs.push({ filename, data: read(abs) }); break;
      case ".stl": case ".glb": case ".gltf": case ".stp": case ".step": case ".3mf": {
        // subsystem = immediate parent folder, unless the model sits directly in
        // the drop folder. STL/STEP/3MF are converted to GLB; GLB/GLTF pass through.
        // Same part in multiple formats is de-duped in addMeshParts (STL preferred).
        const parent = dirname(abs);
        const subsystem = parent === root ? undefined : basename(parent);
        models.push({ filename, data: read(abs), subsystem });
        break;
      }
      case ".obj": resources.push({ filename, kind: "3d-source" }); break;
      case ".gcode": case ".bgcode": resources.push({ filename, kind: "gcode" }); break;
      case ".mp4": case ".mov": case ".webm": case ".mkv": videos.push(abs); break;
      case ".mp3": case ".wav": case ".m4a": case ".aac": case ".flac": case ".ogg":
        audios.push({ filename, data: read(abs) }); break;
      case ".png": case ".jpg": case ".jpeg": case ".webp": case ".gif":
        images.push({ filename, data: read(abs) }); break;
      default: resources.push({ filename, kind: "other" }); break;
    }
  }

  // Every video is ingested (each chaptered + linked), not just the first.
  const videoFiles = videos.map((v) => ({ filename: basename(v), data: read(v) }));

  const heroSrc = flags.hero ? (isAbsolute(flags.hero) ? flags.hero : resolve(REPO_ROOT, flags.hero)) : undefined;
  const hero = heroSrc && existsSync(heroSrc) ? { ext: extname(heroSrc), data: read(heroSrc) } : undefined;

  console.log(`Scanning ${root}`);
  console.log(`  · ${pdfs.length} pdf, ${models.length} 3d, ${images.length} image, ${videoFiles.length} video, ${resources.length} other`);
  if (!pdfs.length && !models.length && !images.length && !videoFiles.length) {
    console.error("Nothing ingestible in that folder (no pdf/stl/image/video).");
    process.exit(1);
  }

  // slug/name may be omitted — ingest derives slug from --name or the detected name.
  await ingestProduct({
    slug: flags.slug?.trim() || undefined,
    name: flags.name?.trim() || undefined,
    manufacturer: flags.manufacturer ?? null,
    summary: flags.summary ?? null,
    pdfs, models, videos: videoFiles, images, audios, resources, hero,
    captionProvider: provider, captionModel: model, apiKey,
    onProgress: (m) => { process.stdout.write(`  · ${m}\x1b[K\r`); },
  });

  console.log(`\n✓ ready`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
