import { NextResponse } from "next/server";
import { listProducts } from "@prox/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(listProducts());
}
