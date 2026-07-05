import { notFound } from "next/navigation";
import { getProductBySlug, getSuggestions } from "@prox/db";
import { Workbench } from "@/components/app/Workbench";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProductWorkbench({ params }: { params: Promise<{ productSlug: string }> }) {
  const { productSlug } = await params;
  const product = getProductBySlug(productSlug);
  if (!product) notFound();
  // Suggested questions: most-asked for this product first, then the generated
  // starters. Empty → the Workbench falls back to generic ones.
  const starters = getSuggestions(product.id, 4);
  // key by slug: switching products remounts the Workbench so its chat session
  // resets to the new product instead of keeping the previous conversation.
  return <Workbench key={product.slug} slug={product.slug} productName={product.name} starters={starters.length ? starters : undefined} />;
}
