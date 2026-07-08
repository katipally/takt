import { create } from "zustand";
import { persist } from "zustand/middleware";

// App-wide UI state, persisted to localStorage so panel sizes, the voice
// preference, and the last product survive navigation and reloads.
interface UiState {
  settingsOpen: boolean;
  settingsTab: "models" | "products";
  openSettings: (tab?: "models" | "products") => void;
  closeSettings: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  railOpen: boolean;
  toggleRail: () => void;
  sidebarWidth: number;
  canvasWidth: number;
  railWidth: number; // width of the right chat rail (user-resizable)
  setSidebarWidth: (w: number) => void;
  setCanvasWidth: (w: number) => void;
  setRailWidth: (w: number) => void;
  // Agent-driven canvas highlight (select_canvas): the id to ring, with a nonce so
  // re-highlighting the same block still fires. Transient — not persisted.
  canvasHighlight: { id: string; nonce: number };
  highlightCanvas: (id: string) => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
  liveOpen: boolean;
  setLiveOpen: (v: boolean) => void;
  toggleLive: () => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      settingsOpen: false,
      settingsTab: "models",
      openSettings: (tab = "models") => set({ settingsOpen: true, settingsTab: tab }),
      closeSettings: () => set({ settingsOpen: false }),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      railOpen: true, // the chat panel — open by default (canvas holds the artifact)
      toggleRail: () => set((s) => ({ railOpen: !s.railOpen })),
      sidebarWidth: 248,
      canvasWidth: 480,
      railWidth: 340,
      setSidebarWidth: (w) => set({ sidebarWidth: w }),
      setCanvasWidth: (w) => set({ canvasWidth: w }),
      setRailWidth: (w) => set({ railWidth: w }),
      canvasHighlight: { id: "", nonce: 0 },
      highlightCanvas: (id) => set((s) => ({ canvasHighlight: { id, nonce: s.canvasHighlight.nonce + 1 } })),
      voiceEnabled: false,
      setVoiceEnabled: (v) => set({ voiceEnabled: v }),
      liveOpen: false,
      setLiveOpen: (v) => set({ liveOpen: v }),
      toggleLive: () => set((s) => ({ liveOpen: !s.liveOpen })),
    }),
    { name: "takt-ui", partialize: (s) => ({ sidebarWidth: s.sidebarWidth, canvasWidth: s.canvasWidth, railWidth: s.railWidth, voiceEnabled: s.voiceEnabled, sidebarCollapsed: s.sidebarCollapsed, railOpen: s.railOpen }) },
  ),
);
