"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, X, Radio, AudioLines } from "lucide-react";
import { useLiveStore, type LivePhase, type DeviceOpt } from "@/lib/live/liveStore";
import { useLiveSession } from "@/lib/live/useLiveSession";
import { useUi } from "@/lib/uiStore";
import { cn } from "@/lib/cn";

const PHASE_LABEL: Record<LivePhase, string> = {
  off: "Not connected", connecting: "Connecting…", warming: "Warming up…",
  idle: "Listening", listening: "Listening", thinking: "Thinking…", speaking: "Speaking",
};

export function LivePanel({ chatId, productSlug }: { chatId: string; productSlug: string }) {
  const { start, stop, toggleMute, toggleCamera, getLevels, refreshDevices, setMic, setCam } = useLiveSession(chatId, productSlug);
  const { active, phase, muted, cameraOn, cameraStream, userCaption, agentCaption, error, mics, cams, micId, camId } = useLiveStore();
  const closeLive = useUi((s) => s.setLiveOpen);

  // Populate device lists when the panel mounts (labels fill in after a grant).
  useEffect(() => { void refreshDevices(); }, [refreshDevices]);

  const end = () => { stop(); };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex h-12 shrink-0 items-center justify-between px-3">
        <span className="flex items-center gap-1.5 text-[13px] font-medium">
          <Radio className={cn("size-3.5", active ? "text-accent" : "text-muted-foreground")} /> Live
        </span>
        <button onClick={() => { stop(); closeLive(false); }} title="Close" className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      {!active ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-10 text-center">
          <AudioLines className="size-8 text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">Talk to Prox and let it see through your camera. It answers out loud and can still draw on the Canvas.</p>
          <DeviceSelects mics={mics} cams={cams} micId={micId} camId={camId} onMic={setMic} onCam={setCam} />
          <button onClick={() => void start()} className="rounded-full bg-accent px-5 py-2 text-[13px] font-medium text-accent-foreground transition hover:opacity-90">
            Start live
          </button>
          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-between gap-3 px-4 pb-4">
          <CameraPreview stream={cameraStream} on={cameraOn} />
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <Orb phase={phase} getLevels={getLevels} />
            <span className="text-[12px] text-muted-foreground">{PHASE_LABEL[phase]}</span>
          </div>
          <Captions user={userCaption} agent={agentCaption} />
          {error && <p className="text-[12px] text-danger">{error}</p>}
          <DeviceSelects mics={mics} cams={cams} micId={micId} camId={camId} onMic={setMic} onCam={setCam} showCam={cameraOn} />
          <div className="flex items-center gap-2">
            <CtrlButton on={!muted} onClick={toggleMute} title={muted ? "Unmute" : "Mute"} icon={muted ? MicOff : Mic} danger={muted} />
            <CtrlButton on={cameraOn} onClick={() => void toggleCamera()} title={cameraOn ? "Turn camera off" : "Turn camera on"} icon={cameraOn ? Video : VideoOff} />
            <button onClick={end} title="End" className="grid size-11 place-items-center rounded-full bg-danger text-white transition hover:opacity-90">
              <PhoneOff className="size-4.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DeviceSelects({ mics, cams, micId, camId, onMic, onCam, showCam = true }: { mics: DeviceOpt[]; cams: DeviceOpt[]; micId?: string; camId?: string; onMic: (id: string) => void; onCam: (id: string) => void; showCam?: boolean }) {
  if (!mics.length && !cams.length) return null;
  const cls = "min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-2 py-1 text-[12px] text-foreground";
  return (
    <div className="w-full space-y-1.5">
      {mics.length > 0 && (
        <label className="flex items-center gap-2 text-muted-foreground">
          <Mic className="size-3.5 shrink-0" />
          <select value={micId ?? mics[0]?.id ?? ""} onChange={(e) => onMic(e.target.value)} className={cls}>
            {mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      )}
      {showCam && cams.length > 0 && (
        <label className="flex items-center gap-2 text-muted-foreground">
          <Video className="size-3.5 shrink-0" />
          <select value={camId ?? cams[0]?.id ?? ""} onChange={(e) => onCam(e.target.value)} className={cls}>
            {cams.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

function CtrlButton({ on, onClick, title, icon: Icon, danger }: { on: boolean; onClick: () => void; title: string; icon: typeof Mic; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title}
      className={cn("grid size-11 place-items-center rounded-full border transition",
        danger ? "border-danger/40 bg-danger/10 text-danger"
          : on ? "border-border bg-foreground/[0.06] text-foreground hover:bg-foreground/10"
            : "border-border text-muted-foreground hover:bg-foreground/[0.06]")}>
      <Icon className="size-4.5" />
    </button>
  );
}

function CameraPreview({ stream, on }: { stream: MediaStream | null; on: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  if (!on) return null;
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-surface">
      <video ref={ref} autoPlay muted playsInline className="aspect-video w-full object-cover" />
    </div>
  );
}

function Captions({ user, agent }: { user: string; agent: string }) {
  if (!user && !agent) return null;
  return (
    <div className="w-full space-y-1.5 text-[13px] leading-snug">
      {user && <p className="text-muted-foreground"><span className="text-faint">You: </span>{user}</p>}
      {agent && <p className="text-foreground"><span className="text-faint">Prox: </span>{agent}</p>}
    </div>
  );
}

function Orb({ phase, getLevels }: { phase: LivePhase; getLevels: () => { mic: number; agent: number } }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const { mic, agent } = getLevels();
      const level = phase === "speaking" ? agent : phase === "listening" || phase === "idle" ? mic : 0;
      const scale = 1 + Math.min(0.55, level * 3.2);
      if (ref.current) ref.current.style.transform = `scale(${scale.toFixed(3)})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, getLevels]);
  const tone = phase === "speaking" ? "bg-accent" : phase === "thinking" ? "bg-accent/40" : "bg-accent/70";
  return (
    <div className="relative grid size-40 place-items-center">
      {phase === "thinking" && <span className="absolute size-24 animate-ping rounded-full bg-accent/20" />}
      <div ref={ref} className={cn("size-24 rounded-full opacity-90", tone)} style={{ transition: "transform 70ms linear" }} />
    </div>
  );
}
