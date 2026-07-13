import { copyFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  listProducts, resetCatalog, deleteAllChats,
  DATA_DIR, DB_PATH, PAGES_DIR, PDF_DIR, PRODUCTS_DIR, HERO_DIR, SCRATCH_DIR,
} from "@takt/db";

// Start Takt FRESH: delete every product + all its data (graph, manuals, page
// images, media), ALL chats (incl. master-mode), and sweep leftover files off
// disk. KEEPS provider API keys + model selection so you can ingest immediately.
// Guarded: needs --yes. Backs up takt.db first (irreversible otherwise).
//   pnpm --filter @takt/ingest reset -- --yes

const products = listProducts();
console.log(`Fresh start — this will PERMANENTLY delete:`);
console.log(`  · ${products.length} product(s) + all their data (graph, manuals, media)`);
console.log(`  · ALL chats + messages`);
console.log(`  · leftover files in pages/ pdfs/ products/ heroes/ scratch/`);
console.log(`  Kept: provider API keys, selected model.`);
for (const p of products) console.log(`      – ${p.name} (${p.slug})`);

if (!process.argv.includes("--yes")) {
  console.log("\nRe-run with --yes to confirm.");
  process.exit(1);
}

// Safety backup — this is irreversible.
if (existsSync(DB_PATH)) {
  const backup = `${DB_PATH}.bak`;
  copyFileSync(DB_PATH, backup);
  console.log(`\nBacked up DB → ${backup}`);
}

const removed = resetCatalog();
const chats = deleteAllChats();
console.log(`Deleted ${removed} product(s) and ${chats} chat(s).`);

// Sweep the on-disk artifact dirs (contents only; keep the dirs). resetCatalog
// already removes per-product files, but this clears any orphans from prior runs.
const clearDir = (dir: string) => {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    try { rmSync(join(dir, name), { recursive: true, force: true }); } catch { /* skip */ }
  }
};
for (const dir of [PAGES_DIR, PDF_DIR, PRODUCTS_DIR, HERO_DIR, SCRATCH_DIR]) clearDir(dir);
console.log(`Swept media directories under ${DATA_DIR}.`);
console.log(`\nTakt is fresh. Add a product from Admin → Products.`);
process.exit(0);
