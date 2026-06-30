"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Boxes, Settings, Check, Pencil, Trash2, X, PanelLeftClose } from "lucide-react";
import type { ChatSummary } from "@prox/shared";
import { api } from "@/lib/api";
import { useUi } from "@/lib/uiStore";
import { cn } from "@/lib/cn";
import { Wordmark } from "@/components/brand/Wordmark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function Sidebar({
  currentSlug, onNewChat, onSelectChat, activeChatId,
}: {
  currentSlug: string;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  activeChatId: string;
}) {
  const { data: chats = [] } = useQuery({ queryKey: ["chats", currentSlug], queryFn: () => api.chats(currentSlug), refetchInterval: 4000 });
  const openSettings = useUi((s) => s.openSettings);
  const toggleSidebar = useUi((s) => s.toggleSidebar);

  return (
    <nav className="flex h-full w-full flex-col bg-transparent">
      <div className="flex items-center gap-2 px-3.5 pt-4 pb-3">
        <Link href="/" title="All products" className="flex items-center gap-2 rounded-lg px-1 py-0.5 transition hover:opacity-70">
          <Wordmark size="sm" />
        </Link>
        <button onClick={toggleSidebar} title="Collapse sidebar" className="ml-auto grid size-7 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      <button onClick={onNewChat}
        className="mx-2.5 mt-1 flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] text-foreground transition hover:border-border-heavy hover:bg-foreground/[0.04]">
        <Plus className="size-4" /> New chat
      </button>

      <div className="prox-scroll mt-3 flex-1 overflow-y-auto px-2.5">
        {chats.length > 0 && <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-faint">Recent</div>}
        {chats.map((c) => (
          <ChatRow key={c.id} chat={c} active={c.id === activeChatId} productSlug={currentSlug}
            onSelect={() => onSelectChat(c.id)} onNewChat={onNewChat} />
        ))}
      </div>

      <div className="border-t border-border p-2.5">
        <SideLink href={`/gallery/${currentSlug}`} icon={<Boxes className="size-4" />}>Artifact gallery</SideLink>
        <div className="flex items-center gap-1">
          <button onClick={() => openSettings()} className="flex flex-1 items-center gap-2 rounded-full px-2.5 py-2 text-[13px] text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-foreground">
            <Settings className="size-4" /> Settings
          </button>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}

function ChatRow({ chat, active, productSlug, onSelect, onNewChat }: {
  chat: ChatSummary; active: boolean; productSlug: string; onSelect: () => void; onNewChat: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chat.title);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["chats", productSlug] });

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-1 py-1">
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { api.renameChat(chat.id, title).then(invalidate); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
          className="min-w-0 flex-1 rounded-md border border-border-heavy bg-card px-2 py-1 text-[12.5px] outline-none" />
        <button onClick={() => { api.renameChat(chat.id, title).then(invalidate); setEditing(false); }} className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"><Check className="size-3.5" /></button>
        <button onClick={() => { setEditing(false); setTitle(chat.title); }} className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
      </div>
    );
  }

  return (
    <div className={cn("group/row flex items-center gap-1 rounded-full pr-1 transition hover:bg-foreground/[0.06]", active && "bg-foreground/[0.06]")}>
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-[12.5px]">
        <span className={cn("truncate", active ? "text-foreground" : "text-muted-foreground")}>{chat.title}</span>
      </button>
      <div className="flex shrink-0 items-center opacity-0 transition group-hover/row:opacity-100">
        <button title="Rename" onClick={() => { setTitle(chat.title); setEditing(true); }} className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"><Pencil className="size-3" /></button>
        <button title="Delete" onClick={() => { api.deleteChat(chat.id).then(() => { invalidate(); if (active) onNewChat(); }); }} className="grid size-6 place-items-center rounded text-muted-foreground hover:text-destructive"><Trash2 className="size-3" /></button>
      </div>
    </div>
  );
}

function SideLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-full px-2.5 py-2 text-[13px] text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-foreground">
      {icon}{children}
    </Link>
  );
}
