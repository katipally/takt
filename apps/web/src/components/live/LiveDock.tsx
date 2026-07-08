"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useLiveStore } from "@/lib/live/liveStore";
import { useLiveSession } from "@/lib/live/useLiveSession";
import { PreCall } from "./LiveStage";
import { VoiceBar } from "./VoiceBar";
import { CameraPiP } from "./CameraPiP";

// Hosts a live call WITHOUT taking over the stage. Before the call it shows the
// setup as a centered MODAL (permissions, mic/camera, model download) that
// animates in; once active it collapses to a VoiceBar (the composer morphs into
// it) + a floating camera PiP, leaving the stage visible for concept visuals.
export function LiveDock({ chatId, productSlug, onExit }: { chatId: string; productSlug: string | null; onExit: () => void }) {
  const { start, stop, download, toggleMute, setPtt, holdTalk, toggleCamera, getLevels, refreshDevices, setMic, setCam } = useLiveSession(chatId, productSlug);
  const { active, phase, modelsDownloaded, downloading, downloadPct, downloadLoaded, downloadTotal, downloadModels, muted, pttEnabled, cameraOn, cameraStream, error, mics, cams, micId, camId } = useLiveStore();

  useEffect(() => { void refreshDevices(); }, [refreshDevices]);
  useEffect(() => () => stop(), [stop]);

  const end = () => { stop(); onExit(); };

  return (
    <>
      {/* setup modal — only before the call is live */}
      <AnimatePresence>
        {!active && (
          <motion.div key="precall" className="absolute inset-0 z-40 grid place-items-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {/* faint dim only (NO backdrop-blur of the whole section) + click-to-close;
                separation comes from the modal's own lift, not a blurred stage. */}
            <div className="absolute inset-0 bg-background/25" onClick={end} />
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
                refreshDevices={refreshDevices} onDownload={() => void download()} onStart={() => void start()} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* active call — camera PiP on the stage + the voice bar (morphed composer) */}
      {active && cameraOn && <CameraPiP stream={cameraStream} />}
      {active && (
        <VoiceBar phase={phase} muted={muted} pttEnabled={pttEnabled} cameraOn={cameraOn}
          toggleMute={toggleMute} setPtt={setPtt} holdTalk={holdTalk} toggleCamera={toggleCamera}
          getLevels={getLevels} onEnd={end} />
      )}
    </>
  );
}
