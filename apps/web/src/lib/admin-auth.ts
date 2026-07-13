import { cookies } from "next/headers";

// Single shared-token gate for /admin and the config/ingestion APIs. There are
// no user accounts — the whole instance shares one admin token from the
// TAKT_ADMIN_TOKEN env var. If it's unset (local single-user dev), admin is
// OPEN; set it on any deployed/shared instance to lock ingestion + keys away
// from the chat surface.
export const ADMIN_COOKIE = "takt_admin";
const TOKEN = process.env.TAKT_ADMIN_TOKEN?.trim() || undefined;

export function adminRequired(): boolean {
  return !!TOKEN;
}
export function adminToken(): string | undefined {
  return TOKEN;
}
export async function isAdmin(): Promise<boolean> {
  if (!TOKEN) return true; // no token configured → open (local) mode
  const c = await cookies();
  return c.get(ADMIN_COOKIE)?.value === TOKEN;
}
/** 401 for a mutating API call made without admin auth. */
export function forbidden(): Response {
  return new Response(JSON.stringify({ error: "Admin access required." }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
