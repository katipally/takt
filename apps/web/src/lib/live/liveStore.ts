import { create } from "zustand";

export type LivePhase = "off" | "connecting" | "warming" | "idle" | "listening" | "thinking" | "speaking";

export interface DeviceOpt { id: string; label: string }

interface LiveState {
  active: boolean;
  phase: LivePhase;
  muted: boolean;
  cameraOn: boolean;
  cameraStream: MediaStream | null;
  userCaption: string;
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
  muted: false,
  cameraOn: false,
  cameraStream: null,
  userCaption: "",
  agentCaption: "",
  mics: [],
  cams: [],
  set: (p) => set(p),
}));
