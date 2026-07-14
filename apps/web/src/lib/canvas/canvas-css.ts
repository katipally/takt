// The canvas design system, as a string injected into the SANDBOXED IFRAME that
// renders every canvas. It used to live in globals.css because the canvas rendered
// directly in the app document; now the canvas is isolated in an iframe (which has
// NO access to globals.css), so the tokens + classes must travel with the document.
// The source of truth for what the CANVAS renders as. globals.css keeps only a
// small subset of .takt-* rules for the app-side loading skeleton (Stage/Canvas
// render it OUTSIDE the frame); the live canvas reads THIS, not globals.
//
// ponytail: kept as a template string rather than a bundled .css asset so there's
// no build entry for the frame. If this grows, move to a real stylesheet served on
// an allowlisted path and <link> it from the frame document.

export const CANVAS_CSS = String.raw`
/* reset — the frame is its own document */
*{box-sizing:border-box}
/* overflow hidden: the frame is auto-heighted by the runtime, so its document must
   never scroll itself (a momentary height lag would eat the user's wheel gesture —
   the runtime forwards wheel deltas to the parent instead). color-scheme makes
   NATIVE controls (select popup, range, checkbox, scrollbars) follow the theme. */
html,body{margin:0;padding:0;overflow:hidden}
html{color-scheme:light}
html.dark{color-scheme:dark}
body{background:var(--takt-bg);color:var(--takt-fg);font-family:var(--takt-sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{max-width:100%}

:root{
  --takt-bg:#fbfaf7; --takt-fg:#1a1a18; --takt-muted:#6a6a66; --takt-faint:#9a9a95;
  --takt-border:rgba(0,0,0,.10); --takt-border-strong:rgba(0,0,0,.16);
  --takt-card:#fff; --takt-surface:#f3f1ec; --takt-surface-2:#ece9e2;
  --takt-accent:#2f6fed; --takt-arc:#c2521a; --takt-ok:#2f8f5b; --takt-warn:#b5761b; --takt-danger:#c53b34;
  --takt-radius:14px; --takt-radius-sm:9px;
  --takt-serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif;
  --takt-sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --takt-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --takt-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px -12px rgba(0,0,0,.18);
  --takt-maxcol:66ch;
  /* chart palette — pre-validated (OKLCH band, chroma, Machado-2009 CVD ΔE 24.2,
     contrast vs #fff card) with the dataviz validator. Series N ALWAYS gets cat-N,
     in order, never cycled; models never pick chart hexes. */
  --takt-cat-1:#2a78d6; --takt-cat-2:#1baf7a; --takt-cat-3:#eda100; --takt-cat-4:#008300;
  --takt-cat-5:#4a3aa7; --takt-cat-6:#e34948; --takt-cat-7:#e87ba4; --takt-cat-8:#eb6834;
  --takt-seq-1:#86b6ef; --takt-seq-2:#5598e7; --takt-seq-3:#2a78d6; --takt-seq-4:#1c5cab; --takt-seq-5:#104281;
}
.dark{
  --takt-bg:#131315; --takt-fg:#f2f1ee; --takt-muted:#a6a6a1; --takt-faint:#76766f;
  --takt-border:rgba(255,255,255,.10); --takt-border-strong:rgba(255,255,255,.18);
  --takt-card:#1b1b1e; --takt-surface:#202024; --takt-surface-2:#26262b;
  --takt-accent:#6ba2ff; --takt-arc:#ff8a4c; --takt-ok:#57c98a; --takt-warn:#e0a34a; --takt-danger:#f2645c;
  --takt-shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px -14px rgba(0,0,0,.6);
  /* dark chart palette — validated against the #1b1b1e card (CVD ΔE 10.3 floor
     band → direct labels stay mandatory). Sequential reversed so high = bright. */
  --takt-cat-1:#3987e5; --takt-cat-2:#199e70; --takt-cat-3:#c98500; --takt-cat-4:#008300;
  --takt-cat-5:#9085e9; --takt-cat-6:#e66767; --takt-cat-7:#d55181; --takt-cat-8:#d95926;
  --takt-seq-1:#184f95; --takt-seq-2:#1c5cab; --takt-seq-3:#3987e5; --takt-seq-4:#6da7ec; --takt-seq-5:#9ec5f4;
}

.takt-page{
  container-type:inline-size;
  display:grid;
  grid-template-columns:
    [full-start] minmax(0,1fr)
    [wide-start] minmax(0,80px)
    [content-start] min(68ch,100%) [content-end]
    minmax(0,80px) [wide-end]
    minmax(0,1fr) [full-end];
  padding-inline:clamp(18px,4cqi,64px);
  padding-block:clamp(28px,5cqi,56px);
  max-width:1180px;margin:0 auto;overflow-x:clip;
  color:var(--takt-fg);font-family:var(--takt-sans);font-size:17px;line-height:1.62;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
}
.takt-page *{box-sizing:border-box;max-width:100%}
.takt-page > *{grid-column:content;min-width:0}
.takt-page > :is(.takt-grid,.takt-split,.takt-cols-2,.takt-cols-3,.takt-cols-4,table,.takt-wide,figure.takt-figure,pre){grid-column:wide}
.takt-page > :is(.takt-full,figure.takt-figure[data-variant=lead],.takt-hero){grid-column:full}
.takt-page > figure.takt-figure[data-variant=inset]{grid-column:content}
.takt-page img,.takt-page video,.takt-page model-viewer{max-width:100%;height:auto}
.takt-page img{display:block}
:is(.takt-grid,.takt-split,.takt-cols-2,.takt-cols-3,.takt-cols-4) > *{min-width:0}
.takt-page pre{overflow-x:auto}
.takt-page > * + *{margin-top:clamp(20px,2.6cqi,40px)}
.takt-card > * + *,.takt-panel > * + *,.takt-callout > * + *{margin-top:.7em}
.takt-page > :is(h1,h2,h3){margin-top:0}
:is(.takt-grid,.takt-split,.takt-cols-2,.takt-cols-3,.takt-cols-4){align-items:stretch}

/* Type hierarchy */
.takt-page h1,.takt-display{font-family:var(--takt-serif);font-weight:500;line-height:1.02;letter-spacing:-.022em;
  font-size:clamp(2.3rem,6.4cqi,4.2rem);margin:0 0 .3em;max-width:20ch;text-wrap:balance}
.takt-page h2{font-family:var(--takt-serif);font-weight:520;line-height:1.14;font-size:clamp(1.55rem,3.4cqi,2.5rem);margin:1.1em 0 .45em;letter-spacing:-.016em;text-wrap:balance}
.takt-page h3{font-family:var(--takt-sans);font-weight:650;font-size:1.12rem;margin:1.3em 0 .35em;letter-spacing:.005em}
.takt-page p,.takt-page li{max-width:var(--takt-maxcol)}
.takt-page p{margin:0 0 1em}
.takt-page a{color:var(--takt-accent);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--takt-accent) 35%,transparent)}
.takt-page strong{font-weight:650}
.takt-page code{font-family:var(--takt-mono);font-size:.88em;background:var(--takt-surface);padding:.12em .38em;border-radius:5px}
.takt-page hr{border:0;border-top:1px solid var(--takt-border);margin:2em 0}
.takt-eyebrow{font-family:var(--takt-sans);text-transform:uppercase;letter-spacing:.14em;font-size:.72rem;font-weight:650;color:var(--takt-arc);margin:0 0 .6em}
.takt-lead{font-size:clamp(1.12rem,1.7cqi,1.34rem);line-height:1.5;color:var(--takt-muted);max-width:62ch}
.takt-chips{display:flex;flex-wrap:wrap;gap:.4rem;margin:.2em 0 0}
.takt-chip{display:inline-flex;align-items:center;font-family:var(--takt-sans);font-size:.72rem;font-weight:600;letter-spacing:.02em;
  text-transform:uppercase;color:var(--takt-muted);background:var(--takt-surface);border:1px solid var(--takt-border);border-radius:999px;padding:.28em .7em;line-height:1}
.takt-page blockquote,.takt-quote{font-family:var(--takt-serif);font-size:1.3rem;line-height:1.35;border-left:3px solid var(--takt-arc);
  margin:1.4em 0;padding:.1em 0 .1em 1em;color:var(--takt-fg)}

/* Layout primitives — .takt-split/.takt-cols-* are grids on their OWN, so a model
   that forgets the accompanying .takt-grid class still gets the layout. */
:is(.takt-grid,.takt-split,.takt-cols-2,.takt-cols-3,.takt-cols-4){display:grid;gap:clamp(16px,2.4cqi,32px)}
@container (min-width:560px){ .takt-cols-2,.takt-cols-3,.takt-cols-4{grid-template-columns:repeat(2,1fr)} }
@container (min-width:820px){ .takt-cols-3{grid-template-columns:repeat(3,1fr)} .takt-cols-4{grid-template-columns:repeat(4,1fr)} .takt-split{grid-template-columns:1.35fr 1fr} }
.takt-card{background:var(--takt-card);border:1px solid var(--takt-border);border-radius:var(--takt-radius);padding:clamp(20px,2.4cqi,30px)}
.takt-panel{background:var(--takt-surface);border:1px solid var(--takt-border);border-radius:var(--takt-radius);padding:clamp(20px,2.4cqi,30px)}

/* Interactive controls — native elements, tokenized, so any model's picker/
   calculator/slider looks designed without writing its own control CSS. */
.takt-controls{display:flex;flex-wrap:wrap;gap:1em 1.6em;align-items:flex-end;margin:1em 0}
.takt-field{display:flex;flex-direction:column;gap:.4em;min-width:150px;flex:1 1 150px;max-width:320px}
.takt-field>span,.takt-field>label{font-family:var(--takt-sans);font-size:.72rem;font-weight:650;text-transform:uppercase;letter-spacing:.08em;color:var(--takt-muted)}
.takt-page :is(select,input[type=text],input[type=number],input[type=search],textarea){
  font:inherit;font-size:.95rem;color:var(--takt-fg);background:var(--takt-card);
  border:1px solid var(--takt-border-strong);border-radius:var(--takt-radius-sm);padding:.5em .75em;min-height:2.5em}
.takt-page button{font:inherit;font-size:.9rem;font-weight:600;font-family:var(--takt-sans);cursor:pointer;
  color:var(--takt-fg);background:var(--takt-surface);border:1px solid var(--takt-border-strong);
  border-radius:var(--takt-radius-sm);padding:.5em 1em;min-height:2.5em;transition:background .12s}
.takt-page button:hover{background:var(--takt-surface-2)}
.takt-page button[data-variant=primary],.takt-page button.takt-action{color:#fff;background:var(--takt-accent);border-color:var(--takt-accent)}
.takt-page button[data-variant=primary]:hover,.takt-page button.takt-action:hover{background:color-mix(in srgb,var(--takt-accent) 86%,#000)}
.takt-page button[aria-pressed=true]{color:var(--takt-accent);background:color-mix(in srgb,var(--takt-accent) 12%,var(--takt-card));border-color:var(--takt-accent)}
.takt-page :is(input[type=range],input[type=checkbox],input[type=radio],progress){accent-color:var(--takt-accent)}
.takt-page input[type=range]{width:100%;min-height:2.5em}
.takt-page output{font-variant-numeric:tabular-nums;font-weight:650}
.takt-page :is(button,select,input,textarea,[tabindex]):focus-visible{outline:2px solid var(--takt-accent);outline-offset:2px}

/* HERO */
.takt-page > :is(.takt-grid,.takt-split)[data-takt-id="hero"],.takt-page > .takt-hero{align-items:center}
:is(.takt-grid,.takt-split)[data-takt-id="hero"] .takt-model-view{height:clamp(260px,32cqi,400px)}
:is(.takt-grid,.takt-split)[data-takt-id="hero"] figure.takt-figure img{max-height:min(46vh,400px)}

/* Info blocks */
.takt-callout{border:1px solid var(--takt-border);border-left-width:3px;border-radius:var(--takt-radius-sm);
  padding:.85em 1.1em;margin:1.2em 0;background:var(--takt-surface)}
.takt-callout[data-tone=warn]{border-left-color:var(--takt-warn);background:color-mix(in srgb,var(--takt-warn) 8%,var(--takt-card))}
.takt-callout[data-tone=danger]{border-left-color:var(--takt-danger);background:color-mix(in srgb,var(--takt-danger) 8%,var(--takt-card))}
.takt-callout[data-tone=ok]{border-left-color:var(--takt-ok);background:color-mix(in srgb,var(--takt-ok) 8%,var(--takt-card))}
.takt-callout[data-tone=tip]{border-left-color:var(--takt-accent);background:color-mix(in srgb,var(--takt-accent) 8%,var(--takt-card))}
.takt-stat{display:flex;flex-direction:column;gap:.22em}
.takt-stat .n{font-family:var(--takt-serif);font-size:clamp(1.9rem,4.2cqi,3rem);line-height:1;font-weight:500;letter-spacing:-.02em}
.takt-stat .l{font-size:.74rem;text-transform:uppercase;letter-spacing:.09em;color:var(--takt-muted)}
.takt-page table{border-collapse:collapse;width:100%;font-size:.94rem;margin:1.2em 0;table-layout:fixed}
.takt-page th,.takt-page td{text-align:left;padding:.55em .7em;border-bottom:1px solid var(--takt-border);overflow-wrap:anywhere;vertical-align:top}
.takt-page th{font-size:.76rem;text-transform:uppercase;letter-spacing:.06em;color:var(--takt-muted)}

/* Islands */
takt-cite{cursor:pointer}
.takt-cite{display:inline-flex;align-items:center;gap:.2em;vertical-align:baseline;font-family:var(--takt-sans);
  font-size:.72em;font-weight:600;color:var(--takt-accent);background:color-mix(in srgb,var(--takt-accent) 12%,transparent);
  border-radius:5px;padding:.05em .38em;margin:0 .12em;line-height:1.4;white-space:nowrap;user-select:none}
.takt-cite:hover{background:color-mix(in srgb,var(--takt-accent) 22%,transparent)}
/* Figures: theme-adaptive surface (NOT a hardcoded beige box), and a clean crop by
   default (object-fit:cover fills the frame — no dead letterbox gutters), with a
   contain variant for diagrams/screenshots where the whole image must show. */
figure.takt-figure{margin:0;display:block;background:var(--takt-surface);border:1px solid var(--takt-border);border-radius:var(--takt-radius);padding:0;overflow:hidden}
/* Default = CONTAIN the WHOLE image (a manual figure/screenshot is content — cropping
   cuts the text/callouts that matter). Height follows the image (no forced ratio → no
   dead letterbox), capped so a tall crop can't swallow the page. cover (data-variant)
   is an opt-in for a decorative/photo hero where filling the frame is the point. */
figure.takt-figure img{width:100%;height:auto;display:block;cursor:zoom-in;max-height:min(58vh,540px);object-fit:contain;object-position:center;background:var(--takt-surface-2)}
figure.takt-figure[data-variant=lead] img{max-height:min(64vh,600px)}
figure.takt-figure[data-variant=cover] img,figure.takt-figure[data-fit=cover] img{aspect-ratio:16/9;height:auto;object-fit:cover}
figure.takt-figure figcaption,.takt-mediacap{font-family:var(--takt-sans);font-size:.76rem;line-height:1.45;color:var(--takt-muted);
  padding:.6em .85em .7em}
figure.takt-figure figcaption .fignum{color:var(--takt-accent);font-weight:650;letter-spacing:.01em}
figure.takt-figure[data-variant=inset]{float:right;width:min(42cqi,340px);margin:.2em 0 1em 1.6em}
@container (max-width:560px){ figure.takt-figure[data-variant=inset]{float:none;width:100%;margin:1.2em 0} }

/* annotation overlay */
.takt-figwrap{position:relative;display:block;line-height:0}
svg.takt-anno{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.takt-anno-label{position:absolute;transform:translate(-50%,-128%);background:var(--takt-arc);color:#fff;font-family:var(--takt-sans);
  font-size:.64rem;font-weight:650;line-height:1.22;padding:.14em .44em;border-radius:6px;max-width:34cqi;text-align:center;cursor:grab;user-select:none;
  touch-action:none;box-shadow:0 1px 6px rgba(0,0,0,.35);z-index:2}
.takt-anno-label::after{content:"";position:absolute;left:50%;top:100%;transform:translateX(-50%);border:5px solid transparent;border-top-color:var(--takt-arc)}

/* Legend */
.takt-legend{list-style:none;margin:.8em 0 0;padding:0;display:grid;gap:.35em;font-size:.94rem;line-height:1.45}
.takt-legend li{display:grid;grid-template-columns:auto 1fr;gap:.6em;align-items:start;border-radius:8px;padding:.2em .35em;transition:background .12s}
.takt-legend li:hover{background:var(--takt-surface)}
.takt-legend .num{display:grid;place-items:center;width:1.55em;height:1.55em;border-radius:50%;border:1.5px solid var(--takt-arc);
  color:var(--takt-arc);font-family:var(--takt-sans);font-weight:700;font-size:.78rem;line-height:1;margin-top:.05em}
.takt-legend .d{color:var(--takt-muted)}

video.takt-video{width:100%;display:block;border-radius:var(--takt-radius-sm);background:#000}
.takt-mermaid{display:block;margin:.4em 0;text-align:center}
.takt-mermaid svg{max-width:100%;height:auto;margin-inline:auto}

.takt-model-view{position:relative;overflow:hidden;border:1px solid var(--takt-border);border-radius:var(--takt-radius-sm);background:var(--takt-surface);height:clamp(240px,34cqi,380px)}
.takt-model-view model-viewer{display:block;width:100%;height:100%}
.takt-model-status{display:grid;place-items:center;min-height:172px;font-family:var(--takt-sans);font-size:.85rem;color:var(--takt-muted)}
.takt-model-hint{position:absolute;bottom:.55em;left:50%;transform:translateX(-50%);pointer-events:none;
  background:rgba(0,0,0,.45);color:rgba(255,255,255,.85);font-family:var(--takt-sans);font-size:.72rem;
  padding:.2em .7em;border-radius:999px}

button.takt-action{cursor:pointer;font-family:var(--takt-sans);font-weight:600;font-size:.92rem;color:#fff;background:var(--takt-accent);
  border:0;border-radius:var(--takt-radius-sm);padding:.6em 1.1em;margin:.3em .4em .3em 0;transition:filter .15s}
button.takt-action:hover{filter:brightness(1.08)}
button.takt-action[data-variant=secondary]{color:var(--takt-fg);background:var(--takt-surface-2);border:1px solid var(--takt-border)}
takt-figure,takt-video,takt-model{display:block}
.takt-page svg{max-width:100%;height:auto;color:var(--takt-fg)}
.takt-page svg text{fill:var(--takt-muted);font-family:var(--takt-sans);font-size:12px}
.takt-page svg .axis,.takt-page svg line.axis{stroke:var(--takt-border)}
.takt-err{white-space:pre-wrap;color:var(--takt-danger);font-family:var(--takt-mono);font-size:12px;padding:14px}

/* Selectable blocks */
.takt-page > [data-takt-id]{border-radius:9px;transition:outline-color .12s}
.takt-selected{outline:2px solid var(--takt-accent) !important;outline-offset:6px}
.takt-preselect{outline:1.5px dashed color-mix(in srgb,var(--takt-accent) 55%,transparent) !important;outline-offset:6px}
.takt-ctxmenu{position:fixed;z-index:9999;min-width:168px;background:var(--takt-card);border:1px solid var(--takt-border-strong);
  border-radius:10px;box-shadow:var(--takt-shadow);padding:4px;font-family:var(--takt-sans)}
.takt-ctxitem{display:flex;align-items:center;gap:.5em;width:100%;text-align:left;background:none;border:0;cursor:pointer;
  font-size:.84rem;color:var(--takt-fg);padding:.5em .6em;border-radius:7px;line-height:1.2}
.takt-ctxitem:hover{background:var(--takt-surface)}
.takt-ctxitem .dot{width:.5em;height:.5em;border-radius:50%;background:var(--takt-accent);flex:0 0 auto}

/* Streaming preview: heavy islands (3D/video/mermaid) render as quiet boxes
   until the finished document swaps in. */
.takt-preview-pending{min-height:160px;border-radius:10px;background:var(--takt-surface);
  border:1px dashed var(--takt-border);opacity:.7}

button:focus-visible,a:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--takt-accent);outline-offset:2px;border-radius:6px}
@media (prefers-reduced-motion: reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;
