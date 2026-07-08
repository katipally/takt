"use client";

import { useEffect, useRef } from "react";
import type { LivePhase } from "@/lib/live/liveStore";

// Per-state color so the orb itself signals what's happening: green while it
// listens to you, blue while it speaks, amber while it thinks/connects, a calm
// neutral when idle. Colors cross-fade (transition on the core/rings below).
function colorsFor(phase: LivePhase): { core: string; ring: string; glow: string } {
  switch (phase) {
    case "listening": // green — hearing you
      return { core: "radial-gradient(circle at 40% 35%, #d6f9e4, #56cf8c 55%, #2f9a63 82%)", ring: "rgba(74,222,128,0.55)", glow: "rgba(74,222,128,0.40)" };
    case "speaking": // blue — talking
      return { core: "radial-gradient(circle at 40% 35%, #cfe0ff, #7d9ae8 55%, #566fd0 82%)", ring: "rgba(125,145,240,0.55)", glow: "rgba(125,145,240,0.42)" };
    case "thinking": case "connecting": case "loading": case "reconnecting": // amber — working
      return { core: "radial-gradient(circle at 40% 35%, #ffe7c4, #f2a24a 55%, #c9701f 82%)", ring: "rgba(226,112,31,0.55)", glow: "rgba(226,112,31,0.40)" };
    default: // idle — calm neutral
      return { core: "radial-gradient(circle at 40% 35%, #c9dcfc, #8fa8d8 55%, #6b7fb0 80%)", ring: "rgba(140,160,230,0.42)", glow: "rgba(140,160,230,0.35)" };
  }
}

// A simple, dependency-free voice orb: layered CSS circles driven by a rAF loop.
// No WebGL/shaders (which failed to compile on some GPUs and leaked contexts) —
// just a glowing core + two rings that react to the mic (listening) or the
// agent's voice (speaking), with a gentle breathing pulse while thinking/loading.
export function Orb({ phase, getLevels, size = 240 }: { phase: LivePhase; getLevels: () => { mic: number; agent: number }; size?: number }) {
  const core = useRef<HTMLDivElement>(null);
  const ring1 = useRef<HTMLDivElement>(null);
  const ring2 = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const reduce = matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, t0 = 0, cur = 0;
    const loop = (ms: number) => {
      if (!t0) t0 = ms;
      const time = (ms - t0) / 1000;
      const p = phaseRef.current;
      const { mic, agent } = getLevels();
      const busy = p === "thinking" || p === "connecting" || p === "loading" || p === "reconnecting";
      // Target amplitude 0..1: mic when listening, agent when speaking, a soft
      // sine while busy, near-flat when idle/reduced-motion.
      let amp = 0;
      // Speaking: the analyser gives a live, moving amplitude — plus a gentle base
      // wobble so the orb keeps breathing through quiet syllables (never goes flat).
      if (p === "speaking") amp = Math.min(1, agent * 4 + 0.06 * (1 + Math.sin(time * 6)));
      else if (p === "listening" || p === "idle") amp = Math.min(1, mic * 4);
      else if (busy) amp = 0.35 + 0.2 * Math.sin(time * 3);
      if (reduce) amp = busy ? 0.3 : Math.min(0.3, amp);
      cur += (amp - cur) * 0.2; // critically damped

      if (core.current) { core.current.style.transform = `scale(${1 + cur * 0.16})`; core.current.style.opacity = `${0.85 + cur * 0.15}`; }
      if (ring1.current) { ring1.current.style.transform = `scale(${1 + cur * 0.55})`; ring1.current.style.opacity = `${0.35 + cur * 0.35}`; }
      if (ring2.current) { ring2.current.style.transform = `scale(${1 + cur * 0.95})`; ring2.current.style.opacity = `${0.15 + cur * 0.3}`; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getLevels]);

  const c = colorsFor(phase);
  const ring = "absolute inset-0 rounded-full border will-change-transform";
  // Transform is driven per-frame (rAF) and is NOT in the transition list, so it
  // isn't smoothed; only the color cross-fades when the phase changes.
  return (
    <div className="relative grid place-items-center select-none" style={{ width: size, height: size }} aria-hidden>
      <div ref={ring2} className={ring} style={{ borderColor: c.ring, opacity: 0.6, transition: "border-color 400ms ease" }} />
      <div ref={ring1} className={ring} style={{ borderColor: c.ring, transition: "border-color 400ms ease" }} />
      <div ref={core} className="rounded-full will-change-transform" style={{
        width: size * 0.55, height: size * 0.55,
        background: c.core,
        boxShadow: `0 0 40px 8px ${c.glow}, inset 0 0 24px rgba(255,255,255,0.35)`,
        transition: "background 400ms ease, box-shadow 400ms ease",
      }} />
    </div>
  );
}
