"use client";

import type { ReactNode } from "react";
import { Composer } from "@/components/chat/Composer";
import type { Attachment } from "@/lib/chatStore";

// The composer floats over the bottom of the stage. The wrapper is fully
// TRANSPARENT — no blur, no fade, no backdrop — so the canvas shows through
// everywhere except the composer pill itself (and the status strip, which carry
// their own background). `above` renders a status strip just over the pill.
export function FloatingComposer({ above, ...props }: {
  above?: ReactNode;
  onSend: (text: string, attachments?: Attachment[]) => void;
  onStop: () => void;
  isStreaming: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col">
      <div className="pointer-events-auto">
        {above ? <div className="pb-1.5">{above}</div> : null}
        <Composer {...props} />
      </div>
    </div>
  );
}
