import { cn } from "@/lib/cn";

// PROX — uppercase, wide-tracked, light weight. A spec-sheet feel that fits the
// manuals domain. Purely presentational; callers wrap it in a Link when needed.
const SIZE = {
  sm: "text-[12px] tracking-[0.2em]",
  md: "text-[14px] tracking-[0.18em]",
  lg: "text-[19px] tracking-[0.16em]",
};

export function Wordmark({ size = "md", className }: { size?: keyof typeof SIZE; className?: string }) {
  return (
    <span className={cn("select-none font-light uppercase leading-none text-foreground", SIZE[size], className)}>
      Prox
    </span>
  );
}
