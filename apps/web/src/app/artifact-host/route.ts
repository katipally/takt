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
  html,body{margin:0;height:auto;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;}
  #root{padding:14px;}
  /* Models love min-h-screen/h-screen/100vh — inside the auto-sized iframe that
     inflates the artifact to the viewport and leaves huge empty space. */
  #root .min-h-screen{min-height:0 !important;}
  #root .h-screen{height:auto !important;}
  #root [style*="100vh"]{min-height:0 !important;height:auto !important;}
  #root img{max-width:100%;height:auto;}
  .prox-err{white-space:pre-wrap;color:#fa423e;font-family:ui-monospace,monospace;font-size:12px;padding:16px;}
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

  function applyTheme(t){
    var dark = t === 'dark';
    document.documentElement.className = dark ? 'dark' : '';
    document.body.style.background = dark ? '#141416' : '#ffffff';
    document.body.style.color = dark ? '#fafafa' : '#1a1a18';
  }
  applyTheme(new URLSearchParams(location.search).get('t') === 'dark' ? 'dark' : 'light');

  var rootEl = document.getElementById('root');
  var root = createRoot(rootEl);

  function postHeight(){
    parent.postMessage({ __prox: true, type: 'height', height: Math.ceil(rootEl.getBoundingClientRect().height) }, '*');
  }
  new ResizeObserver(postHeight).observe(rootEl);
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
    postHeight();
  }

  async function renderArtifact(code, kind){
    try {
      if (kind === 'html'){ rootEl.innerHTML = code; watchImages(); postHeight(); return; }
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
      requestAnimationFrame(function(){ watchImages(); postHeight(); });
    } catch (err) { showError(err); }
  }

  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (!d || !d.__prox) return;
    if (d.type === 'theme') { applyTheme(d.theme); return; }
    if (d.type === 'render') { if (d.theme) applyTheme(d.theme); renderArtifact(d.code, d.kind); }
  });
  parent.postMessage({ __prox: true, type: 'ready' }, '*');
</script>
</body>
</html>`;

export function GET() {
  return new Response(HTML, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
