"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, X, AudioLines, Hand } from "lucide-react";
import { useLiveStore, type LivePhase, type DeviceOpt } from "@/lib/live/liveStore";
import { useLiveSession } from "@/lib/live/useLiveSession";
import { Orb } from "./Orb";
import { cn } from "@/lib/cn";

const PHASE_LABEL: Record<LivePhase, string> = {
  off: "Not connected", connecting: "Connecting…", loading: "Preparing…", reconnecting: "Reconnecting…",
  idle: "Listening", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking",
};

// Full-screen immersive Live conversation — a natural call: a reactive orb (or
// the camera as the stage when it's on), minimal overlay captions, hands-free by
// default with a push-to-talk override. The full transcript is saved to the chat.
export function LiveStage({ chatId, productSlug, onExit }: { chatId: string; productSlug: string | null; onExit: () => void }) {
  const { start, stop, toggleMute, setPtt, holdTalk, toggleCamera, getLevels, getSpeechProgress, refreshDevices, setMic, setCam } = useLiveSession(chatId, productSlug);
  const { active, phase, downloadPct, muted, pttEnabled, cameraOn, cameraStream, userCaption, userPartial, agentCaption, error, mics, cams, micId, camId } = useLiveStore();

  useEffect(() => { void refreshDevices(); }, [refreshDevices]);
  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (!pttEnabled) return;
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat) { e.preventDefault(); holdTalk(true); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); holdTalk(false); } };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [pttEnabled, holdTalk]);

  const end = () => { stop(); onExit(); };
  const loading = phase === "loading" || phase === "connecting";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_28%,var(--accent-soft,rgba(120,130,255,0.12)),transparent_70%)]" />

      <div className="relative z-10 flex items-center justify-between px-4 py-3">
        <span className="flex items-center gap-1.5 text-[13px] font-medium">
          <AudioLines className={cn("size-4", active ? "text-accent" : "text-muted-foreground")} /> Live
        </span>
        <button onClick={end} title="Close live" aria-label="Close live"
          className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      {!active ? (
        <PreCall mics={mics} cams={cams} micId={micId} camId={camId} onMic={setMic} onCam={setCam} error={error} onStart={() => void start()} />
      ) : (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          {/* ── stage ── */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            {cameraOn && !loading ? (
              <>
                <CameraStage stream={cameraStream} />
                <div className="absolute bottom-3 right-3 z-20"><Orb phase={phase} getLevels={getLevels} size={84} /></div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Orb phase={phase} getLevels={getLevels} size={cameraOn ? 120 : 240} />
                {loading && <DownloadBar pct={downloadPct} phase={phase} />}
              </div>
            )}

            {/* ── minimal overlay captions ── */}
            {!loading && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-1 px-6 text-center">
                {agentCaption
                  ? <AgentCaption text={agentCaption} getProgress={getSpeechProgress} onCamera={cameraOn} />
                  : userPartial && userCaption
                    ? <p className="max-w-xl text-[15px] italic text-muted-foreground">{userCaption}</p>
                    : <p className={cn("text-[12px] font-medium", cameraOn ? "text-white/80" : "text-muted-foreground")} aria-live="polite">{PHASE_LABEL[phase]}</p>}
              </div>
            )}
          </div>

          {error && <p className="shrink-0 px-4 text-center text-[12px] text-danger">{error}</p>}

          {/* ── controls dock ── */}
          <div className="relative z-10 flex shrink-0 items-center justify-center gap-3 pb-5 pt-2">
            <CtrlButton on={pttEnabled} onClick={() => setPtt(!pttEnabled)} title={pttEnabled ? "Switch to hands-free" : "Switch to push-to-talk"} icon={Hand} />
            {pttEnabled ? (
              <button
                onPointerDown={() => holdTalk(true)} onPointerUp={() => holdTalk(false)} onPointerLeave={() => holdTalk(false)}
                className={cn("select-none rounded-full px-6 py-3 text-[13px] font-medium transition", muted ? "bg-foreground/[0.06] text-muted-foreground" : "bg-accent text-accent-foreground")}>
                {muted ? "Hold to talk · Space" : "Listening…"}
              </button>
            ) : (
              <CtrlButton on={!muted} onClick={toggleMute} title={muted ? "Unmute" : "Mute"} icon={muted ? MicOff : Mic} danger={muted} />
            )}
            <CtrlButton on={cameraOn} onClick={() => void toggleCamera()} title={cameraOn ? "Turn camera off" : "Turn camera on"} icon={cameraOn ? Video : VideoOff} />
            <button onClick={end} title="End" aria-label="End live"
              className="grid size-12 place-items-center rounded-full bg-danger text-white transition hover:opacity-90">
              <PhoneOff className="size-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DownloadBar({ pct, phase }: { pct: number; phase: LivePhase }) {
  return (
    <div className="flex w-64 max-w-[80vw] flex-col items-center gap-2">
      <p className="text-[12px] font-medium text-muted-foreground">
        {phase === "connecting" ? "Connecting…" : "Preparing on-device AI…"}
      </p>
      {phase === "loading" && (
        <>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${Math.round(pct * 100)}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground">{Math.round(pct * 100)}% · one-time download, then instant</p>
        </>
      )}
    </div>
  );
}

// The agent's spoken reply, revealed word-by-word in sync with the actual audio.
function AgentCaption({ text, getProgress, onCamera }: { text: string; getProgress: () => number; onCamera: boolean }) {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0); shownRef.current = shown;
  const prevLen = useRef(0);
  useEffect(() => {
    if (text.length < prevLen.current) { setShown(0); shownRef.current = 0; }
    prevLen.current = text.length;
    let raf = 0;
    const loop = () => { const target = Math.round(text.length * getProgress()); if (target > shownRef.current) setShown(target); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [text, getProgress]);
  return (
    <p className={cn("max-w-xl rounded-2xl px-4 py-2 text-[16px] leading-snug",
      onCamera ? "bg-black/45 text-white backdrop-blur-sm" : "text-foreground")}>
      {text.slice(0, shown)}
    </p>
  );
}

function CameraStage({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay muted playsInline className="h-full w-full object-cover" />;
}

function PreCall({ mics, cams, micId, camId, onMic, onCam, error, onStart }: {
  mics: DeviceOpt[]; cams: DeviceOpt[]; micId?: string; camId?: string;
  onMic: (id: string) => void; onCam: (id: string) => void; error?: string; onStart: () => void;
}) {
  return (
    <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-10 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-accent/10 text-accent">
        <AudioLines className="size-7" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-[18px] font-semibold tracking-tight">Talk with Prox</h2>
        <p className="max-w-sm text-[13px] text-muted-foreground">A real conversation — it listens as you speak, answers out loud, and can see through your camera and draw on the Canvas. Runs privately on your device.</p>
      </div>
      <div className="w-full max-w-xs space-y-2">
        {mics.length > 0 && (
          <label className="flex items-center gap-2 text-muted-foreground">
            <Mic className="size-3.5 shrink-0" />
            <select value={micId ?? mics[0]?.id ?? ""} onChange={(e) => onMic(e.target.value)}
              className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-2 py-1.5 text-[12px] text-foreground">
              {mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        )}
        {cams.length > 0 && (
          <label className="flex items-center gap-2 text-muted-foreground">
            <Video className="size-3.5 shrink-0" />
            <select value={camId ?? cams[0]?.id ?? ""} onChange={(e) => onCam(e.target.value)}
              className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-2 py-1.5 text-[12px] text-foreground">
              {cams.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <button onClick={onStart} className="rounded-full bg-accent px-6 py-2.5 text-[14px] font-medium text-accent-foreground transition hover:opacity-90">
        Start
      </button>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

function CtrlButton({ on, onClick, title, icon: Icon, danger }: { on: boolean; onClick: () => void; title: string; icon: typeof Mic; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} aria-pressed={on}
      className={cn("grid size-12 place-items-center rounded-full border transition",
        danger ? "border-danger/40 bg-danger/10 text-danger"
          : on ? "border-border bg-foreground/[0.06] text-foreground hover:bg-foreground/10"
            : "border-border text-muted-foreground hover:bg-foreground/[0.06]")}>
      <Icon className="size-5" />
    </button>
  );
}
