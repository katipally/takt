import { create } from "zustand";

export type LivePhase = "off" | "connecting" | "loading" | "reconnecting" | "idle" | "listening" | "thinking" | "speaking";

export interface DeviceOpt { id: string; label: string }
export interface LiveTurn { role: "user" | "agent"; text: string }

interface LiveState {
  active: boolean;
  phase: LivePhase;
  downloadPct: number; // 0..1 model-download progress (phase === "loading")
  muted: boolean;
  pttEnabled: boolean; // push-to-talk: mic only listens while held
  cameraOn: boolean;
  cameraStream: MediaStream | null;
  turns: LiveTurn[]; // running transcript (committed exchanges)
  userCaption: string;
  userPartial: boolean; // true while the user caption is still interim (greyed)
  agentCaption: string;
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
  downloadPct: 0,
  muted: false,
  pttEnabled: false,
  cameraOn: false,
  cameraStream: null,
  turns: [],
  userCaption: "",
  userPartial: false,
  agentCaption: "",
  mics: [],
  cams: [],
  set: (p) => set(p),
}));
