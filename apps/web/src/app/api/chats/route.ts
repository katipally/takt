import { NextResponse } from "next/server";
import { getProductBySlug, listChats, listMessages } from "@prox/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const url = new URL(req.url);
  const chatId = url.searchParams.get("chat");
  if (chatId) return NextResponse.json(listMessages(chatId));
  const product = getProductBySlug(url.searchParams.get("product") ?? "");
  return NextResponse.json(product ? listChats(product.id) : []);
}
