"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Plug } from "lucide-react";

// "Connect via MCP" — the copy-paste command that exposes this catalog's graph
// tools (find_entity / explore_entity / trace_path / search_product …) to
// Claude, ChatGPT, or any other MCP client. Lives below the product hero.
export function McpConnect({ productName }: { productName: string }) {
  const { data } = useQuery({
    queryKey: ["mcp"],
    queryFn: () => fetch("/api/mcp").then((r) => r.json() as Promise<{ command: string; tools: string[] }>),
    staleTime: Infinity,
  });
  const [copied, setCopied] = useState(false);
  if (!data?.command) return null;

  const copy = () => {
    void navigator.clipboard.writeText(data.command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-faint">
        <Plug className="size-3.5" /> Connect via MCP
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Query the {productName} knowledge graph from Claude, ChatGPT, or any MCP client — the same
        grounded tools this agent uses ({data.tools.slice(0, 4).join(", ")}, …).
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <pre className="takt-scroll min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[12px] text-foreground">{data.command}</pre>
        <button onClick={copy} aria-label="Copy MCP command" title="Copy command"
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:border-border-heavy hover:text-foreground">
          {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}
