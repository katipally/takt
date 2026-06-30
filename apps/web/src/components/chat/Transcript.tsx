"use client";

import { useEffect, useRef } from "react";
import type { Node, PageImagePart, ArtifactPart, BranchInfo } from "@/lib/chatStore";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";

export function Transcript({
  messages, branchInfo, switchBranch, onCitation, onOpenSource, onOpenArtifact, onRegenerate, onEdit,
}: {
  messages: Node[];
  branchInfo: (n: Node) => BranchInfo | null;
  switchBranch: (n: Node, dir: -1 | 1) => void;
  onCitation: (page: number) => void;
  onOpenSource: (b: PageImagePart) => void;
  onOpenArtifact: (b: ArtifactPart) => void;
  onRegenerate: () => void;
  onEdit: (node: Node, text: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const last = messages[messages.length - 1];
  const lastLen = last ? (last.role === "user" ? last.text.length : last.parts.reduce((n, p) => n + ("text" in p ? p.text.length : 0), 0)) : 0;
  useEffect(() => { if (stick.current) endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, lastLen]);

  return (
    <div
      onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
      className="prox-scroll flex-1 overflow-y-auto"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <UserMessage key={m.id} node={m} branch={branchInfo(m)}
              onSwitch={(d) => switchBranch(m, d)} onEdit={(text) => onEdit(m, text)} />
          ) : (
            <AssistantMessage key={m.id} node={m} isLast={i === messages.length - 1} branch={branchInfo(m)}
              onSwitch={(d) => switchBranch(m, d)} onCitation={onCitation} onOpenSource={onOpenSource}
              onOpenArtifact={onOpenArtifact} onRegenerate={onRegenerate} />
          ),
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
