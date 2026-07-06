"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Figure } from "./parts";

// Lazy-loaded Mermaid. The library is only imported the first time a diagram
// mounts, so it never touches the initial bundle. Re-renders on theme flip.
export function Mermaid({ props }: { props: { code: string; caption?: string } }) {
  const { code, caption } = props;
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef(0);

  useEffect(() => {
    let alive = true;
    const gen = ++ref.current;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: resolvedTheme === "dark" ? "dark" : "default", securityLevel: "strict", fontFamily: "var(--font-sans)" });
        const { svg } = await mermaid.render(`m${id}${gen}`, code);
        if (alive && gen === ref.current) { setSvg(svg); setErr(""); }
      } catch (e) {
        if (alive) setErr((e as Error).message || "diagram failed to parse");
      }
    })();
    return () => { alive = false; };
  }, [code, resolvedTheme, id]);

  if (err) return <Figure caption={caption}><pre className="whitespace-pre-wrap text-[12px] text-muted-foreground">{code}</pre></Figure>;
  return <Figure caption={caption}><div className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} /></Figure>;
}
