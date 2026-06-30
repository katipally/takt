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
const HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
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
    "three": "https://esm.sh/three@0.160.0"
  }
}
</script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { darkMode: 'class' };</script>
<style>
  /* ── Prox artifact design tokens — mirror the app's globals.css so every
     artifact looks like one product, light or dark. .dark is toggled by the
     parent via applyTheme(). ───────────────────────────────────────────── */
  :root{
    --prox-bg:#ffffff; --prox-fg:#1a1a18; --prox-muted:#6a6a66; --prox-faint:rgba(0,0,0,.45);
    --prox-border:rgba(0,0,0,.10); --prox-border-heavy:rgba(0,0,0,.16);
    --prox-card:#ffffff; --prox-surface:#f5f4f1;
    --prox-accent:#2f6fed; --prox-accent-soft:rgba(47,111,237,.10);
    --prox-arc:#e2701f; --prox-arc-soft:rgba(226,112,31,.12);
    --prox-success:#16a34a; --prox-success-soft:rgba(22,163,74,.10);
    --prox-danger:#dc2626; --prox-danger-soft:rgba(220,38,38,.10);
    --prox-shadow:0 1px 2px rgba(0,0,0,.04), 0 8px 24px -12px rgba(0,0,0,.12);
    --prox-radius:12px;
  }
  .dark{
    --prox-bg:#141416; --prox-fg:#fafafa; --prox-muted:#a1a1aa; --prox-faint:rgba(255,255,255,.45);
    --prox-border:rgba(255,255,255,.09); --prox-border-heavy:rgba(255,255,255,.16);
    --prox-card:#1a1a1d; --prox-surface:#202024;
    --prox-accent:#5b9dff; --prox-accent-soft:rgba(91,157,255,.14);
    --prox-arc:#ff8a3d; --prox-arc-soft:rgba(255,138,61,.16);
    --prox-success:#40c977; --prox-success-soft:rgba(64,201,119,.14);
    --prox-danger:#fa423e; --prox-danger-soft:rgba(250,66,62,.14);
    --prox-shadow:0 1px 2px rgba(0,0,0,.4), 0 12px 32px -16px rgba(0,0,0,.6);
  }
  *{box-sizing:border-box;}
  html,body{margin:0;height:auto;font-family:var(--font-geist-sans),ui-sans-serif,system-ui,-apple-system,sans-serif;}
  body{background:var(--prox-bg);color:var(--prox-fg);-webkit-font-smoothing:antialiased;}
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

  /* ── prox-kit: shared component classes, usable from html OR react artifacts.
     Wrap a designed answer in .prox-doc; use the pieces below to stay on-brand.
     The doc reads like an article — a centered reading column that adapts to the
     panel: full-width when narrow, capped & centered when the panel is wide. */
  .prox-doc{color:var(--prox-fg);font-size:14.5px;line-height:1.65;max-width:720px;margin-inline:auto;}
  .prox-doc.wide{max-width:960px;}
  .prox-doc>*+*{margin-top:14px;}
  .prox-doc h1,.prox-h1{font-size:21px;font-weight:650;letter-spacing:-.01em;line-height:1.25;margin:0;}
  .prox-doc h2,.prox-h2{font-size:16px;font-weight:650;letter-spacing:-.01em;margin:22px 0 0;}
  .prox-doc h3,.prox-h3{font-size:13.5px;font-weight:650;margin:18px 0 0;}
  .prox-doc p{margin:0;color:var(--prox-fg);}
  .prox-doc a{color:var(--prox-accent);text-decoration:none;}
  .prox-doc a:hover{text-decoration:underline;}
  .prox-doc ul,.prox-doc ol{margin:0;padding-left:20px;}
  .prox-doc li+li{margin-top:5px;}
  .prox-doc strong{font-weight:650;}
  .prox-doc code{font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:.86em;background:var(--prox-surface);border:1px solid var(--prox-border);border-radius:5px;padding:1px 5px;}
  .prox-doc hr{border:0;border-top:1px solid var(--prox-border);margin:18px 0;}
  .prox-eyebrow{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.12em;color:var(--prox-arc);}
  .prox-lead{font-size:14px;color:var(--prox-muted);}
  .prox-card{background:var(--prox-card);border:1px solid var(--prox-border);border-radius:var(--prox-radius);padding:16px;box-shadow:var(--prox-shadow);}
  .prox-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));}
  .prox-badge{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:500;color:var(--prox-accent);background:var(--prox-accent-soft);border-radius:999px;padding:2px 10px;}
  .prox-kbd{font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:12px;background:var(--prox-surface);border:1px solid var(--prox-border-heavy);border-bottom-width:2px;border-radius:5px;padding:1px 6px;}
  /* note box — soft tinted surface + a small colored dot. Block (not flex) so its
     contents flow & wrap as normal text on narrow widths instead of breaking into
     a jagged column of pills. The dot is positioned, not a flex sibling. */
  .prox-callout{position:relative;border:1px solid var(--prox-border);background:var(--prox-surface);border-radius:10px;padding:12px 14px 12px 30px;font-size:13.5px;line-height:1.55;}
  .prox-callout::before{content:"";position:absolute;left:14px;top:19px;width:7px;height:7px;border-radius:999px;background:var(--prox-arc);}
  .prox-callout.tip{background:var(--prox-accent-soft);border-color:transparent;}
  .prox-callout.tip::before{background:var(--prox-accent);}
  .prox-callout.warn{background:var(--prox-danger-soft);border-color:transparent;}
  .prox-callout.warn::before{background:var(--prox-danger);}
  .prox-callout.ok{background:var(--prox-success-soft);border-color:transparent;}
  .prox-callout.ok::before{background:var(--prox-success);}
  .prox-table{width:100%;border-collapse:collapse;font-size:13px;overflow:hidden;border:1px solid var(--prox-border);border-radius:10px;}
  .prox-table th,.prox-table td{text-align:left;padding:8px 11px;border-bottom:1px solid var(--prox-border);}
  .prox-table th{background:var(--prox-surface);font-weight:600;font-size:12px;color:var(--prox-muted);}
  .prox-table tr:last-child td{border-bottom:0;}
  /* manual figure — a framed "paper" inset. The scan stays on white (it IS a
     white page) so it reads as deliberate in dark mode, capped in height so it
     never dominates, and centered. Caption bar carries the theme. */
  .prox-figure{margin:0;border:1px solid var(--prox-border);border-radius:var(--prox-radius);overflow:hidden;background:var(--prox-card);box-shadow:var(--prox-shadow);}
  .prox-figure>img,.prox-figure>.prox-paper>img{display:block;width:100%;height:auto;max-height:460px;object-fit:contain;object-position:center;background:#fff;}
  .prox-paper{background:#fff;padding:8px;display:flex;justify-content:center;}
  .prox-figcaption{display:flex;align-items:center;gap:6px;padding:8px 12px;font-size:12px;color:var(--prox-muted);border-top:1px solid var(--prox-border);background:var(--prox-card);}
  .prox-figcaption::before{content:"";width:6px;height:6px;border-radius:999px;background:var(--prox-arc);flex:none;}
  /* crop/zoom into a region of a manual scan: fixed-ratio window, pan/scale the
     img with an inline transform e.g. style="transform:scale(2) translate(-18%,-22%)" */
  .prox-crop{position:relative;width:100%;aspect-ratio:16/10;border-radius:var(--prox-radius);overflow:hidden;border:1px solid var(--prox-border);background:#fff;}
  .prox-crop img{position:absolute;top:0;left:0;width:100%;height:auto;transform-origin:top left;}
  /* manual page-reference list (e.g. "where to find this") — clean chips, themed */
  .prox-reflist{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));list-style:none;margin:0;padding:0;}
  .prox-ref{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--prox-border);background:var(--prox-card);border-radius:10px;padding:10px 12px;font-size:13px;color:var(--prox-fg);}
  .prox-ref .prox-ref-page{flex:none;font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:11px;font-weight:650;color:var(--prox-arc);background:var(--prox-arc-soft);border-radius:6px;padding:2px 7px;}
  .prox-source{font-size:12px;color:var(--prox-faint);}
  /* numbered procedure with a connecting spine */
  .prox-steps{list-style:none;margin:0;padding:0;counter-reset:prox-step;}
  .prox-steps>li{position:relative;padding:0 0 16px 36px;}
  .prox-steps>li:last-child{padding-bottom:0;}
  .prox-steps>li::before{counter-increment:prox-step;content:counter(prox-step);position:absolute;left:0;top:0;width:24px;height:24px;display:grid;place-items:center;border-radius:999px;background:var(--prox-arc-soft);color:var(--prox-arc);font-size:12px;font-weight:650;}
  .prox-steps>li::after{content:"";position:absolute;left:11.5px;top:24px;bottom:0;width:1.5px;background:var(--prox-border);}
  .prox-steps>li:last-child::after{display:none;}
  /* big-number stat tiles */
  .prox-stat{background:var(--prox-card);border:1px solid var(--prox-border);border-radius:10px;padding:12px 14px;}
  .prox-stat-num{font-size:26px;font-weight:700;line-height:1;letter-spacing:-.02em;color:var(--prox-fg);}
  .prox-stat-label{margin-top:5px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--prox-muted);}
  /* annotate / crop a manual image: position the <img> in a relative .prox-annotate
     box and drop absolutely-positioned .prox-pin markers or an inline <svg> overlay
     on top. Use object-fit/position + a fixed-ratio box to zoom into a region. */
  .prox-annotate{position:relative;display:block;border-radius:var(--prox-radius);overflow:hidden;border:1px solid var(--prox-border);background:var(--prox-surface);}
  .prox-annotate>svg{position:absolute;inset:0;width:100%;height:100%;}
  .prox-pin{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;display:grid;place-items:center;border-radius:999px;background:var(--prox-arc);color:#fff;font-size:11px;font-weight:700;box-shadow:0 0 0 3px var(--prox-arc-soft);}
  .prox-err{white-space:pre-wrap;color:var(--prox-danger);background:var(--prox-danger-soft);border:1px solid var(--prox-border);border-radius:10px;font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:12px;padding:14px 16px;margin:6px;}

  /* ── Dark-mode safety net. Models sometimes reach for hard-coded light Tailwind
     colors (bg-white, bg-blue-50, text-gray-900) that are unreadable on a dark
     panel. Remap the common offenders to theme tokens so nothing ends up
     white-on-white. Real fix is using the kit; this just stops breakage. */
  .dark #root .bg-white,.dark #root .bg-gray-50,.dark #root .bg-gray-100,.dark #root .bg-slate-50,.dark #root .bg-slate-100,.dark #root .bg-zinc-50,.dark #root .bg-zinc-100,.dark #root .bg-neutral-50,.dark #root .bg-neutral-100,.dark #root .bg-stone-50{background-color:var(--prox-card)!important;}
  .dark #root .text-black,.dark #root .text-gray-900,.dark #root .text-gray-800,.dark #root .text-slate-900,.dark #root .text-slate-800,.dark #root .text-zinc-900,.dark #root .text-neutral-900{color:var(--prox-fg)!important;}
  .dark #root .text-gray-700,.dark #root .text-gray-600,.dark #root .text-gray-500,.dark #root .text-slate-600,.dark #root .text-slate-500,.dark #root .text-zinc-600{color:var(--prox-muted)!important;}
  .dark #root .border-gray-100,.dark #root .border-gray-200,.dark #root .border-gray-300,.dark #root .border-slate-200,.dark #root .border-zinc-200,.dark #root .border-neutral-200{border-color:var(--prox-border)!important;}
  .dark #root [class*="bg-blue-5"],.dark #root [class*="bg-blue-10"],.dark #root [class*="bg-sky-5"],.dark #root [class*="bg-indigo-5"],.dark #root [class*="bg-violet-5"],.dark #root [class*="bg-purple-5"]{background-color:var(--prox-accent-soft)!important;}
  .dark #root [class*="bg-amber-5"],.dark #root [class*="bg-yellow-5"],.dark #root [class*="bg-orange-5"]{background-color:var(--prox-arc-soft)!important;}
  .dark #root [class*="bg-green-5"],.dark #root [class*="bg-emerald-5"],.dark #root [class*="bg-teal-5"],.dark #root [class*="bg-lime-5"]{background-color:var(--prox-success-soft)!important;}
  .dark #root [class*="bg-red-5"],.dark #root [class*="bg-rose-5"],.dark #root [class*="bg-pink-5"]{background-color:var(--prox-danger-soft)!important;}
  /* dark text on those pastel tints becomes the readable foreground */
  .dark #root [class*="text-blue-9"],.dark #root [class*="text-blue-8"],.dark #root [class*="text-amber-9"],.dark #root [class*="text-amber-8"],.dark #root [class*="text-green-9"],.dark #root [class*="text-green-8"],.dark #root [class*="text-emerald-9"],.dark #root [class*="text-red-9"],.dark #root [class*="text-red-8"],.dark #root [class*="text-purple-9"],.dark #root [class*="text-indigo-9"]{color:var(--prox-fg)!important;}

  /* ── Small-panel net. The iframe is as wide as the panel, so this fires when the
     artifact is shown narrow (small window / split view). Collapse multi-column
     grids to one column and let wide content scroll instead of overflowing. */
  @media (max-width:560px){
    #root{padding:11px;}
    .prox-doc{font-size:14px;}
    #root .prox-grid,#root .prox-reflist,#root .grid-cols-2,#root .grid-cols-3,#root .grid-cols-4{grid-template-columns:1fr !important;}
    .prox-table{font-size:12px;}
    .prox-table th,.prox-table td{padding:7px 9px;}
  }
  /* very narrow: tables can scroll horizontally rather than crush their columns */
  @media (max-width:420px){
    .prox-doc .prox-table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
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
    // prox-kit tokens flip with it, so artifacts inherit the app's theme.
    document.documentElement.classList.toggle('dark', t === 'dark');
  }
  if (fill) document.documentElement.classList.add('fill');
  applyTheme(params.get('t') === 'dark' ? 'dark' : 'light');

  var rootEl = document.getElementById('root');
  var root = createRoot(rootEl);

  // Tell the parent the artifact has mounted, so it can clear the spinner —
  // independent of height (fill mode posts no height).
  function ack(){ parent.postMessage({ __prox: true, type: 'rendered' }, '*'); }

  // auto-mode only: post content height (coalesced, change-guarded) so the
  // parent can size the iframe. In fill mode the parent keeps it at 100%.
  var lastH = 0, raf = 0;
  function postHeight(){
    if (fill) return;
    var h = Math.ceil(rootEl.getBoundingClientRect().height);
    if (Math.abs(h - lastH) < 2) return;
    lastH = h;
    parent.postMessage({ __prox: true, type: 'height', height: h }, '*');
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

  function showError(err){
    rootEl.innerHTML = '<div class="prox-err">Artifact error:\\n' + (err && err.message ? err.message : err) + '</div>';
    postHeight(); ack();
  }

  async function renderArtifact(code, kind){
    try {
      if (kind === 'html'){ rootEl.innerHTML = code; watchImages(); postHeight(); ack(); return; }
      // Transform TSX/JSX → ES module (automatic runtime keeps imports intact;
      // the import map resolves them to esm.sh).
      var out = Babel.transform(code, {
        filename: 'artifact.tsx',
        sourceType: 'module',
        presets: [['react', { runtime: 'automatic' }], ['typescript', { isTSX: true, allExtensions: true }]],
      }).code;
      // Surface the component even when it isn't a default export.
      out += '\\n;globalThis.__PROX_APP = (typeof App!=="undefined") ? App : (typeof Artifact!=="undefined" ? Artifact : globalThis.__PROX_APP);';
      defineMissingComponents(code);
      window.__PROX_APP = undefined;
      var url = URL.createObjectURL(new Blob([out], { type: 'text/javascript' }));
      var mod = await import(url);
      URL.revokeObjectURL(url);
      var Comp = mod.default || window.__PROX_APP;
      if (!Comp) throw new Error('No component found. Export a component named App, e.g. export default function App() { ... }');
      root.render(React.createElement(Comp));
      requestAnimationFrame(function(){ watchImages(); postHeight(); ack(); });
    } catch (err) { showError(err); }
  }

  // Keep announcing 'ready' until the parent's code actually lands — the first
  // ping can race a parent remount (StrictMode/AnimatePresence) and be dropped,
  // which left the spinner stuck forever. The retry self-heals that.
  var gotCode = false, readyTimer = 0;
  function announceReady(){ parent.postMessage({ __prox: true, type: 'ready' }, '*'); }

  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (!d || !d.__prox) return;
    if (d.type === 'theme') { applyTheme(d.theme); return; }
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

export function GET() {
  return new Response(HTML, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
