"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square, Mic, Volume2, VolumeX, Plus, X } from "lucide-react";
import type { Attachment } from "@/lib/chatStore";
import { cn } from "@/lib/cn";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random() + Date.now()));

export function Composer({
  onSend, onStop, isStreaming, voiceEnabled, setVoiceEnabled,
}: {
  onSend: (text: string, attachments?: Attachment[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<any>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [value]);

  function submit() {
    const t = value.trim();
    if ((!t && !attachments.length) || isStreaming) return;
    onSend(t, attachments.length ? attachments : undefined);
    setValue(""); setAttachments([]);
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const next: Attachment[] = [];
    for (const f of Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 4)) {
      const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
      next.push({ id: uid(), mediaType: f.type, dataUrl });
    }
    setAttachments((a) => [...a, ...next].slice(0, 4));
  }

  function toggleMic() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setMicNote("Voice input needs Chrome or Edge."); setTimeout(() => setMicNote(null), 4000); return; }
    if (listening) { recogRef.current?.stop(); return; }
    const r = new SR();
    r.lang = "en-US"; r.interimResults = true; r.continuous = false;
    r.onresult = (e: any) => setValue(Array.from(e.results).map((x: any) => x[0].transcript).join(""));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    setListening(true);
    r.start();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-5">
      <div className="rounded-[20px] border border-border bg-surface transition focus-within:border-border-heavy">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {attachments.map((a) => (
              <div key={a.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.dataUrl} alt="" className="size-14 rounded-lg border border-border object-cover" />
                <button onClick={() => setAttachments((x) => x.filter((y) => y.id !== a.id))}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-background text-muted-foreground ring-1 ring-border hover:text-foreground"><X className="size-3" /></button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          name="message"
          aria-label="Ask anything about this product"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as any).isComposing) { e.preventDefault(); submit(); } }}
          placeholder="Ask anything about this product…"
          rows={1}
          className="prox-scroll block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3.5 text-chat text-foreground outline-none placeholder:text-faint"
        />
        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
          <button onClick={() => fileRef.current?.click()} title="Attach an image" aria-label="Attach an image"
            className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
            <Plus className="size-4" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

          <div className="flex items-center gap-1.5">
            <button onClick={() => setVoiceEnabled(!voiceEnabled)} title={voiceEnabled ? "Spoken replies on" : "Spoken replies off"} aria-label={voiceEnabled ? "Turn spoken replies off" : "Turn spoken replies on"} aria-pressed={voiceEnabled}
              className={cn("grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10", voiceEnabled && "text-accent")}>
              {voiceEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
            <button onClick={toggleMic} title="Speak your question" aria-label="Speak your question" aria-pressed={listening}
              className={cn("grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10", listening && "bg-arc-soft text-arc animate-pulse-dot")}>
              <Mic className="size-4" />
            </button>
            {isStreaming ? (
              <button onClick={onStop} title="Stop" aria-label="Stop generating" className="grid size-8 place-items-center rounded-full bg-foreground text-background transition hover:opacity-90"><Square className="size-3 fill-current" /></button>
            ) : (
              <button onClick={submit} disabled={!value.trim() && !attachments.length} title="Send" aria-label="Send message"
                className="grid size-8 place-items-center rounded-full bg-foreground text-background transition enabled:hover:opacity-90 disabled:opacity-30"><ArrowUp className="size-4" /></button>
            )}
          </div>
        </div>
      </div>
      <p className={cn("mt-2 text-center text-[11px]", micNote ? "text-muted-foreground" : "text-faint")} role={micNote ? "status" : undefined}>
        {micNote ?? "Grounded in the manual · cited to the page · runs in the background"}
      </p>
    </div>
  );
}
