import { notFound } from "next/navigation";
import { getProductBySlug } from "@prox/db";
import { Workbench } from "@/components/app/Workbench";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProductWorkbench({ params }: { params: Promise<{ productSlug: string }> }) {
  const { productSlug } = await params;
  const product = getProductBySlug(productSlug);
  if (!product) notFound();
  return <Workbench slug={product.slug} productName={product.name} />;
}
