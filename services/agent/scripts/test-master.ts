// Battle-test for Phase 2 (master mode) core logic. Runs against the real DB
// (so it also verifies the nullable-product_id migration actually applies to the
// committed data/prox.db). Idempotent; cleans up the chat it creates.
//
//   cd services/agent && pnpm exec tsx scripts/test-master.ts
//
// ponytail: plain assert script, matches scripts/smoke.mjs — no test framework.
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { getDb, createChat, listMasterChats, deleteChat, upsertProduct, matchAllChunks, listProducts } from "@prox/db";
import { isReservedSlug } from "@prox/shared";
import { embedQuery } from "@prox/embed";

const db = getDb(); // triggers SCHEMA_SQL + migrate()

// 1. Migration made chats.product_id nullable.
const col = (db.prepare("PRAGMA table_info(chats)").all() as { name: string; notnull: number }[])
  .find((c) => c.name === "product_id");
assert(col && col.notnull === 0, "chats.product_id must be nullable after migrate()");
console.log("✓ migration: chats.product_id is nullable");

// 2. A master (null-product) chat round-trips through create + list.
const id = randomUUID();
createChat(null, id, "master test");
const master = listMasterChats().find((c) => c.id === id);
assert(master && master.productId === null, "master chat must persist with null product_id");
deleteChat(id);
console.log("✓ null-product chat persists + lists via listMasterChats");

// 3. Reserved-slug guard blocks shadowing routes.
assert(isReservedSlug("master") && isReservedSlug("gallery"), "master/gallery must be reserved");
assert(!isReservedSlug("vulcan-omnipro-220"), "a real product slug must not be reserved");
let threw = false;
try { upsertProduct({ slug: "master", name: "X" }); } catch { threw = true; }
assert(threw, "upsertProduct must reject a reserved slug");
console.log("✓ reserved-slug guard rejects 'master'");

// 4. Cross-product search returns product-tagged results.
const products = listProducts();
if (products.length) {
  const vec = await embedQuery("what is the duty cycle");
  const results = matchAllChunks(vec, 5);
  assert(results.length > 0, "matchAllChunks should return hits when products exist");
  assert(results.every((r) => r.productName && r.productSlug), "every cross-product hit must carry product tags");
  console.log(`✓ cross-product search: ${results.length} hits, all tagged (${[...new Set(results.map((r) => r.productName))].join(", ")})`);
} else {
  console.log("• no products indexed — skipping cross-product search check");
}

console.log("\nAll master-mode checks passed.");
