import { create } from "zustand";
import type { ModelProgress } from "./models";

export type LivePhase = "off" | "connecting" | "loading" | "reconnecting" | "idle" | "listening" | "thinking" | "speaking";

export interface DeviceOpt { id: string; label: string }
export interface LiveTurn { role: "user" | "agent"; text: string }

interface LiveState {
  active: boolean;
  phase: LivePhase;
  modelsDownloaded: boolean; // on-device models present (cached/warm) → skip download
  downloading: boolean;      // model download in progress on the pre-call screen
  downloadPct: number; // 0..1 model-download progress (phase === "loading")
  downloadLoaded: number; // bytes downloaded so far (across all models)
  downloadTotal: number;  // bytes total known so far
  downloadModels: ModelProgress[]; // per-model breakdown for the download UI
  muted: boolean;
  pttEnabled: boolean; // push-to-talk: mic only listens while held
  cameraOn: boolean;
  cameraStream: MediaStream | null;
  turns: LiveTurn[]; // running transcript (committed exchanges)
  userCaption: string;
  userPartial: boolean; // true while the user caption is still interim (greyed)
  agentCaption: string;
  agentCaptionMs: number; // playback duration of the current agent chunk — paces the word-by-word caption reveal
  error?: string;
  micId?: string;
  camId?: string;
  mics: DeviceOpt[];
  cams: DeviceOpt[];
  set: (p: Partial<LiveState>) => void;
}

// One live session at a time (single-user target). ponytail: global store, not
// keyed by chatId — add keying if multi-session live is ever needed.
export const useLiveStore = create<LiveState>((set) => ({
  active: false,
  phase: "off",
  modelsDownloaded: false,
  downloading: false,
  downloadPct: 0,
  downloadLoaded: 0,
  downloadTotal: 0,
  downloadModels: [],
  muted: false,
  pttEnabled: false,
  cameraOn: false,
  cameraStream: null,
  turns: [],
  userCaption: "",
  userPartial: false,
  agentCaption: "",
  agentCaptionMs: 0,
  mics: [],
  cams: [],
  set: (p) => set(p),
}));
