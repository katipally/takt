"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useLiveStore } from "@/lib/live/liveStore";
import { useLiveSession } from "@/lib/live/useLiveSession";
import { useUi } from "@/lib/uiStore";
import { PreCall } from "./LiveStage";
import { VoiceBar } from "./VoiceBar";
import { CameraPiP } from "./CameraPiP";
import { OverlayLayer } from "./OverlayLayer";

// Hosts a live call WITHOUT taking over the stage. Before the call it shows the
// setup as a centered MODAL (permissions, mic/camera, model download) that
// animates in; once active it collapses to a VoiceBar (the composer morphs into
// it) + a floating camera PiP + the agent's overlay layer, leaving the stage
// visible. The spoken transcript lands in the chat rail as live turns.
export function LiveDock({ chatId, productSlug, onExit }: { chatId: string; productSlug: string | null; onExit: () => void }) {
  const { start, stop, download, toggleMute, toggleCamera, getLevels, getBands, refreshDevices, setMic, setCam } = useLiveSession(chatId, productSlug);
  const { active, phase, modelsDownloaded, downloading, downloadPct, downloadLoaded, downloadTotal, downloadModels, muted, cameraOn, cameraStream, error, mics, cams, micId, camId } = useLiveStore();
  const openSettings = useUi((s) => s.openSettings);

  useEffect(() => { void refreshDevices(); }, [refreshDevices]);
  useEffect(() => () => stop(), [stop]);

  const end = () => { stop(); onExit(); };

  // Backdrop dismiss must fire ONLY on a genuine backdrop press — the press has to
  // both start and end on the backdrop itself. Without this, iOS Safari retargets
  // a tap's synthetic `click` to whatever is underneath when the tapped element is
  // removed mid-gesture. Tapping "Download AI models" swaps the button out for the
  // progress bar on the same tap, so the click fell through to this backdrop and
  // closed Live straight back to chat — only on real phones (desktop doesn't
  // retarget), which is why it reproduced on a device but not in emulation.
  const pressedBackdrop = useRef(false);

  return (
    <>
      {/* setup modal — only before the call is live */}
      <AnimatePresence>
        {!active && (
          <motion.div key="precall" className="absolute inset-0 z-40 grid place-items-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {/* faint dim only (NO backdrop-blur of the whole section) + click-to-close;
                separation comes from the modal's own lift, not a blurred stage. */}
            <div className="absolute inset-0 bg-background/25"
              onPointerDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
              onClick={(e) => { if (e.target === e.currentTarget && pressedBackdrop.current) end(); }} />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="relative z-10 flex max-h-[86vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_70px_-20px_rgba(0,0,0,0.55)]">
              <div className="flex justify-end p-2">
                <button onClick={end} title="Close" aria-label="Close live" className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"><X className="size-4" /></button>
              </div>
              <PreCall mics={mics} cams={cams} micId={micId} camId={camId} onMic={(id) => void setMic(id)} onCam={setCam}
                error={error} modelsDownloaded={modelsDownloaded} downloading={downloading} downloadPct={downloadPct}
                downloadLoaded={downloadLoaded} downloadTotal={downloadTotal} downloadModels={downloadModels}
                refreshDevices={refreshDevices} onDownload={() => void download()}
                onStart={() => void start().then(() => {
                  // The pre-call screen just showed a live camera preview — carry
                  // that into the call instead of starting with the camera off.
                  const s = useLiveStore.getState();
                  if (s.active && !s.cameraOn && cams.length) return toggleCamera();
                })}
                onOpenSettings={openSettings} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* active call — camera PiP + agent overlay on the stage, voice bar below
          (the composer morphs into it via layoutId "takt-dock") */}
      {active && cameraOn && <CameraPiP stream={cameraStream} />}
      {active && <OverlayLayer />}
      {active && (
        <VoiceBar phase={phase} muted={muted} cameraOn={cameraOn}
          toggleMute={toggleMute} toggleCamera={toggleCamera}
          getLevels={getLevels} getBands={getBands} onEnd={end} />
      )}
    </>
  );
}
