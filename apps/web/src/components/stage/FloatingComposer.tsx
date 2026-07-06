"use client";

import type { ReactNode } from "react";
import { Composer } from "@/components/chat/Composer";
import type { Attachment } from "@/lib/chatStore";

// The composer floats over the bottom of the stage; content scrolls under it
// behind a fade mask so the last line is never hidden abruptly. `above` renders a
// status strip (or ask modal) just over the composer pill.
export function FloatingComposer({ above, ...props }: {
  above?: ReactNode;
  onSend: (text: string, attachments?: Attachment[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
  onOpenLive: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col">
      <div className="h-14 bg-gradient-to-t from-card to-transparent" />
      <div className="pointer-events-auto bg-card/85 backdrop-blur-sm">
        {above ? <div className="pb-1.5">{above}</div> : null}
        <Composer {...props} />
      </div>
    </div>
  );
}
