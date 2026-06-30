"use client";

import { useState } from "react";
import { Copy, Pencil, Check, X } from "lucide-react";
import type { Node, BranchInfo } from "@/lib/chatStore";
import { BranchNav } from "./BranchNav";

export function UserMessage({
  node, branch, onSwitch, onEdit,
}: {
  node: Extract<Node, { role: "user" }>;
  branch: BranchInfo | null;
  onSwitch: (dir: -1 | 1) => void;
  onEdit: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.text);
  const [copied, setCopied] = useState(false);

  if (editing) {
    return (
      <div className="flex justify-end animate-fade-up">
        <div className="w-full max-w-[78%] rounded-2xl border border-border-heavy bg-card p-2">
          <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
            className="prox-scroll block max-h-48 w-full resize-none bg-transparent px-1.5 py-1 text-chat text-foreground outline-none" />
          <div className="mt-1 flex items-center justify-between">
            <span className="px-1 text-[11px] text-faint">Editing creates a new branch</span>
            <div className="flex gap-1">
              <button onClick={() => { setEditing(false); setDraft(node.text); }} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-foreground/10"><X className="size-3.5" /></button>
              <button onClick={() => { setEditing(false); if (draft.trim() && draft !== node.text) onEdit(draft.trim()); }}
                className="grid size-7 place-items-center rounded-md bg-foreground text-background hover:opacity-90"><Check className="size-3.5" /></button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group/u flex flex-col items-end gap-1 animate-fade-up">
      {node.attachments && node.attachments.length > 0 && (
        <div className="flex max-w-[78%] flex-wrap justify-end gap-1.5">
          {node.attachments.map((a) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={a.id} src={a.dataUrl} alt="attachment" className="max-h-40 rounded-xl border border-border object-cover" />
          ))}
        </div>
      )}
      <div className="max-w-[78%] whitespace-pre-wrap rounded-2xl bg-foreground/[0.06] px-3.5 py-2 text-chat text-foreground">{node.text}</div>
      <div className="flex items-center gap-1.5">
        {branch && <BranchNav info={branch} onPrev={() => onSwitch(-1)} onNext={() => onSwitch(1)} />}
        <div className="flex items-center gap-1 opacity-0 transition group-hover/u:opacity-100">
          <button title="Copy" onClick={() => { navigator.clipboard?.writeText(node.text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          </button>
          <button title="Edit" onClick={() => { setDraft(node.text); setEditing(true); }}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"><Pencil className="size-3.5" /></button>
        </div>
      </div>
    </div>
  );
}
