"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, Boxes, Maximize2, Minimize2 } from "lucide-react";
import type { ArtifactPart } from "@/lib/chatStore";
import { ArtifactFrame, ArtifactThumb } from "./ArtifactFrame";
import { quick } from "@/lib/motion";
import { cn } from "@/lib/cn";

// Drop a product-name prefix shared by all titles so each label shows its
// distinguishing part (e.g. "Duty Cycle Calculator" vs "TIG Polarity…").
function stripCommonPrefix(titles: string[]): (t: string) => string {
  if (titles.length < 2) return (t) => t;
  let prefix = titles[0]!;
  for (const t of titles) { while (prefix && !t.startsWith(prefix)) prefix = prefix.slice(0, -1); }
  prefix = prefix.replace(/[\s—–:|-]+$/, "");
  return (t) => {
    if (prefix && t.startsWith(prefix)) {
      const rest = t.slice(prefix.length).replace(/^[\s—–:|-]+/, "").trim();
      return rest || t;
    }
    return t;
  };
}

// Group artifact parts into lineages (by groupKey), each sorted oldest→newest.
function groupArtifacts(artifacts: ArtifactPart[]) {
  const m = new Map<string, ArtifactPart[]>();
  for (const a of artifacts) { const g = m.get(a.groupKey) ?? []; g.push(a); m.set(a.groupKey, g); }
  return [...m.values()].map((vs) => vs.slice().sort((x, y) => x.version - y.version));
}

// Floating switcher in the chat view — a column of live thumbnails. Clicking one
// opens it full in the Artifacts panel. Keeps the panel itself rail-free.
export function ArtifactDock({ artifacts, selectedId, panelOpen, onSelect }: {
  artifacts: ArtifactPart[];
  selectedId?: string;
  panelOpen: boolean;
  onSelect: (artifactId: string) => void;
}) {
  const groups = useMemo(() => groupArtifacts(artifacts), [artifacts]);
  const shortTitle = useMemo(() => stripCommonPrefix(groups.map((g) => g[g.length - 1]!.title)), [groups]);
  if (!groups.length) return null;

  return (
    <div className="pointer-events-none absolute right-3 top-14 z-20 flex max-h-[calc(100%-7rem)] w-[124px] flex-col gap-2 overflow-y-auto prox-scroll">
      {groups.map((g) => {
        const latest = g[g.length - 1]!;
        const active = panelOpen && g.some((a) => a.artifactId === selectedId);
        return (
          <button key={latest.groupKey} onClick={() => onSelect(latest.artifactId)}
            className={cn("pointer-events-auto block w-full rounded-lg border p-1 text-left shadow-[var(--shadow-card)] backdrop-blur transition",
              active ? "border-accent bg-accent-soft" : "border-border bg-card/85 hover:border-border-heavy")}>
            <ArtifactThumb artifactId={latest.artifactId} />
            <div className="mt-1 flex items-center gap-1 px-0.5">
              <span className={cn("block flex-1 truncate text-[10px]", active ? "text-foreground" : "text-muted-foreground")}>{shortTitle(latest.title)}</span>
              {g.length > 1 && <span className="shrink-0 text-[9px] text-faint">v{latest.version}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// The Artifacts panel: full render of the selected artifact + version pills.
export function Canvas({ artifacts, selectedId, onSelect, onClose, maximized, onToggleMaximize }: {
  artifacts: ArtifactPart[];
  selectedId?: string;
  onSelect: (artifactId: string) => void;
  onClose: () => void;
  maximized: boolean;
  onToggleMaximize: () => void;
}) {
  const groups = useMemo(() => groupArtifacts(artifacts), [artifacts]);
  const selected = artifacts.find((a) => a.artifactId === selectedId) ?? artifacts[artifacts.length - 1];
  const selGroup = groups.find((g) => g.some((a) => a.artifactId === selected?.artifactId));

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2 px-1 text-[13px] font-medium text-foreground">
          <Boxes className="size-4 shrink-0 text-accent" />
          <span className="truncate">{selected?.title ?? "Artifacts"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button onClick={onToggleMaximize} title={maximized ? "Restore" : "Maximize"} className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
            {maximized ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground" aria-label="Close artifacts">
            <X className="size-4" />
          </button>
        </div>
      </header>

      {!selected ? (
        <div className="grid flex-1 place-items-center p-8 text-center text-[12px] text-muted-foreground">
          <div>
            <Boxes className="mx-auto mb-2 size-6 text-faint" />
            No artifacts yet. Ask for a calculator, diagram, or configurator and it&apos;ll show up here.
          </div>
        </div>
      ) : (
        <>
          {selGroup && selGroup.length > 1 && (
            <div className="prox-scroll flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
              <span className="text-[11px] uppercase tracking-wide text-faint">Versions</span>
              {selGroup.map((a) => (
                <button key={a.artifactId} onClick={() => onSelect(a.artifactId)}
                  className={cn("rounded-full px-2.5 py-0.5 text-[11px] transition",
                    a.artifactId === selected.artifactId ? "bg-foreground text-background" : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground")}>
                  v{a.version}
                </button>
              ))}
            </div>
          )}
          <div className="prox-scroll min-h-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div key={selected.artifactId}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick}>
                <ArtifactFrame artifactId={selected.artifactId} />
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      )}
    </aside>
  );
}
