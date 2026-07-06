"use client";

import { useEffect } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Hand } from "lucide-react";
import { useLiveStore, type LivePhase } from "@/lib/live/liveStore";
import { Orb } from "./Orb";
import { AgentCaption } from "./LiveStage";
import { cn } from "@/lib/cn";

const PHASE_LABEL: Record<LivePhase, string> = {
  off: "", connecting: "Connecting…", loading: "Preparing…", reconnecting: "Reconnecting…",
  idle: "Listening", listening: "Listening…", thinking: "Thinking…", speaking: "",
};

// The composer morphed into a voice control bar during an active call: the orb
// sits inside it, a single streaming subtitle line reads out the current words,
// and the mute / camera / end controls live on the right. Replaces the text
// composer while voice is active; the stage stays visible behind it.
export function VoiceBar({
  phase, muted, pttEnabled, cameraOn, toggleMute, setPtt, holdTalk, toggleCamera, getLevels, getSpeechProgress, onEnd,
}: {
  phase: LivePhase; muted: boolean; pttEnabled: boolean; cameraOn: boolean;
  toggleMute: () => void; setPtt: (v: boolean) => void; holdTalk: (v: boolean) => void; toggleCamera: () => void | Promise<void>;
  getLevels: () => { mic: number; agent: number }; getSpeechProgress: () => number; onEnd: () => void;
}) {
  const { userCaption, userPartial, agentCaption } = useLiveStore();

  useEffect(() => {
    if (!pttEnabled) return;
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat) { e.preventDefault(); holdTalk(true); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); holdTalk(false); } };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [pttEnabled, holdTalk]);

  const subtitle = userPartial && userCaption
    ? <span className="italic text-muted-foreground">{userCaption}</span>
    : agentCaption
      ? <AgentCaption text={agentCaption} getProgress={getSpeechProgress} />
      : <span className="text-muted-foreground">{PHASE_LABEL[phase] || "Listening…"}</span>;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col">
      <div className="h-14 bg-gradient-to-t from-card to-transparent" />
      <div className="pointer-events-auto bg-card/85 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-3xl px-5 pb-5">
          <div className="flex items-center gap-3 rounded-[20px] border border-border bg-surface px-3 py-2.5 shadow-[var(--shadow-card)]">
            {/* orb, inside the bar */}
            <div className="grid size-11 shrink-0 place-items-center"><Orb phase={phase} getLevels={getLevels} size={44} /></div>

            {/* one-line streaming subtitle */}
            <div className="min-w-0 flex-1 truncate text-[14px] leading-snug [&_p]:m-0 [&_p]:truncate [&_p]:p-0 [&_p]:text-[14px]" aria-live="polite">
              {subtitle}
            </div>

            {/* controls */}
            <div className="flex shrink-0 items-center gap-1.5">
              <IconBtn on={pttEnabled} title={pttEnabled ? "Hands-free" : "Push-to-talk"} onClick={() => setPtt(!pttEnabled)} icon={Hand} />
              {pttEnabled ? (
                <button onPointerDown={() => holdTalk(true)} onPointerUp={() => holdTalk(false)} onPointerLeave={() => holdTalk(false)}
                  className={cn("select-none rounded-full px-4 py-2 text-[12px] font-medium transition", muted ? "bg-foreground/[0.06] text-muted-foreground" : "bg-accent text-white")}>
                  {muted ? "Hold · Space" : "Listening"}
                </button>
              ) : (
                <IconBtn on={!muted} title={muted ? "Unmute" : "Mute"} onClick={toggleMute} icon={muted ? MicOff : Mic} danger={muted} />
              )}
              <IconBtn on={cameraOn} title={cameraOn ? "Camera off" : "Camera on"} onClick={() => void toggleCamera()} icon={cameraOn ? Video : VideoOff} />
              <button onClick={onEnd} title="End call" aria-label="End call"
                className="grid size-9 place-items-center rounded-full bg-danger text-white transition hover:opacity-90 active:scale-95">
                <PhoneOff className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ on, title, onClick, icon: Icon, danger }: { on: boolean; title: string; onClick: () => void; icon: typeof Mic; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} aria-pressed={on}
      className={cn("grid size-9 place-items-center rounded-full transition hover:bg-foreground/10",
        danger ? "text-danger" : on ? "text-foreground" : "text-muted-foreground")}>
      <Icon className="size-4" />
    </button>
  );
}
