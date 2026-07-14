"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { useLiveStore, type LivePhase } from "@/lib/live/liveStore";
import { toolMeta } from "@/lib/live/toolMeta";
import { Orb } from "./Orb";
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
  phase, muted, cameraOn, toggleMute, toggleCamera, getLevels, getBands, onEnd,
}: {
  phase: LivePhase; muted: boolean; cameraOn: boolean;
  toggleMute: () => void; toggleCamera: () => void | Promise<void>;
  getLevels: () => { mic: number; agent: number };
  getBands: () => { mic: number[]; agent: number[] };
  onEnd: () => void;
}) {
  const { userCaption, userPartial, agentCaption, agentCaptionMs, toolStatus, warming } = useLiveStore();
  const reduce = useReducedMotion();

  // Karaoke subtitle: reveal the agent's current chunk a few words at a time,
  // paced to how long it actually voices — so the bar shows the ~3-4 words being
  // spoken RIGHT NOW, not the whole sentence dumped at once.
  const [agentWindow, setAgentWindow] = useState("");
  useEffect(() => {
    const words = agentCaption.split(/\s+/).filter(Boolean);
    if (words.length <= 4) { setAgentWindow(words.join(" ")); return; }
    const dur = agentCaptionMs > 0 ? agentCaptionMs : words.length * 320;
    const WINDOW = 4;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const frac = Math.min(1, (performance.now() - start) / dur);
      const idx = Math.max(1, Math.min(words.length, Math.ceil(frac * words.length)));
      setAgentWindow(words.slice(Math.max(0, idx - WINDOW), idx).join(" "));
      if (frac < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [agentCaption, agentCaptionMs]);
  // MUST match Composer's morph spring so the composer ⇄ voice-bar shape animates
  // identically in both directions (layoutId "takt-dock").
  const morph = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 400, damping: 34, mass: 0.9 };

  // Subtitle: the user's interim words while they talk, else the chunk the agent
  // is speaking RIGHT NOW, else what it's doing (tool cue / warming), else phase.
  const busy = toolStatus ? toolMeta(toolStatus).active : warming ? "Warming up…" : "";
  const subtitle = userPartial && userCaption
    ? <span className="italic text-muted-foreground">{userCaption}</span>
    : agentCaption
      ? <span className="font-medium text-foreground">{agentWindow || agentCaption}</span>
      : busy
        ? <span className="arc-shimmer font-medium text-muted-foreground">{busy}</span>
        : <span className="text-muted-foreground">{PHASE_LABEL[phase] || "Listening…"}</span>;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col">
      {/* Transparent wrapper — NO band, NO backdrop-blur; the stage shows through
          everywhere except the bar pill itself, which carries its own lift. */}
      <div className="pointer-events-auto">
        <div className="mx-auto w-full max-w-3xl px-5 pb-3">
          <motion.div layoutId="takt-dock" transition={morph} className="flex items-center gap-3 rounded-[20px] border border-border bg-surface px-3 py-2.5 shadow-[0_10px_34px_-10px_rgba(0,0,0,0.32)]">
            {/* orb, inside the bar — the elements fade in as the composer morphs */}
            <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.12 }} className="grid size-11 shrink-0 place-items-center">
              <Orb phase={phase} getLevels={getLevels} getBands={getBands} size={44} />
            </motion.div>

            {/* one-line streaming subtitle */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.14 }} className="min-w-0 flex-1 truncate text-[14px] leading-snug" aria-live="polite">
              {subtitle}
            </motion.div>

            {/* controls */}
            <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="flex shrink-0 items-center gap-1.5">
              <IconBtn on={!muted} title={muted ? "Unmute" : "Mute"} onClick={toggleMute} icon={muted ? MicOff : Mic} danger={muted} />
              <IconBtn on={cameraOn} title={cameraOn ? "Camera off" : "Camera on"} onClick={() => void toggleCamera()} icon={cameraOn ? Video : VideoOff} />
              <button onClick={onEnd} title="End call" aria-label="End call"
                className="grid size-9 place-items-center rounded-full bg-danger text-white transition hover:opacity-90 active:scale-95">
                <PhoneOff className="size-4" />
              </button>
            </motion.div>
          </motion.div>
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
