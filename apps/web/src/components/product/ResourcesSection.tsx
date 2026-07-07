"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import Link from "next/link";
import { Boxes, FileText, Image as ImageIcon, Film, Network, ScrollText } from "lucide-react";
import { Graph, type GraphProps } from "@/components/ui-catalog/Graph";
import { Model3D } from "@/components/ui-catalog/Model3D";

// The product's resources + the explorable "virtual product", revealed as you
// scroll past the questions on the landing. Everything is read-only and fed by
// /api/resources/<slug>: the knowledge graph (click a node to explore), the 3D
// parts, source manuals, image/video media, and the authored concept docs.

interface Resources {
  name: string;
  manuals: { title: string; kind: string; pages: number; thumb: string | null }[];
  images: { url: string; name: string }[];
  videos: { url: string; name: string }[];
  models: { url: string; name: string }[];
  concepts: { id: string; title: string; type: string }[];
  graph: GraphProps;
  stats: { entities: number; edges: number; procedures: number };
  counts: Record<string, number>;
}

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function Eyebrow({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-faint">
      <Icon className="size-3.5" /> {children}
    </div>
  );
}

// Load the 3D viewer on demand — mounting six model-viewer (three.js/WebGL)
// contexts on the landing at once is expensive, so start with a light poster.
function LazyModel({ src, name }: { src: string; name: string }) {
  const [on, setOn] = useState(false);
  if (on) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Model3D props={{ src, caption: name }} />
      </div>
    );
  }
  return (
    <button onClick={() => setOn(true)}
      className="group flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card text-muted-foreground transition hover:border-border-heavy hover:text-foreground">
      <Boxes className="size-7" />
      <span className="text-[13px] font-medium text-foreground">{name}</span>
      <span className="text-[11px]">Click to load 3D</span>
    </button>
  );
}

export function ResourcesSection({ slug }: { slug: string }) {
  const { data, isLoading } = useQuery<Resources>({
    queryKey: ["resources", slug],
    queryFn: async () => {
      const r = await fetch(`/api/resources/${slug}`);
      if (!r.ok) throw new Error("failed to load resources");
      return r.json();
    },
  });

  if (isLoading) return <div className="mt-16 h-64 animate-pulse rounded-2xl border border-border bg-card" />;
  if (!data) return null;

  const { manuals, images, videos, models, concepts, graph, stats } = data;
  const hasGraph = graph.nodes.length > 0;
  const nothing = !hasGraph && !manuals.length && !images.length && !videos.length && !models.length && !concepts.length;
  if (nothing) return null;

  return (
    <div className="mt-20 flex flex-col gap-16 border-t border-border pt-12">
      <Reveal>
        <h2 className="text-[19px] font-semibold tracking-tight">Everything Takt knows about the {data.name}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">The sources we ingested and the knowledge graph we built from them — explore it below.</p>
      </Reveal>

      {/* The explorable virtual product — the knowledge graph. */}
      {hasGraph && (
        <Reveal>
          <Eyebrow icon={Network}>Virtual product · knowledge graph</Eyebrow>
          <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-muted-foreground">
            <span><strong className="text-foreground tabular-nums">{stats.entities}</strong> parts, faults, procedures &amp; specs</span>
            <span><strong className="text-foreground tabular-nums">{stats.edges}</strong> connections</span>
            {stats.procedures > 0 && <span><strong className="text-foreground tabular-nums">{stats.procedures}</strong> procedures</span>}
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Graph props={{ ...graph, caption: "Click a node to see how it connects — the top-connected parts, faults and procedures." }} />
          </div>
        </Reveal>
      )}

      {/* Interactive 3D parts. */}
      {models.length > 0 && (
        <Reveal>
          <Eyebrow icon={Boxes}>3D parts · {models.length}</Eyebrow>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {models.slice(0, 8).map((m) => <LazyModel key={m.url} src={m.url} name={m.name} />)}
          </div>
        </Reveal>
      )}

      {/* Source manuals. */}
      {manuals.length > 0 && (
        <Reveal>
          <Eyebrow icon={FileText}>Source manuals · {manuals.length}</Eyebrow>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {manuals.map((m) => (
              <div key={m.title} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                <div className="aspect-[3/4] overflow-hidden bg-surface">
                  {m.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.thumb} alt="" className="size-full object-cover object-top" />
                  ) : (
                    <div className="grid size-full place-items-center text-muted-foreground"><FileText className="size-8" /></div>
                  )}
                </div>
                <div className="p-3">
                  <div className="truncate text-[13px] font-medium">{m.title}</div>
                  <div className="text-[11px] text-muted-foreground">{m.pages ? `${m.pages} pages` : "text source"}</div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      {/* Video walkthroughs. */}
      {videos.length > 0 && (
        <Reveal>
          <Eyebrow icon={Film}>Video</Eyebrow>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {videos.slice(0, 4).map((v) => (
              <video key={v.url} controls preload="none" src={v.url} className="w-full rounded-2xl border border-border bg-black" />
            ))}
          </div>
        </Reveal>
      )}

      {/* Image gallery. */}
      {images.length > 0 && (
        <Reveal>
          <Eyebrow icon={ImageIcon}>Images · {images.length}</Eyebrow>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.slice(0, 12).map((im) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={im.url} src={im.url} alt={im.name} className="aspect-square w-full rounded-xl border border-border bg-surface object-cover" />
            ))}
          </div>
        </Reveal>
      )}

      {/* Authored concept docs — the files we created from the resources. */}
      {concepts.length > 0 && (
        <Reveal>
          <Eyebrow icon={ScrollText}>Generated docs · {concepts.length}</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {concepts.map((c) => (
              <Link key={c.id} href={`/profile/${slug}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] text-foreground transition hover:border-border-heavy">
                <span className="text-[10px] uppercase tracking-wide text-faint">{c.type}</span>
                <span className="truncate">{c.title}</span>
              </Link>
            ))}
          </div>
        </Reveal>
      )}
    </div>
  );
}
