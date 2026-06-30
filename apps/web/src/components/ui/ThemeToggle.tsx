"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "motion/react";
import { Sun, Moon, Monitor } from "lucide-react";
import { quick } from "@/lib/motion";
import { cn } from "@/lib/cn";

const ORDER = ["light", "dark", "system"] as const;
type Mode = (typeof ORDER)[number];
const ICON: Record<Mode, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };
const LABEL: Record<Mode, string> = { light: "Light", dark: "Dark", system: "System" };

// Single icon-cycle button: Light → Dark → System, with the glyph morphing.
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = (mounted && theme && ORDER.includes(theme as Mode) ? theme : "system") as Mode;
  const Icon = ICON[current];
  const cycle = () => setTheme(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!);

  return (
    <button
      onClick={cycle}
      aria-label={`Theme: ${LABEL[current]}. Click to change.`}
      title={`Theme: ${LABEL[current]}`}
      className={cn(
        "relative grid size-8 place-items-center overflow-hidden rounded-lg text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={current}
          initial={{ y: 9, opacity: 0, rotate: -35 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -9, opacity: 0, rotate: 35 }}
          transition={quick}
          className="grid place-items-center"
        >
          <Icon className="size-4" />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
