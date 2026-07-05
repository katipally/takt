"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, X, AudioLines, Hand, SlidersHorizontal } from "lucide-react";
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
  const { start, stop, download, toggleMute, setPtt, holdTalk, toggleCamera, getLevels, getSpeechProgress, refreshDevices, setMic, setCam } = useLiveSession(chatId, productSlug);
  const { active, phase, modelsDownloaded, downloading, downloadPct, muted, pttEnabled, cameraOn, cameraStream, userCaption, userPartial, agentCaption, error, mics, cams, micId, camId } = useLiveStore();
  const [showDevices, setShowDevices] = useState(false);

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
        <div className="flex items-center gap-1">
          {active && (
            <button onClick={() => setShowDevices((v) => !v)} title="Devices" aria-label="Devices" aria-pressed={showDevices}
              className={cn("grid size-8 place-items-center rounded-full transition hover:bg-foreground/10 hover:text-foreground", showDevices ? "text-foreground" : "text-muted-foreground")}>
              <SlidersHorizontal className="size-4" />
            </button>
          )}
          <button onClick={end} title="Close live" aria-label="Close live"
            className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* in-call device switcher — change mic/camera without ending the call */}
      {active && showDevices && (
        <div className="absolute right-3 top-12 z-30 w-64 space-y-2 rounded-xl border border-border bg-surface p-3 shadow-xl animate-fade-up">
          <p className="text-[11px] font-medium text-faint">Microphone</p>
          <DeviceSelect icon={Mic} opts={mics} value={micId} onChange={(id) => void setMic(id)} />
          <p className="pt-1 text-[11px] font-medium text-faint">Camera</p>
          <DeviceSelect icon={Video} opts={cams} value={camId} onChange={setCam} />
          {cams.length > 0 && (
            <button onClick={() => void toggleCamera()} className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-[12px] text-muted-foreground transition hover:text-foreground">
              {cameraOn ? "Turn camera off" : "Turn camera on"}
            </button>
          )}
        </div>
      )}

      {!active ? (
        <PreCall mics={mics} cams={cams} micId={micId} camId={camId} onMic={(id) => void setMic(id)} onCam={setCam}
          error={error} modelsDownloaded={modelsDownloaded} downloading={downloading} downloadPct={downloadPct}
          onDownload={() => void download()} onStart={() => void start()} />
      ) : (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col animate-live-in">
          {/* ── stage ── centered orb, or a centered rounded camera card ── */}
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-hidden px-6">
            {loading ? (
              <DownloadBar pct={downloadPct} phase={phase} />
            ) : cameraOn ? (
              <div className="flex flex-col items-center gap-4">
                <div className="relative aspect-[4/3] w-full max-w-md overflow-hidden rounded-3xl border border-border/60 bg-black shadow-2xl shadow-black/40 transition-all duration-300">
                  <CameraStage stream={cameraStream} />
                </div>
                {/* orb sits OUTSIDE the video so it never blocks what you're showing */}
                <Orb phase={phase} getLevels={getLevels} size={76} />
              </div>
            ) : (
              <Orb phase={phase} getLevels={getLevels} size={240} />
            )}

            {/* ── caption line, always below the stage ── */}
            {!loading && (
              <div className="flex min-h-[3.25rem] w-full max-w-xl flex-col items-center justify-start px-2 text-center">
                {/* Your live words take priority — so interrupting or asking the
                    next question always shows YOUR caption, not the old answer. */}
                {userPartial && userCaption
                  ? <p className="text-[15px] italic text-muted-foreground">{userCaption}</p>
                  : agentCaption
                    ? <AgentCaption text={agentCaption} getProgress={getSpeechProgress} />
                    : <p className={cn("text-[12px] font-medium", phase === "listening" ? "text-[color:var(--takt-success,#22c55e)]" : "text-muted-foreground")} aria-live="polite">{PHASE_LABEL[phase]}</p>}
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
              className="grid size-12 place-items-center rounded-full bg-danger text-white transition duration-150 hover:scale-105 hover:opacity-90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background">
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
function AgentCaption({ text, getProgress }: { text: string; getProgress: () => number }) {
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
    <p className="max-w-xl px-4 py-2 text-[16px] leading-snug text-foreground">
      {text.slice(0, shown)}
    </p>
  );
}

function CameraStage({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay muted playsInline className="h-full w-full object-cover" />;
}

function DeviceSelect({ icon: Icon, opts, value, onChange }: { icon: typeof Mic; opts: DeviceOpt[]; value?: string; onChange: (id: string) => void }) {
  if (!opts.length) return <p className="text-[12px] text-faint">No device found</p>;
  return (
    <label className="flex items-center gap-2 text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <select value={value ?? opts[0]?.id ?? ""} onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-2 py-1.5 text-[12px] text-foreground">
        {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

function PreCall({ mics, cams, micId, camId, onMic, onCam, error, modelsDownloaded, downloading, downloadPct, onDownload, onStart }: {
  mics: DeviceOpt[]; cams: DeviceOpt[]; micId?: string; camId?: string;
  onMic: (id: string) => void; onCam: (id: string) => void; error?: string;
  modelsDownloaded: boolean; downloading: boolean; downloadPct: number; onDownload: () => void; onStart: () => void;
}) {
  return (
    <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-10 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-accent/10 text-accent">
        <AudioLines className="size-7" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-[18px] font-semibold tracking-tight">Talk with Takt</h2>
        <p className="max-w-sm text-[13px] text-muted-foreground">A real conversation — it listens as you speak, answers out loud, and can see through your camera. Runs privately on your device.</p>
      </div>
      <div className="w-full max-w-xs space-y-2">
        <DeviceSelect icon={Mic} opts={mics} value={micId} onChange={onMic} />
        <DeviceSelect icon={Video} opts={cams} value={camId} onChange={onCam} />
      </div>

      {downloading ? (
        <div className="flex w-64 max-w-[80vw] flex-col items-center gap-2">
          <p className="text-[12px] font-medium text-muted-foreground">Downloading on-device AI…</p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${Math.round(downloadPct * 100)}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground">{Math.round(downloadPct * 100)}%</p>
        </div>
      ) : !modelsDownloaded ? (
        <div className="flex flex-col items-center gap-2">
          <button onClick={onDownload} className="rounded-full bg-accent px-6 py-2.5 text-[14px] font-medium text-accent-foreground transition duration-150 hover:scale-[1.03] hover:opacity-90 active:scale-95">
            Download AI models
          </button>
          <p className="text-[11px] text-faint">~one-time, ~150 MB · runs fully on your device</p>
        </div>
      ) : (
        <button onClick={onStart} className="rounded-full bg-accent px-7 py-2.5 text-[14px] font-medium text-accent-foreground transition duration-150 hover:scale-[1.03] hover:opacity-90 active:scale-95">
          Start
        </button>
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

function CtrlButton({ on, onClick, title, icon: Icon, danger }: { on: boolean; onClick: () => void; title: string; icon: typeof Mic; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} aria-pressed={on}
      className={cn("grid size-12 place-items-center rounded-full border transition duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        danger ? "border-danger/40 bg-danger/10 text-danger"
          : on ? "border-border bg-foreground/[0.06] text-foreground hover:bg-foreground/10"
            : "border-border text-muted-foreground hover:bg-foreground/[0.06]")}>
      <Icon className="size-5" />
    </button>
  );
}
