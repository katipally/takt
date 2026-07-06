"use client";

import { Composer } from "@/components/chat/Composer";
import type { Attachment } from "@/lib/chatStore";

// The composer floats over the bottom of the stage; content scrolls under it
// behind a fade mask so the last line is never hidden abruptly.
export function FloatingComposer(props: {
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
        <Composer {...props} />
      </div>
    </div>
  );
}
