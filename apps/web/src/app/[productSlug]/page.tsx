import { notFound } from "next/navigation";
import { getProductBySlug, getSetting } from "@prox/db";
import { Workbench } from "@/components/app/Workbench";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProductWorkbench({ params }: { params: Promise<{ productSlug: string }> }) {
  const { productSlug } = await params;
  const product = getProductBySlug(productSlug);
  if (!product) notFound();
  // Product-specific starter questions (generated at ingest); undefined → the
  // Workbench falls back to generic ones.
  let starters: string[] | undefined;
  const raw = getSetting(`starters:${product.id}`);
  if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a) && a.length) starters = a; } catch { /* ignore */ } }
  // key by slug: switching products remounts the Workbench so its chat session
  // resets to the new product instead of keeping the previous conversation.
  return <Workbench key={product.slug} slug={product.slug} productName={product.name} starters={starters} />;
}
