"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { useLiveStore } from "@/lib/live/liveStore";
import { useUi } from "@/lib/uiStore";

// Dev-only: expose the stores so live-mode UI states (overlays, phases) can be
// driven from the console / automated checks without a mic or model download.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as any).__takt = { live: useLiveStore, ui: useUi };
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } } }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        {children}
        <SettingsModal />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
