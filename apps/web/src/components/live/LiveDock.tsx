"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useLiveStore } from "@/lib/live/liveStore";
import { useLiveSession } from "@/lib/live/useLiveSession";
import { PreCall } from "./LiveStage";
import { VoiceBar } from "./VoiceBar";
import { CameraPiP } from "./CameraPiP";

// Hosts a live call WITHOUT taking over the stage. Before the call it shows the
// pre-call setup as a centered overlay; once active it collapses to a voice bar
// (replacing the composer) + a floating camera PiP, leaving the stage visible so
// artifacts render live as Takt talks.
export function LiveDock({ chatId, productSlug, onExit }: { chatId: string; productSlug: string | null; onExit: () => void }) {
  const { start, stop, download, toggleMute, setPtt, holdTalk, toggleCamera, getLevels, getSpeechProgress, refreshDevices, setMic, setCam } = useLiveSession(chatId, productSlug);
  const { active, phase, modelsDownloaded, downloading, downloadPct, downloadLoaded, downloadTotal, downloadModels, muted, pttEnabled, cameraOn, cameraStream, error, mics, cams, micId, camId } = useLiveStore();

  useEffect(() => { void refreshDevices(); }, [refreshDevices]);
  useEffect(() => () => stop(), [stop]);

  const end = () => { stop(); onExit(); };

  if (!active) {
    return (
      <div className="absolute inset-0 z-30 flex flex-col bg-background/70 backdrop-blur-sm">
        <div className="flex justify-end p-3">
          <button onClick={end} title="Close" aria-label="Close live" className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"><X className="size-4" /></button>
        </div>
        <PreCall mics={mics} cams={cams} micId={micId} camId={camId} onMic={(id) => void setMic(id)} onCam={setCam}
          error={error} modelsDownloaded={modelsDownloaded} downloading={downloading} downloadPct={downloadPct}
          downloadLoaded={downloadLoaded} downloadTotal={downloadTotal} downloadModels={downloadModels}
          refreshDevices={refreshDevices} onDownload={() => void download()} onStart={() => void start()} />
      </div>
    );
  }

  return (
    <>
      {cameraOn && <CameraPiP stream={cameraStream} />}
      <VoiceBar phase={phase} muted={muted} pttEnabled={pttEnabled} cameraOn={cameraOn}
        toggleMute={toggleMute} setPtt={setPtt} holdTalk={holdTalk} toggleCamera={toggleCamera}
        getLevels={getLevels} getSpeechProgress={getSpeechProgress} onEnd={end} />
    </>
  );
}
