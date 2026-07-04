"use client";

import { useCallback, useRef } from "react";
import { chatStore } from "@/lib/chatStore";
import { LiveClient } from "./liveClient";
import { MicCapture } from "./audioCapture";
import { AudioPlayer } from "./audioPlayback";
import { CameraCapture } from "./cameraCapture";
import { useLiveStore, type LivePhase } from "./liveStore";

// Orchestrates one live call: wires the WebSocket to the mic, camera, speaker,
// and the chat store (so the spoken conversation + any artifacts render in the
// normal transcript/Canvas). Returns controls + a level getter for the orb.
export function useLiveSession(chatId: string, productSlug: string) {
  const set = useLiveStore((s) => s.set);
  const client = useRef<LiveClient | null>(null);
  const mic = useRef<MicCapture | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const cam = useRef<CameraCapture | null>(null);
  const assistantId = useRef<string | null>(null);

  const start = useCallback(async () => {
    set({ error: undefined, phase: "connecting", active: true, userCaption: "", agentCaption: "" });
    const play = new AudioPlayer();
    play.resume(); // user gesture → unlock audio
    player.current = play;

    const c = new LiveClient({
      onClose: () => set({ phase: "off", active: false }),
      onError: (m) => set({ error: m }),
      onState: (p) => set({ phase: p as LivePhase }),
      onAudio: (pcm, epoch) => play.play(pcm, epoch),
      onFlush: (epoch) => play.flush(epoch),
      onVision: (fps, size) => cam.current?.setVision(fps, size),
      onCaption: (role, text, final) => {
        if (role === "user" && final) {
          if (assistantId.current) chatStore.liveFinish(chatId, assistantId.current);
          set({ userCaption: text, agentCaption: "" });
          assistantId.current = chatStore.liveUserTurn(chatId, productSlug, text);
        } else if (role === "agent") {
          set({ agentCaption: (useLiveStore.getState().agentCaption + " " + text).trim() });
        }
      },
      onSse: (e) => {
        if (e.type === "done") {
          if (assistantId.current) { chatStore.liveFinish(chatId, assistantId.current); assistantId.current = null; }
          return;
        }
        if (assistantId.current) chatStore.liveApply(chatId, assistantId.current, e);
      },
      onNeedFrame: (reqId) => {
        const camera = cam.current;
        if (!camera) { client.current?.frameResponse(reqId); return; }
        void camera.captureOne().then((b) => { client.current?.frameResponse(reqId); if (b) client.current?.sendFrame(b); });
      },
    });
    client.current = c;
    c.connect(productSlug, chatId);

    const m = new MicCapture();
    mic.current = m;
    try {
      await m.start((buf) => c.sendPcm(buf), useLiveStore.getState().micId);
      await refreshDevices(); // labels are only exposed after a grant
    } catch {
      set({ error: "Microphone access denied. Allow the mic and try again.", phase: "off", active: false });
      c.close();
    }
  }, [chatId, productSlug, set]);

  const refreshDevices = useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      set({
        mics: devs.filter((d) => d.kind === "audioinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` })),
        cams: devs.filter((d) => d.kind === "videoinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })),
      });
    } catch { /* enumerate not available */ }
  }, [set]);

  const setMic = useCallback(async (id: string) => {
    set({ micId: id });
    if (mic.current && client.current) {
      mic.current.stop();
      const m = new MicCapture();
      mic.current = m;
      try { await m.start((buf) => client.current!.sendPcm(buf), id); m.setMuted(useLiveStore.getState().muted); }
      catch { set({ error: "Couldn't switch microphone." }); }
    }
  }, [set]);

  const setCam = useCallback(async (id: string) => {
    set({ camId: id });
    if (cam.current && useLiveStore.getState().cameraOn) {
      cam.current.stop();
      const c = new CameraCapture();
      cam.current = c;
      try { await c.start((b) => client.current?.sendFrame(b), id); set({ cameraStream: c.getStream() ?? null }); }
      catch { set({ error: "Couldn't switch camera." }); }
    }
  }, [set]);

  const stop = useCallback(() => {
    client.current?.close();
    mic.current?.stop();
    cam.current?.stop();
    player.current?.close();
    if (assistantId.current) chatStore.liveFinish(chatId, assistantId.current);
    assistantId.current = null;
    client.current = null; mic.current = null; cam.current = null; player.current = null;
    set({ active: false, phase: "off", cameraOn: false, muted: false, cameraStream: null, userCaption: "", agentCaption: "" });
  }, [chatId, set]);

  const toggleMute = useCallback(() => {
    const next = !useLiveStore.getState().muted;
    mic.current?.setMuted(next);
    client.current?.control(next ? "mute" : "unmute");
    set({ muted: next });
  }, [set]);

  const toggleCamera = useCallback(async () => {
    const on = !useLiveStore.getState().cameraOn;
    if (on) {
      const camera = new CameraCapture();
      cam.current = camera;
      try {
        await camera.start((b) => client.current?.sendFrame(b), useLiveStore.getState().camId);
        await refreshDevices();
      } catch {
        set({ error: "Camera access denied." });
        cam.current = null;
        return;
      }
      client.current?.control("camera_on");
      set({ cameraOn: true, cameraStream: camera.getStream() ?? null });
    } else {
      client.current?.control("camera_off");
      cam.current?.stop();
      cam.current = null;
      set({ cameraOn: false, cameraStream: null });
    }
  }, [set]);

  const getLevels = useCallback(() => ({ mic: mic.current?.level() ?? 0, agent: player.current?.level() ?? 0 }), []);

  return { start, stop, toggleMute, toggleCamera, getLevels, refreshDevices, setMic, setCam };
}
