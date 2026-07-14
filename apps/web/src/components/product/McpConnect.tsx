"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Plug } from "lucide-react";

interface McpInfo { httpUrl: string; httpCommand: string; stdioCommand: string; tools: string[] }

// "Connect via MCP" — how to point Claude, ChatGPT, or any MCP client at this
// catalog's grounded graph tools. Leads with the HTTP endpoint (works for any
// visitor of a hosted Takt, and locally); the stdio command is the
// run-from-source alternative.
export function McpConnect({ productName }: { productName: string }) {
  const { data } = useQuery({
    queryKey: ["mcp"],
    queryFn: () => fetch("/api/mcp").then((r) => r.json() as Promise<McpInfo>),
    staleTime: Infinity,
  });
  const [copied, setCopied] = useState<"http" | "stdio" | null>(null);
  if (!data?.httpCommand) return null;

  const copy = (which: "http" | "stdio", text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1600);
    });
  };

  const Row = ({ which, cmd }: { which: "http" | "stdio"; cmd: string }) => (
    <div className="flex min-w-0 items-center gap-2">
      <pre className="takt-scroll min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[12px] text-foreground">{cmd}</pre>
      <button onClick={() => copy(which, cmd)} aria-label="Copy command" title="Copy command"
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:border-border-heavy hover:text-foreground">
        {copied === which ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
      </button>
    </div>
  );

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-faint">
        <Plug className="size-3.5" /> Connect via MCP
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Query the {productName} knowledge graph from Claude, ChatGPT, or any MCP client — the same
        grounded tools this agent uses ({data.tools.slice(0, 4).join(", ")}, …). Point your client at{" "}
        <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11.5px] text-foreground">{data.httpUrl}</code>, or with Claude Code:
      </p>
      <div className="mt-2.5"><Row which="http" cmd={data.httpCommand} /></div>
      <details className="mt-2">
        <summary className="cursor-pointer text-[11.5px] text-faint hover:text-muted-foreground">
          Running Takt from source on this machine? Use the local stdio server instead
        </summary>
        <div className="mt-2"><Row which="stdio" cmd={data.stdioCommand} /></div>
      </details>
    </div>
  );
}
