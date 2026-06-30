import { NextResponse } from "next/server";
import { getProductBySlug, listArtifacts, listArtifactsByChat } from "@prox/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const chat = params.get("chat");
  if (chat) return NextResponse.json(listArtifactsByChat(chat));
  const slug = params.get("product");
  const product = slug ? getProductBySlug(slug) : undefined;
  return NextResponse.json(product ? listArtifacts(product.id) : []);
}
