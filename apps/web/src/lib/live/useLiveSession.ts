"use client";

import { useCallback, useRef } from "react";
import { chatStore } from "@/lib/chatStore";
import { LiveClient } from "./liveClient";
import { CameraCapture } from "./cameraCapture";
import { AudioPlayer } from "./audioPlayback";
import { VoiceEngine, type EnginePhase } from "./voiceEngine";
import { loadModels, modelsReady, modelsCached } from "./models";
import { useLiveStore } from "./liveStore";

const NO_BANDS = [0, 0, 0, 0, 0];

function abToBase64(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

// Orchestrates one live call. THICK CLIENT: the VoiceEngine runs VAD+STT+TTS
// on-device; this hook wires it to the /live socket (final text + camera frames
// + cancel), the camera, and the chat store, and owns a single leak-proof
// teardown that every close path routes through. `productSlug` scopes the call
// to a product's knowledge graph (null = master, across all products).
export function useLiveSession(chatId: string, productSlug: string | null) {
  const set = useLiveStore((s) => s.set);
  const client = useRef<LiveClient | null>(null);
  const engine = useRef<VoiceEngine | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const camRef = useRef<CameraCapture | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const assistantId = useRef<string | null>(null);
  const tornDown = useRef(false);
  const onPageHide = useRef<() => void>(() => {});
  // Word-by-word transcript reveal, synced to the VOICE (not the generated stream):
  // `segText` = chunks of the CURRENT segment already voiced, `curChunk` = the one
  // revealing now, `revealRaf` = its frame. Tool activity is shown LIVE on
  // tool_start (see the onSse handler), not buffered.
  const segText = useRef("");
  const curChunk = useRef<string | null>(null);
  const revealRaf = useRef<number | null>(null);
  const stopReveal = () => { if (revealRaf.current != null) { cancelAnimationFrame(revealRaf.current); revealRaf.current = null; } };
  const resetTranscript = () => { stopReveal(); segText.current = ""; curChunk.current = null; };

  // ── single teardown authority — releases EVERYTHING, always ───────────────
  const teardown = useCallback(() => {
    if (tornDown.current) return;
    tornDown.current = true;
    stopReveal();
    window.removeEventListener("pagehide", onPageHide.current);
    try { client.current?.close(); } catch { /* */ }
    try { engine.current?.stop(); } catch { /* */ }              // destroys VAD + closes audio
    try { player.current?.close(); } catch { /* */ }             // free the audio ctx (also if start() failed before the engine)
    player.current = null;
    try { camRef.current?.stop(); } catch { /* */ }              // camera light off
    if (micStream.current) { micStream.current.getTracks().forEach((t) => t.stop()); micStream.current = null; }
    if (assistantId.current) { chatStore.liveFinish(chatId, assistantId.current); assistantId.current = null; }
    // The on-device voice worker is left running on purpose — kept warm for the
    // tab's lifetime so reopening Live is instant (no re-download / recompile).
    client.current = null; engine.current = null; camRef.current = null;
    // Keep `error` so the user sees why it ended; start() clears it next time.
    set({ active: false, phase: "off", downloading: false, downloadPct: 0, cameraOn: false, muted: false, cameraStream: null, userCaption: "", userPartial: false, agentCaption: "", toolStatus: "", warming: false, overlay: null });
  }, [chatId, set]);

  const start = useCallback(async () => {
    tornDown.current = false;
    set({ error: undefined, phase: "connecting", active: true, downloadPct: 0, userCaption: "", userPartial: false, agentCaption: "", toolStatus: "", overlay: null });
    // Unlock audio NOW, synchronously inside the click gesture. iOS Safari blocks
    // AudioContext playback that starts after an await, so priming here (before
    // the model download) is what lets the agent's voice actually play on iPhone.
    if (!player.current) player.current = new AudioPlayer();
    player.current.resume();
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
        onPhase: (p: EnginePhase) => set(p === "listening" ? { phase: p, agentCaption: "", toolStatus: "" } : { phase: p }),
        onPartial: (text) => set({ userCaption: text, userPartial: true, warming: false }),
        onUserText: (text) => void handleUserText(text),
        // A chunk just STARTED voicing. Drive TWO things from it: the in-call
        // subtitle (rolling window — InCall reads agentCaption) AND the chat
        // transcript, which types this chunk word-by-word in lockstep with the
        // audio so the panel shows exactly what's been said (honest on barge-in).
        onAgentText: (sentence, durationMs) => {
          set({ agentCaption: sentence, agentCaptionMs: durationMs });
          const id = assistantId.current;
          // The previous chunk's audio has finished (this one is now playing) —
          // commit it into the current segment.
          if (curChunk.current) segText.current = segText.current ? `${segText.current} ${curChunk.current}` : curChunk.current;
          curChunk.current = sentence;
          stopReveal();
          if (!id) return;
          const words = sentence.split(/\s+/).filter(Boolean);
          const base = segText.current;
          const dur = durationMs > 0 ? durationMs : words.length * 320;
          const startedAt = performance.now();
          const step = () => {
            if (id !== assistantId.current) return; // turn moved on
            const frac = Math.min(1, (performance.now() - startedAt) / dur);
            const idx = Math.max(1, Math.min(words.length, Math.ceil(frac * words.length)));
            const revealed = words.slice(0, idx).join(" ");
            chatStore.liveText(chatId, id, base ? `${base} ${revealed}` : revealed);
            if (frac < 1) revealRaf.current = requestAnimationFrame(step);
            else revealRaf.current = null;
          };
          step();
        },
        // Barge-in: cancel the server turn AND drop the stale caption immediately,
        // so interrupting gives instant "I'm listening" feedback.
        onBargeIn: (spoken) => {
          client.current?.cancel(spoken);
          stopReveal();
          set({ toolStatus: "" });
          // Keep what's already revealed (voice-synced ≈ what was spoken); just
          // stop advancing. Commit the current chunk so the next turn starts clean.
          if (curChunk.current) segText.current = segText.current ? `${segText.current} ${curChunk.current}` : curChunk.current;
          curChunk.current = null;
          set({ agentCaption: "", userCaption: "", userPartial: false });
        },
      }, player.current ?? undefined);
      engine.current = eng;
      await eng.start(stream);
      if (tornDown.current) return;

      // 4. Socket. Phase stays "connecting" until the socket actually opens — no
      //    optimistic "Listening" that lies when the connection never lands.
      set({ phase: "connecting" });
      const c = new LiveClient({
        onOpen: () => set({ phase: "idle", error: undefined, warming: true }),
        onReconnecting: () => set({ phase: "reconnecting" }),
        onClose: () => teardown(),
        onError: (m) => set({ error: m }),
        onSse: (e) => {
          if (e.type === "error") { set({ error: e.message }); return; }
          // Warm-up done → drop the "Warming up…" spinner; the first turn is hot.
          if (e.type === "status") { if (e.text === "ready") set({ warming: false }); return; }
          // Prose text drives the VOICE only; the chat transcript is filled
          // word-by-word as each chunk is spoken (onAgentText), NOT from the
          // generated stream (which races ahead) — so an interrupt leaves the
          // panel showing only what was said.
          if (e.type === "text_delta") { engine.current?.feedAgentDelta(e.text); return; }
          // Reasoning streams into the transcript's work block.
          if (e.type === "reasoning_delta") { if (assistantId.current) chatStore.liveReason(chatId, assistantId.current, e.text); return; }
          // The remote-expert overlay: pin/replace/clear the visual over the live
          // view. Ephemeral — lives in the live store, not the transcript.
          if (e.type === "live_overlay") {
            // Carry the WHOLE event payload (marks included) — cherry-picking
            // fields here is how the marks array once got silently dropped.
            const { type: _t, kind, ...rest } = e;
            set({ overlay: kind === "clear" ? null : { ...rest, kind } });
            return;
          }
          if (e.type === "done") {
            set({ toolStatus: "" });
            engine.current?.endAgentTurn();
            // Finish the spoken turn but KEEP assistantId pointing at it, so any
            // trailing event still attaches. It rolls forward on the next user
            // turn (handleUserText) and is finalized on teardown.
            if (assistantId.current) chatStore.liveFinish(chatId, assistantId.current);
            return;
          }
          // Show tool activity LIVE — the moment it starts — so the user gets a
          // real cue (transcript chip + status subtitle) WHILE it runs.
          if (e.type === "tool_start") {
            set({ toolStatus: e.tool });
            if (assistantId.current) chatStore.liveEvent(chatId, assistantId.current, e);
            return;
          }
          if (e.type === "tool_done") {
            set({ toolStatus: "" });
            if (assistantId.current) chatStore.liveEvent(chatId, assistantId.current, e);
            return;
          }
          // Structural events — a canvas building on the stage mid-call, cited
          // sources, todos, usage — reduce through the SAME reducer as typed
          // chat, so a spoken "walk me through it" lands a real page + sources.
          if (e.type === "canvas_start" || e.type === "canvas_delta" || e.type === "canvas_end" || e.type === "canvas_error" || e.type === "source" || e.type === "todos" || e.type === "usage") {
            if (assistantId.current) chatStore.liveEvent(chatId, assistantId.current, e);
            return;
          }
        },
        onNeedFrame: async (reqId) => {
          const src = useLiveStore.getState().cameraOn ? camRef.current : null;
          if (!src) { client.current?.frameResponse(reqId); return; }
          const jpeg = await src.captureHiRes();
          client.current?.frameResponse(reqId);   // server arms for the look frame FIRST
          if (jpeg) client.current?.sendFrame(jpeg);
        },
      });
      client.current = c;
      c.connect(chatId, productSlug);

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
    const frames: { data: string; mime: string }[] = [];
    if (useLiveStore.getState().cameraOn && camRef.current) {
      const j = await camRef.current.captureFreshest();
      if (j) frames.push({ data: abToBase64(j), mime: "image/jpeg" });
    }
    client.current?.userText(text, frames);
    set({ userCaption: "", userPartial: false, agentCaption: "" });
    if (assistantId.current) chatStore.liveFinish(chatId, assistantId.current);
    resetTranscript(); // new turn → the word reveal starts fresh
    assistantId.current = chatStore.liveUserTurn(chatId, text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, set]);

  // Explicit, user-initiated model download (pre-call). Nothing downloads until
  // the user asks — and because the worker stays warm, this only happens once.
  const download = useCallback(async () => {
    if (modelsReady()) { set({ modelsDownloaded: true }); return; }
    set({ downloading: true, downloadPct: 0, error: undefined });
    try {
      await loadModels((p) => set({ downloadPct: p.pct, downloadLoaded: p.loaded, downloadTotal: p.total, downloadModels: p.models }));
      set({ modelsDownloaded: true, downloading: false });
    } catch (e: any) {
      set({ downloading: false, error: `Couldn't download the voice models: ${String(e?.message ?? e)}` });
    }
  }, [set]);

  const refreshDevices = useCallback(async () => {
    // Cached (from a prior session's Cache-API weights) counts as "downloaded" so
    // the pre-call screen never re-asks after a refresh. If cached but the worker
    // isn't warm in THIS page, silently pre-load it in the background so hitting
    // start is instant — no visible progress bar (it reads from cache, fast).
    const cached = modelsCached();
    set({ modelsDownloaded: cached || modelsReady() });
    if (cached && !modelsReady()) void loadModels(() => {}).catch(() => {});
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
    if (camRef.current && useLiveStore.getState().cameraOn) {
      camRef.current.stop();
      const c = new CameraCapture();
      camRef.current = c;
      try { await c.start(id); set({ cameraStream: c.getStream() ?? null }); }
      catch { camRef.current = null; set({ error: "Couldn't switch camera.", cameraStream: null }); }
    }
  }, [set]);

  const toggleCamera = useCallback(async () => {
    const on = !useLiveStore.getState().cameraOn;
    if (on) {
      const camera = new CameraCapture();
      camRef.current = camera;
      try {
        await camera.start(useLiveStore.getState().camId);
        await refreshDevices();
      } catch {
        try { camera.stop(); } catch { /* */ }
        camRef.current = null;
        set({ error: "Camera access denied." });
        return;
      }
      client.current?.control("camera_on");
      set({ cameraOn: true, cameraStream: camera.getStream() ?? null });
    } else {
      client.current?.control("camera_off");
      camRef.current?.stop();
      camRef.current = null;
      set({ cameraOn: false, cameraStream: null });
    }
  }, [set, refreshDevices]);

  const getLevels = useCallback(() => ({ mic: engine.current?.micLevel() ?? 0, agent: engine.current?.agentLevel() ?? 0 }), []);
  // Per-frequency-band energy (0..1) of the live voice — drives the orb's real
  // reactive spectrum while you or the agent talk.
  const getBands = useCallback(() => ({ mic: engine.current?.micBands() ?? NO_BANDS, agent: engine.current?.agentBands() ?? NO_BANDS }), []);

  return { start, stop, download, toggleMute, toggleCamera, getLevels, getBands, refreshDevices, setMic, setCam };
}
