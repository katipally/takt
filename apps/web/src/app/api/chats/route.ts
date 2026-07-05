import { NextResponse } from "next/server";
import { getProductBySlug, listChats, listMasterChats, listMessages } from "@prox/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const url = new URL(req.url);
  const chatId = url.searchParams.get("chat");
  if (chatId) return NextResponse.json(listMessages(chatId));
  const slug = url.searchParams.get("product") ?? "";
  // "master" (or empty) → the no-product chat list.
  if (!slug || slug === "master") return NextResponse.json(listMasterChats());
  const product = getProductBySlug(slug);
  return NextResponse.json(product ? listChats(product.id) : []);
}
