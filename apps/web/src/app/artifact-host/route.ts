export const runtime = "nodejs";

// The sandboxed artifact renderer. Loaded in an iframe with sandbox="allow-scripts"
// (NO allow-same-origin) so model code runs but can't touch the app's cookies,
// DOM, or storage. The parent posts the code in via postMessage.
//
// Runtime: ES modules + import maps via esm.sh. Model code can `import` real npm
// packages (react, lucide-react, framer-motion, recharts, d3, three). Babel
// (automatic runtime) transforms JSX/TSX to an ES module, which we load as a
// blob; the import map resolves every bare import to esm.sh. React + hooks are
// also exposed as globals for back-compat with older import-less artifacts, and
// any undefined capitalized tag falls back to a neutral icon so a stray name
// never crashes the whole view.
// CSP injected as a <meta> tag — inside a sandboxed (null-origin) iframe it
// cannot be escaped by the artifact's own JS, so it's a real egress lock:
// scripts/styles only from the known CDNs, and IMAGES only from our own origin
// (manual pages + crops) + data:. The model can no longer pull in arbitrary
// external images/trackers/fetch even though the prompt is the first defense.
function buildHtml() {
  const appOrigin = (() => {
    try { return new URL(process.env.WEB_PUBLIC_URL ?? "http://localhost:3000").origin; }
    catch { return "http://localhost:3000"; }
  })();
  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval' blob: https://esm.sh https://cdn.jsdelivr.net https://cdn.tailwindcss.com",
    "style-src 'unsafe-inline' https://cdn.tailwindcss.com",
    `img-src 'self' data: blob: ${appOrigin}`,
    `connect-src https://esm.sh https://cdn.jsdelivr.net ${appOrigin}`,
    "font-src data: https://esm.sh https://cdn.jsdelivr.net",
  ].join("; ");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18.3.1",
    "react-dom": "https://esm.sh/react-dom@18.3.1?external=react",
    "react-dom/client": "https://esm.sh/react-dom@18.3.1/client?external=react",
    "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
    "lucide-react": "https://esm.sh/lucide-react@0.469.0?external=react",
    "framer-motion": "https://esm.sh/framer-motion@11?external=react,react-dom",
    "motion/react": "https://esm.sh/framer-motion@11?external=react,react-dom",
    "recharts": "https://esm.sh/recharts@2.15.0?external=react,react-dom",
    "d3": "https://esm.sh/d3@7",
    "three": "https://esm.sh/three@0.160.0",
    "mermaid": "https://esm.sh/mermaid@11",
    "@google/model-viewer": "https://esm.sh/@google/model-viewer@4"
  }
}
</script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { darkMode: 'class' };</script>
<style>
  /* ── Takt artifact design tokens — mirror the app's globals.css so every
     artifact looks like one product, light or dark. .dark is toggled by the
     parent via applyTheme(). ───────────────────────────────────────────── */
  :root{
    --takt-bg:#ffffff; --takt-fg:#1a1a18; --takt-muted:#6a6a66; --takt-faint:rgba(0,0,0,.45);
    --takt-border:rgba(0,0,0,.10); --takt-border-heavy:rgba(0,0,0,.16);
    --takt-card:#ffffff; --takt-surface:#f5f4f1;
    --takt-accent:#2f6fed; --takt-accent-soft:rgba(47,111,237,.10);
    --takt-arc:#e2701f; --takt-arc-soft:rgba(226,112,31,.12);
    --takt-success:#16a34a; --takt-success-soft:rgba(22,163,74,.10);
    --takt-danger:#dc2626; --takt-danger-soft:rgba(220,38,38,.10);
    --takt-shadow:0 1px 2px rgba(0,0,0,.04), 0 8px 24px -12px rgba(0,0,0,.12);
    --takt-radius:12px;
  }
  .dark{
    --takt-bg:#141416; --takt-fg:#fafafa; --takt-muted:#a1a1aa; --takt-faint:rgba(255,255,255,.45);
    --takt-border:rgba(255,255,255,.09); --takt-border-heavy:rgba(255,255,255,.16);
    --takt-card:#1a1a1d; --takt-surface:#202024;
    --takt-accent:#5b9dff; --takt-accent-soft:rgba(91,157,255,.14);
    --takt-arc:#ff8a3d; --takt-arc-soft:rgba(255,138,61,.16);
    --takt-success:#40c977; --takt-success-soft:rgba(64,201,119,.14);
    --takt-danger:#fa423e; --takt-danger-soft:rgba(250,66,62,.14);
    --takt-shadow:0 1px 2px rgba(0,0,0,.4), 0 12px 32px -16px rgba(0,0,0,.6);
  }
  *{box-sizing:border-box;}
  html,body{margin:0;height:auto;font-family:var(--font-geist-sans),ui-sans-serif,system-ui,-apple-system,sans-serif;}
  body{background:var(--takt-bg);color:var(--takt-fg);-webkit-font-smoothing:antialiased;}
  #root{padding:16px;}
  /* fill mode: iframe fills its container and scrolls inside — natural scrolling
     in the panel, no wheel events lost to the iframe. */
  html.fill,html.fill body{height:100%;}
  html.fill body{overflow-y:auto;overflow-x:hidden;}
  html.fill #root{min-height:100%;}
  /* Models love min-h-screen/h-screen/100vh — inside the auto-sized iframe that
     inflates the artifact to the viewport and leaves huge empty space. */
  #root .min-h-screen{min-height:0 !important;}
  #root .h-screen{height:auto !important;}
  #root [style*="100vh"]{min-height:0 !important;height:auto !important;}
  #root img{max-width:100%;height:auto;}

  /* ── takt-kit: shared component classes, usable from html OR react artifacts.
     Wrap a designed answer in .takt-doc; use the pieces below to stay on-brand.
     The doc reads like an article — a centered reading column that adapts to the
     panel: full-width when narrow, capped & centered when the panel is wide. */
  .takt-doc{color:var(--takt-fg);font-size:14.5px;line-height:1.65;max-width:720px;margin-inline:auto;}
  .takt-doc.wide{max-width:960px;}
  .takt-doc>*+*{margin-top:14px;}
  .takt-doc h1,.takt-h1{font-size:21px;font-weight:650;letter-spacing:-.01em;line-height:1.25;margin:0;}
  .takt-doc h2,.takt-h2{font-size:16px;font-weight:650;letter-spacing:-.01em;margin:22px 0 0;}
  .takt-doc h3,.takt-h3{font-size:13.5px;font-weight:650;margin:18px 0 0;}
  .takt-doc p{margin:0;color:var(--takt-fg);}
  .takt-doc a{color:var(--takt-accent);text-decoration:none;}
  .takt-doc a:hover{text-decoration:underline;}
  .takt-doc ul,.takt-doc ol{margin:0;padding-left:20px;}
  .takt-doc li+li{margin-top:5px;}
  .takt-doc strong{font-weight:650;}
  .takt-doc code{font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:.86em;background:var(--takt-surface);border:1px solid var(--takt-border);border-radius:5px;padding:1px 5px;}
  .takt-doc hr{border:0;border-top:1px solid var(--takt-border);margin:18px 0;}
  .takt-eyebrow{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.12em;color:var(--takt-arc);}
  .takt-lead{font-size:14px;color:var(--takt-muted);}
  .takt-card{background:var(--takt-card);border:1px solid var(--takt-border);border-radius:var(--takt-radius);padding:16px;box-shadow:var(--takt-shadow);}
  .takt-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));}
  .takt-badge{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:500;color:var(--takt-accent);background:var(--takt-accent-soft);border-radius:999px;padding:2px 10px;}
  .takt-kbd{font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:12px;background:var(--takt-surface);border:1px solid var(--takt-border-heavy);border-bottom-width:2px;border-radius:5px;padding:1px 6px;}
  /* note box — soft tinted surface + a small colored dot. Block (not flex) so its
     contents flow & wrap as normal text on narrow widths instead of breaking into
     a jagged column of pills. The dot is positioned, not a flex sibling. */
  .takt-callout{position:relative;border:1px solid var(--takt-border);background:var(--takt-surface);border-radius:10px;padding:12px 14px 12px 30px;font-size:13.5px;line-height:1.55;}
  .takt-callout::before{content:"";position:absolute;left:14px;top:19px;width:7px;height:7px;border-radius:999px;background:var(--takt-arc);}
  .takt-callout.tip{background:var(--takt-accent-soft);border-color:transparent;}
  .takt-callout.tip::before{background:var(--takt-accent);}
  .takt-callout.warn{background:var(--takt-danger-soft);border-color:transparent;}
  .takt-callout.warn::before{background:var(--takt-danger);}
  .takt-callout.ok{background:var(--takt-success-soft);border-color:transparent;}
  .takt-callout.ok::before{background:var(--takt-success);}
  .takt-table{width:100%;border-collapse:collapse;font-size:13px;overflow:hidden;border:1px solid var(--takt-border);border-radius:10px;}
  .takt-table th,.takt-table td{text-align:left;padding:8px 11px;border-bottom:1px solid var(--takt-border);}
  .takt-table th{background:var(--takt-surface);font-weight:600;font-size:12px;color:var(--takt-muted);}
  .takt-table tr:last-child td{border-bottom:0;}
  /* manual figure — a framed "paper" inset. The scan stays on white (it IS a
     white page) so it reads as deliberate in dark mode, capped in height so it
     never dominates, and centered. Caption bar carries the theme. */
  .takt-figure{margin:0;border:1px solid var(--takt-border);border-radius:var(--takt-radius);overflow:hidden;background:var(--takt-card);box-shadow:var(--takt-shadow);}
  .takt-figure>img,.takt-figure>.takt-paper>img{display:block;width:100%;height:auto;max-height:460px;object-fit:contain;object-position:center;background:#fff;}
  .takt-paper{background:#fff;padding:8px;display:flex;justify-content:center;}
  .takt-figcaption{display:flex;align-items:center;gap:6px;padding:8px 12px;font-size:12px;color:var(--takt-muted);border-top:1px solid var(--takt-border);background:var(--takt-card);}
  .takt-figcaption::before{content:"";width:6px;height:6px;border-radius:999px;background:var(--takt-arc);flex:none;}
  /* crop/zoom into a region of a manual scan: fixed-ratio window, pan/scale the
     img with an inline transform e.g. style="transform:scale(2) translate(-18%,-22%)" */
  .takt-crop{position:relative;width:100%;aspect-ratio:16/10;border-radius:var(--takt-radius);overflow:hidden;border:1px solid var(--takt-border);background:#fff;}
  .takt-crop img{position:absolute;top:0;left:0;width:100%;height:auto;transform-origin:top left;}
  /* manual page-reference list (e.g. "where to find this") — clean chips, themed */
  .takt-reflist{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));list-style:none;margin:0;padding:0;}
  .takt-ref{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--takt-border);background:var(--takt-card);border-radius:10px;padding:10px 12px;font-size:13px;color:var(--takt-fg);}
  .takt-ref .takt-ref-page{flex:none;font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:11px;font-weight:650;color:var(--takt-arc);background:var(--takt-arc-soft);border-radius:6px;padding:2px 7px;}
  .takt-source{font-size:12px;color:var(--takt-faint);}
  /* numbered procedure with a connecting spine */
  .takt-steps{list-style:none;margin:0;padding:0;counter-reset:takt-step;}
  .takt-steps>li{position:relative;padding:0 0 16px 36px;}
  .takt-steps>li:last-child{padding-bottom:0;}
  .takt-steps>li::before{counter-increment:takt-step;content:counter(takt-step);position:absolute;left:0;top:0;width:24px;height:24px;display:grid;place-items:center;border-radius:999px;background:var(--takt-arc-soft);color:var(--takt-arc);font-size:12px;font-weight:650;}
  .takt-steps>li::after{content:"";position:absolute;left:11.5px;top:24px;bottom:0;width:1.5px;background:var(--takt-border);}
  .takt-steps>li:last-child::after{display:none;}
  /* big-number stat tiles */
  .takt-stat{background:var(--takt-card);border:1px solid var(--takt-border);border-radius:10px;padding:12px 14px;}
  .takt-stat-num{font-size:26px;font-weight:700;line-height:1;letter-spacing:-.02em;color:var(--takt-fg);}
  .takt-stat-label{margin-top:5px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--takt-muted);}
  /* annotate / crop a manual image: position the <img> in a relative .takt-annotate
     box and drop absolutely-positioned .takt-pin markers or an inline <svg> overlay
     on top. Use object-fit/position + a fixed-ratio box to zoom into a region. */
  .takt-annotate{position:relative;display:block;border-radius:var(--takt-radius);overflow:hidden;border:1px solid var(--takt-border);background:var(--takt-surface);}
  .takt-annotate>svg{position:absolute;inset:0;width:100%;height:100%;}
  .takt-pin{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;display:grid;place-items:center;border-radius:999px;background:var(--takt-arc);color:#fff;font-size:11px;font-weight:700;box-shadow:0 0 0 3px var(--takt-arc-soft);}
  .takt-err{white-space:pre-wrap;color:var(--takt-danger);background:var(--takt-danger-soft);border:1px solid var(--takt-border);border-radius:10px;font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:12px;padding:14px 16px;margin:6px;}

  /* ── Dark-mode safety net. Models sometimes reach for hard-coded light Tailwind
     colors (bg-white, bg-blue-50, text-gray-900) that are unreadable on a dark
     panel. Remap the common offenders to theme tokens so nothing ends up
     white-on-white. Real fix is using the kit; this just stops breakage. */
  .dark #root .bg-white,.dark #root .bg-gray-50,.dark #root .bg-gray-100,.dark #root .bg-slate-50,.dark #root .bg-slate-100,.dark #root .bg-zinc-50,.dark #root .bg-zinc-100,.dark #root .bg-neutral-50,.dark #root .bg-neutral-100,.dark #root .bg-stone-50{background-color:var(--takt-card)!important;}
  .dark #root .text-black,.dark #root .text-gray-900,.dark #root .text-gray-800,.dark #root .text-slate-900,.dark #root .text-slate-800,.dark #root .text-zinc-900,.dark #root .text-neutral-900{color:var(--takt-fg)!important;}
  .dark #root .text-gray-700,.dark #root .text-gray-600,.dark #root .text-gray-500,.dark #root .text-slate-600,.dark #root .text-slate-500,.dark #root .text-zinc-600{color:var(--takt-muted)!important;}
  .dark #root .border-gray-100,.dark #root .border-gray-200,.dark #root .border-gray-300,.dark #root .border-slate-200,.dark #root .border-zinc-200,.dark #root .border-neutral-200{border-color:var(--takt-border)!important;}
  .dark #root [class*="bg-blue-5"],.dark #root [class*="bg-blue-10"],.dark #root [class*="bg-sky-5"],.dark #root [class*="bg-indigo-5"],.dark #root [class*="bg-violet-5"],.dark #root [class*="bg-purple-5"]{background-color:var(--takt-accent-soft)!important;}
  .dark #root [class*="bg-amber-5"],.dark #root [class*="bg-yellow-5"],.dark #root [class*="bg-orange-5"]{background-color:var(--takt-arc-soft)!important;}
  .dark #root [class*="bg-green-5"],.dark #root [class*="bg-emerald-5"],.dark #root [class*="bg-teal-5"],.dark #root [class*="bg-lime-5"]{background-color:var(--takt-success-soft)!important;}
  .dark #root [class*="bg-red-5"],.dark #root [class*="bg-rose-5"],.dark #root [class*="bg-pink-5"]{background-color:var(--takt-danger-soft)!important;}
  /* dark text on those pastel tints becomes the readable foreground */
  .dark #root [class*="text-blue-9"],.dark #root [class*="text-blue-8"],.dark #root [class*="text-amber-9"],.dark #root [class*="text-amber-8"],.dark #root [class*="text-green-9"],.dark #root [class*="text-green-8"],.dark #root [class*="text-emerald-9"],.dark #root [class*="text-red-9"],.dark #root [class*="text-red-8"],.dark #root [class*="text-purple-9"],.dark #root [class*="text-indigo-9"]{color:var(--takt-fg)!important;}

  /* ── Small-panel net. The iframe is as wide as the panel, so this fires when the
     artifact is shown narrow (small window / split view). Collapse multi-column
     grids to one column and let wide content scroll instead of overflowing. */
  @media (max-width:560px){
    #root{padding:11px;}
    .takt-doc{font-size:14px;}
    #root .takt-grid,#root .takt-reflist,#root .grid-cols-2,#root .grid-cols-3,#root .grid-cols-4{grid-template-columns:1fr !important;}
    .takt-table{font-size:12px;}
    .takt-table th,.takt-table td{padding:7px 9px;}
  }
  /* very narrow: tables can scroll horizontally rather than crush their columns */
  @media (max-width:420px){
    .takt-doc .takt-table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
  }
</style>
</head>
<body>
<div id="root"></div>
<script type="module">
  import React from 'react';
  import { createRoot } from 'react-dom/client';

  // Back-compat: older artifacts use React/hooks as free globals (no imports).
  Object.assign(window, {
    React: React,
    useState: React.useState, useEffect: React.useEffect, useRef: React.useRef,
    useMemo: React.useMemo, useCallback: React.useCallback, useReducer: React.useReducer,
    useLayoutEffect: React.useLayoutEffect, useContext: React.useContext, Fragment: React.Fragment,
  });

  var params = new URLSearchParams(location.search);
  // fill mode: the iframe fills its container and scrolls INTERNALLY (natural
  // scroll, no wheel-swallow). auto mode: the iframe sizes to content and the
  // parent scrolls (used for thumbnails / inline previews).
  var fill = params.get('m') === 'fill';

  function applyTheme(t){
    // Toggle .dark via classList so it doesn't clobber the 'fill' class — the
    // takt-kit tokens flip with it, so artifacts inherit the app's theme.
    document.documentElement.classList.toggle('dark', t === 'dark');
  }
  if (fill) document.documentElement.classList.add('fill');
  applyTheme(params.get('t') === 'dark' ? 'dark' : 'light');

  var rootEl = document.getElementById('root');
  var root = createRoot(rootEl);

  // Tell the parent the artifact has mounted, so it can clear the spinner —
  // independent of height (fill mode posts no height).
  function ack(){ parent.postMessage({ __takt: true, type: 'rendered' }, '*'); }

  // auto-mode only: post content height (coalesced, change-guarded) so the
  // parent can size the iframe. In fill mode the parent keeps it at 100%.
  var lastH = 0, raf = 0;
  function postHeight(){
    if (fill) return;
    var h = Math.ceil(rootEl.getBoundingClientRect().height);
    if (Math.abs(h - lastH) < 2) return;
    lastH = h;
    parent.postMessage({ __takt: true, type: 'height', height: h }, '*');
  }
  function scheduleHeight(){
    if (raf) return;
    raf = requestAnimationFrame(function(){ raf = 0; postHeight(); });
  }
  new ResizeObserver(scheduleHeight).observe(rootEl);
  window.addEventListener('load', postHeight);
  function watchImages(){
    rootEl.querySelectorAll('img').forEach(function(img){
      if (!img.complete) { img.addEventListener('load', postHeight); img.addEventListener('error', postHeight); }
    });
  }

  // Neutral icon for any capitalized JSX tag we can't resolve (a model used an
  // icon name without importing it) — better than crashing the whole artifact.
  function FallbackIcon(props){
    var a = Object.assign({ xmlns:'http://www.w3.org/2000/svg', width:24, height:24, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2, strokeLinecap:'round', strokeLinejoin:'round' }, props||{});
    if (a.size){ a.width = a.size; a.height = a.size; delete a.size; }
    return React.createElement('svg', a, React.createElement('circle', { cx:12, cy:12, r:9 }));
  }
  function defineMissingComponents(src){
    (src.match(/<([A-Z][A-Za-z0-9]*)/g) || []).forEach(function(m){
      var n = m.slice(1);
      if (n !== 'App' && n !== 'Fragment' && !(n in window)) window[n] = FallbackIcon;
    });
  }

  // Render any <pre class="mermaid"> / .mermaid nodes into diagrams. We stash the
  // original diagram text on data-src so a theme switch can re-render from source
  // (mermaid.run replaces the text with an SVG, so we can't re-theme in place).
  async function runMermaid(){
    var nodes = Array.prototype.slice.call(rootEl.querySelectorAll('.mermaid'));
    if (!nodes.length) return;
    try {
      var mermaid = (await import('mermaid')).default;
      var dark = document.documentElement.classList.contains('dark');
      nodes.forEach(function(n){
        if (n.dataset.src){ n.textContent = n.dataset.src; n.removeAttribute('data-processed'); }
        else { n.dataset.src = n.textContent; }
      });
      mermaid.initialize({ startOnLoad:false, theme: dark ? 'dark' : 'default', securityLevel:'strict' });
      await mermaid.run({ nodes: nodes });
    } catch (e) { /* leave the diagram source visible if it won't parse */ }
    postHeight();
  }

  // Load the <model-viewer> web component on demand when a 3D model is embedded.
  // GLB must come from our own origin (the CSP + lint enforce /assets/ only).
  var modelViewerLoaded = false;
  async function loadModelViewer(){
    if (modelViewerLoaded || !rootEl.querySelector('model-viewer')) return;
    modelViewerLoaded = true;
    try { await import('@google/model-viewer'); postHeight(); } catch (e) { /* stays inert */ }
  }

  function enhance(){ void runMermaid(); void loadModelViewer(); }

  function showError(err){
    rootEl.innerHTML = '<div class="takt-err">Artifact error:\\n' + (err && err.message ? err.message : err) + '</div>';
    postHeight(); ack();
  }

  async function renderArtifact(code, kind){
    try {
      if (kind === 'html'){ rootEl.innerHTML = code; watchImages(); enhance(); postHeight(); ack(); return; }
      // Transform TSX/JSX → ES module (automatic runtime keeps imports intact;
      // the import map resolves them to esm.sh).
      var out = Babel.transform(code, {
        filename: 'artifact.tsx',
        sourceType: 'module',
        presets: [['react', { runtime: 'automatic' }], ['typescript', { isTSX: true, allExtensions: true }]],
      }).code;
      // Surface the component even when it isn't a default export.
      out += '\\n;globalThis.__TAKT_APP = (typeof App!=="undefined") ? App : (typeof Artifact!=="undefined" ? Artifact : globalThis.__TAKT_APP);';
      defineMissingComponents(code);
      window.__TAKT_APP = undefined;
      var url = URL.createObjectURL(new Blob([out], { type: 'text/javascript' }));
      var mod = await import(url);
      URL.revokeObjectURL(url);
      var Comp = mod.default || window.__TAKT_APP;
      if (!Comp) throw new Error('No component found. Export a component named App, e.g. export default function App() { ... }');
      root.render(React.createElement(Comp));
      requestAnimationFrame(function(){ watchImages(); enhance(); postHeight(); ack(); });
    } catch (err) { showError(err); }
  }

  // Keep announcing 'ready' until the parent's code actually lands — the first
  // ping can race a parent remount (StrictMode/AnimatePresence) and be dropped,
  // which left the spinner stuck forever. The retry self-heals that.
  var gotCode = false, readyTimer = 0;
  function announceReady(){ parent.postMessage({ __takt: true, type: 'ready' }, '*'); }

  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (!d || !d.__takt) return;
    if (d.type === 'theme') { applyTheme(d.theme); void runMermaid(); return; }
    if (d.type === 'render') {
      gotCode = true;
      if (readyTimer) { clearInterval(readyTimer); readyTimer = 0; }
      if (d.theme) applyTheme(d.theme);
      renderArtifact(d.code, d.kind);
    }
  });
  announceReady();
  readyTimer = setInterval(function(){ if (gotCode) { clearInterval(readyTimer); readyTimer = 0; return; } announceReady(); }, 300);
</script>
</body>
</html>`;
}

export function GET() {
  return new Response(buildHtml(), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
