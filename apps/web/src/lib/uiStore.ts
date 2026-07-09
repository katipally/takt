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
  railWidth: number; // width of the right chat rail (user-resizable)
  setSidebarWidth: (w: number) => void;
  setRailWidth: (w: number) => void;
  // Agent-driven canvas highlight (select_canvas → canvas_highlight): the
  // data-takt-id to ring, with a nonce so re-highlighting the same block still
  // fires. The Canvas listens and rings + scrolls it. Transient — not persisted.
  canvasHighlight: { id: string; nonce: number };
  highlightCanvas: (id: string) => void;
  liveOpen: boolean;
  setLiveOpen: (v: boolean) => void;
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
      railWidth: 340,
      setSidebarWidth: (w) => set({ sidebarWidth: w }),
      setRailWidth: (w) => set({ railWidth: w }),
      canvasHighlight: { id: "", nonce: 0 },
      highlightCanvas: (id) => set((s) => ({ canvasHighlight: { id, nonce: s.canvasHighlight.nonce + 1 } })),
      liveOpen: false,
      setLiveOpen: (v) => set({ liveOpen: v }),
    }),
    { name: "takt-ui", partialize: (s) => ({ sidebarWidth: s.sidebarWidth, railWidth: s.railWidth, sidebarCollapsed: s.sidebarCollapsed, railOpen: s.railOpen }) },
  ),
);
