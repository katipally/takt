"use client";

import { useCallback, useRef } from "react";
import { chatStore } from "@/lib/chatStore";
import { LiveClient } from "./liveClient";
import { CameraCapture } from "./cameraCapture";
import { VoiceEngine, type EnginePhase } from "./voiceEngine";
import { loadModels, disposeModels, modelsReady } from "./models";
import { useLiveStore } from "./liveStore";

// Orchestrates one live call. THICK CLIENT: the VoiceEngine runs VAD+STT+TTS
// on-device; this hook wires it to the /live socket (final text + camera frames
// + cancel), the camera, and the chat store, and owns a single leak-proof
// teardown that every close path routes through.
export function useLiveSession(chatId: string, productSlug: string | null) {
  const set = useLiveStore((s) => s.set);
  const client = useRef<LiveClient | null>(null);
  const engine = useRef<VoiceEngine | null>(null);
  const cam = useRef<CameraCapture | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const assistantId = useRef<string | null>(null);
  const tornDown = useRef(false);
  const onPageHide = useRef<() => void>(() => {});

  // ── single teardown authority — releases EVERYTHING, always ───────────────
  const teardown = useCallback(() => {
    if (tornDown.current) return;
    tornDown.current = true;
    window.removeEventListener("pagehide", onPageHide.current);
    try { client.current?.close(); } catch { /* */ }
    try { engine.current?.stop(); } catch { /* */ }              // destroys VAD + closes audio
    try { cam.current?.stop(); } catch { /* */ }                 // camera light off
    if (micStream.current) { micStream.current.getTracks().forEach((t) => t.stop()); micStream.current = null; }
    if (assistantId.current) { chatStore.liveFinish(chatId, assistantId.current); assistantId.current = null; }
    disposeModels();                                             // frees the WebGPU worker
    client.current = null; engine.current = null; cam.current = null;
    // Keep `error` so the user sees why it ended; start() clears it next time.
    set({ active: false, phase: "off", downloading: false, downloadPct: 0, cameraOn: false, muted: false, pttEnabled: false, cameraStream: null, turns: [], userCaption: "", userPartial: false, agentCaption: "" });
  }, [chatId, set]);

  const start = useCallback(async () => {
    tornDown.current = false;
    set({ error: undefined, phase: "connecting", active: true, downloadPct: 0, turns: [], userCaption: "", userPartial: false, agentCaption: "" });
    try {
      // 1. Models (download-on-demand, cached). Shows a progress bar the first time.
      if (!modelsReady()) { set({ phase: "loading" }); await loadModels((p) => set({ downloadPct: p.pct, downloadLoaded: p.loaded, downloadTotal: p.total, downloadModels: p.models })); }
      if (tornDown.current) return;

      // 2. Mic stream — chosen device + browser AEC (so the agent's own voice is
      //    cancelled from the mic and can't self-trigger barge-in).
      const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      const micId = useLiveStore.getState().micId;
      if (micId) audio.deviceId = { exact: micId };
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      micStream.current = stream;
      if (tornDown.current) { stream.getTracks().forEach((t) => t.stop()); return; }

      // 3. Voice engine.
      const eng = new VoiceEngine({
        // Entering "listening" clears the previous answer's caption so the user
        // sees themselves (or "Listening…") the moment they start talking.
        onPhase: (p: EnginePhase) => set(p === "listening" ? { phase: p, agentCaption: "" } : { phase: p }),
        onPartial: (text) => set({ userCaption: text, userPartial: true }),
        onUserText: (text) => void handleUserText(text),
        onAgentText: (sentence) => { const st = useLiveStore.getState(); set({ agentCaption: (st.agentCaption + " " + sentence).trim() }); },
        // Barge-in: cancel the server turn AND drop the stale caption immediately,
        // so interrupting gives instant "I'm listening" feedback.
        onBargeIn: () => { client.current?.cancel(); set({ agentCaption: "", userCaption: "", userPartial: false }); },
      });
      engine.current = eng;
      await eng.start(stream);
      if (tornDown.current) return;

      // 4. Socket. Phase stays "connecting" until the socket actually opens — no
      //    more optimistic "Listening" that lies when the connection never lands.
      set({ phase: "connecting" });
      const c = new LiveClient({
        onOpen: () => set({ phase: "idle", error: undefined }),
        onReconnecting: () => set({ phase: "reconnecting" }),
        onClose: () => teardown(),
        onError: (m) => set({ error: m }),
        onSse: (e) => {
          if (e.type === "error") { set({ error: e.message }); return; }
          if (e.type === "text_delta") engine.current?.feedAgentDelta(e.text);
          if (e.type === "done") {
            engine.current?.endAgentTurn();
            if (assistantId.current) { chatStore.liveFinish(chatId, assistantId.current); assistantId.current = null; }
            return;
          }
          if (assistantId.current) chatStore.liveApply(chatId, assistantId.current, e);
        },
        onNeedFrame: async (reqId) => {
          const camera = cam.current;
          if (!camera || !useLiveStore.getState().cameraOn) { client.current?.frameResponse(reqId); return; }
          const jpeg = await camera.captureOne();
          client.current?.frameResponse(reqId);   // server arms for the look frame FIRST
          if (jpeg) client.current?.sendFrame(jpeg);
        },
      });
      client.current = c;
      c.connect(productSlug, chatId);

      onPageHide.current = () => teardown();
      window.addEventListener("pagehide", onPageHide.current);
      await refreshDevices();
    } catch (e: any) {
      const denied = e?.name === "NotAllowedError" || e?.name === "SecurityError";
      set({ error: denied ? "Microphone access denied. Allow the mic and try again." : `Couldn't start live mode: ${String(e?.message ?? e)}` });
      teardown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, productSlug, set, teardown]);

  // A completed user turn: attach the freshest camera frame, send the text, and
  // reflect the exchange in the chat store (so it renders + persists like typing).
  const handleUserText = useCallback(async (text: string) => {
    if (useLiveStore.getState().cameraOn && cam.current) {
      const jpeg = await cam.current.captureFreshest();
      if (jpeg) client.current?.sendFrame(jpeg);
    }
    client.current?.userText(text);
    const st = useLiveStore.getState();
    const turns = [...st.turns];
    if (st.agentCaption.trim()) turns.push({ role: "agent", text: st.agentCaption.trim() });
    turns.push({ role: "user", text });
    set({ turns: turns.slice(-40), userCaption: "", userPartial: false, agentCaption: "" });
    if (assistantId.current) chatStore.liveFinish(chatId, assistantId.current);
    assistantId.current = chatStore.liveUserTurn(chatId, productSlug, text);
  }, [chatId, productSlug, set]);

  // Explicit, user-initiated model download (pre-call). Nothing downloads until
  // the user asks — and because the worker stays warm, this only happens once.
  const download = useCallback(async () => {
    if (modelsReady()) { set({ modelsDownloaded: true }); return; }
    set({ downloading: true, downloadPct: 0, error: undefined });
    try {
      await loadModels((p) => set({ downloadPct: p.pct, downloadLoaded: p.loaded, downloadTotal: p.total, downloadModels: p.models }));
      set({ modelsDownloaded: true, downloading: false });
    } catch (e: any) {
      set({ downloading: false, error: `Couldn't download the AI models: ${String(e?.message ?? e)}` });
    }
  }, [set]);

  const refreshDevices = useCallback(async () => {
    set({ modelsDownloaded: modelsReady() }); // reflect warm/cached models in the UI
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      set({
        mics: devs.filter((d) => d.kind === "audioinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` })),
        cams: devs.filter((d) => d.kind === "videoinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })),
      });
    } catch { /* enumerate not available */ }
  }, [set]);

  const stop = useCallback(() => teardown(), [teardown]);

  const toggleMute = useCallback(() => {
    const next = !useLiveStore.getState().muted;
    engine.current?.setMuted(next);
    set({ muted: next });
  }, [set]);

  // Push-to-talk: setPtt(true) mutes until held; holdTalk toggles while held.
  const setPtt = useCallback((enabled: boolean) => {
    engine.current?.setMuted(enabled);
    set({ pttEnabled: enabled, muted: enabled });
  }, [set]);
  const holdTalk = useCallback((down: boolean) => {
    if (!useLiveStore.getState().pttEnabled) return;
    engine.current?.setMuted(!down);
    set({ muted: !down });
  }, [set]);

  // Change the mic — live if a call is active (rebuild the stream + VAD), else it
  // just applies on the next start.
  const setMic = useCallback(async (id: string) => {
    set({ micId: id });
    if (!useLiveStore.getState().active || !engine.current) return;
    try {
      const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, deviceId: { exact: id } };
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      const old = micStream.current;
      micStream.current = stream;
      await engine.current.setStream(stream);
      old?.getTracks().forEach((t) => t.stop()); // stop the previous mic only after the swap
    } catch { set({ error: "Couldn't switch microphone." }); }
  }, [set]);

  const setCam = useCallback(async (id: string) => {
    set({ camId: id });
    if (cam.current && useLiveStore.getState().cameraOn) {
      cam.current.stop();
      const c = new CameraCapture();
      cam.current = c;
      try { await c.start(id); set({ cameraStream: c.getStream() ?? null }); }
      catch { cam.current = null; set({ error: "Couldn't switch camera.", cameraStream: null }); }
    }
  }, [set]);

  const toggleCamera = useCallback(async () => {
    const on = !useLiveStore.getState().cameraOn;
    if (on) {
      const camera = new CameraCapture();
      cam.current = camera;
      try {
        await camera.start(useLiveStore.getState().camId);
        await refreshDevices();
      } catch {
        try { camera.stop(); } catch { /* */ }   // stop the stream BEFORE dropping the ref
        cam.current = null;
        set({ error: "Camera access denied." });
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
  }, [set, refreshDevices]);

  const getLevels = useCallback(() => ({ mic: engine.current?.micLevel() ?? 0, agent: engine.current?.agentLevel() ?? 0 }), []);
  const getSpeechProgress = useCallback(() => engine.current?.speechProgress() ?? 1, []);

  return { start, stop, download, toggleMute, setPtt, holdTalk, toggleCamera, getLevels, getSpeechProgress, refreshDevices, setMic, setCam };
}
