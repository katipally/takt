import { loadEnv, listProducts } from "@takt/db";
import { validateProfile } from "@takt/profile";
import { authorProfile } from "./author.js";

// Re-author a product's Profile from what's in the DB (migration / rebuild for a
// product ingested before Profiles). The Profile markdown IS the store — there
// is no compile step; retrieval greps the .md directly.
//   pnpm profile:build <slug>          (re)author from DB
//   pnpm profile:build <slug> --check  validate OKF conformance only
//   pnpm profile:build --all           every product
async function main() {
  loadEnv();
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes("--check");
  const all = argv.includes("--all");
  const slugs = all ? listProducts().map((p) => p.slug) : argv.filter((a) => !a.startsWith("--"));
  if (!slugs.length) {
    console.error("Usage: pnpm profile:build <slug> [--check] | pnpm profile:build --all");
    process.exit(1);
  }

  let bad = 0;
  for (const slug of slugs) {
    if (checkOnly) {
      const issues = validateProfile(slug);
      if (issues.length) { bad++; console.log(`✗ ${slug}: ${issues.length} issue(s)`); issues.forEach((i) => console.log(`    ${i.file}: ${i.problem}`)); }
      else console.log(`✓ ${slug}: OKF-conformant`);
      continue;
    }
    const a = authorProfile(slug);
    console.log(`✓ authored ${slug}: ${a.concepts} concept(s) → data/profiles/${slug}/`);
  }
  process.exit(bad ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
