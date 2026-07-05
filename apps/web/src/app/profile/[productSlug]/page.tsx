import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProductBySlug } from "@takt/db";
import { listConcepts, profileExists } from "@takt/profile";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads the Profile from disk on each view

// Bundle-relative media links (media/…) → servable /assets URLs; absolute /assets
// links pass through unchanged.
const resolveMedia = (slug: string, body: string) =>
  body.replace(/\]\(media\//g, `](/assets/products/${slug}/media/`);

// Human-readable view of a product's Profile — the same canonical markdown the
// agent reads. This is the "user can view the Profile of each product" surface.
export default async function ProfilePage({ params }: { params: Promise<{ productSlug: string }> }) {
  const { productSlug } = await params;
  const product = getProductBySlug(productSlug);
  if (!product) notFound();

  const concepts = profileExists(productSlug) ? listConcepts(productSlug) : [];
  // Overview first, then the rest in id order.
  concepts.sort((a, b) => (a.id === "overview" ? -1 : b.id === "overview" ? 1 : a.id.localeCompare(b.id)));

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
        <Link href={`/${productSlug}`} title="Back to chat" className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-[14px] font-semibold text-foreground">{product.name} — Profile</h1>
        {product.manufacturer && <span className="text-[12px] text-muted-foreground">{product.manufacturer}</span>}
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {concepts.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-[13px] text-muted-foreground">
            No Profile built for this product yet. Run <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[12px]">pnpm profile:build {productSlug}</code>.
          </div>
        ) : (
          <>
            {/* Concept index */}
            <nav className="mb-8 rounded-2xl border border-border bg-card p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Concepts</div>
              <ul className="grid gap-1 sm:grid-cols-2">
                {concepts.map((c) => (
                  <li key={c.id}>
                    <a href={`#${c.id}`} className="flex items-baseline gap-2 rounded-md px-2 py-1 text-[13px] text-foreground transition hover:bg-foreground/[0.04]">
                      <span className="truncate">{c.frontmatter.title ?? c.id}</span>
                      <span className="ml-auto shrink-0 rounded bg-foreground/8 px-1.5 py-0.5 text-[10px] text-muted-foreground">{c.frontmatter.type}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {concepts.map((c) => (
              <section key={c.id} id={c.id} className="mb-10 scroll-mt-16">
                <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
                  <h2 className="text-[18px] font-semibold text-foreground">{c.frontmatter.title ?? c.id}</h2>
                  <span className="rounded bg-foreground/8 px-1.5 py-0.5 text-[10px] text-muted-foreground">{c.frontmatter.type}</span>
                </div>
                <MarkdownBody content={resolveMedia(productSlug, c.body)} />
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
