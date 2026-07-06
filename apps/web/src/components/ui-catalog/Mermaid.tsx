"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Figure } from "./parts";

// Repair the two mistakes LLMs make most in mermaid: parser-hostile characters
// inside `[label]` node text (parentheses, &, <, >, #) — quote the label so they
// survive — and a bare `&` in edge labels — swap for "and". Clean code is left
// untouched, so this only helps.
function sanitizeMermaid(code: string): string {
  const risky = /[()&<>#?,/]/;
  const quote = (open: string, close: string) => (m: string, inner: string) =>
    inner.trim().startsWith('"') || !risky.test(inner) ? m : `${open}"${inner.replace(/"/g, "'")}"${close}`;
  return code
    // strip inline page citations FIRST (before flattening) — any form: [p.14],
    // [p.17, p.57–60], [p.63]. Their commas/dashes and nested [] break the parser;
    // citations belong in the chat, not the diagram.
    .replace(/\[\s*p\.?\s*\d[^\]]*\]/gi, "")
    // then flatten compound node shapes the model over-uses ([[subroutine]],
    // ([stadium])) to a plain node — their nested brackets are the usual failure.
    .replace(/\[\[/g, "[").replace(/\]\]/g, "]").replace(/\(\[/g, "[").replace(/\]\)/g, "]")
    // quote [ ] and { } node labels that still hold parser-hostile characters
    .replace(/\[([^\]\n]+)\]/g, quote("[", "]"))
    .replace(/\{([^}\n]+)\}/g, quote("{", "}"))
    .replace(/\s&\s/g, " and ");
}

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
        // suppressErrorRendering stops mermaid from injecting an orphaned "Syntax
        // error" <svg> into the document body every time a render fails.
        mermaid.initialize({ startOnLoad: false, theme: resolvedTheme === "dark" ? "dark" : "default", securityLevel: "strict", fontFamily: "var(--font-sans)", suppressErrorRendering: true });
        // Validate before rendering (parse throws on bad syntax without touching
        // the DOM), so a failure never leaks an element; try sanitized then raw.
        const clean = sanitizeMermaid(code);
        const src = await mermaid.parse(clean, { suppressErrors: true }) ? clean
          : await mermaid.parse(code, { suppressErrors: true }) ? code : null;
        if (!src) throw new Error("invalid diagram");
        const out = (await mermaid.render(`m${id}${gen}`, src)).svg;
        if (alive && gen === ref.current) { setSvg(out); setErr(""); }
      } catch (e) {
        if (alive) setErr((e as Error).message || "diagram failed to parse");
      }
    })();
    return () => { alive = false; };
  }, [code, resolvedTheme, id]);

  if (err) return <Figure caption={caption}><pre className="whitespace-pre-wrap text-[12px] text-muted-foreground">{code}</pre></Figure>;
  return <Figure caption={caption}><div className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} /></Figure>;
}
