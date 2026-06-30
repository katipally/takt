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
  sidebarWidth: number;
  canvasWidth: number;
  setSidebarWidth: (w: number) => void;
  setCanvasWidth: (w: number) => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
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
      sidebarWidth: 248,
      canvasWidth: 480,
      setSidebarWidth: (w) => set({ sidebarWidth: w }),
      setCanvasWidth: (w) => set({ canvasWidth: w }),
      voiceEnabled: false,
      setVoiceEnabled: (v) => set({ voiceEnabled: v }),
    }),
    { name: "prox-ui", partialize: (s) => ({ sidebarWidth: s.sidebarWidth, canvasWidth: s.canvasWidth, voiceEnabled: s.voiceEnabled, sidebarCollapsed: s.sidebarCollapsed }) },
  ),
);
