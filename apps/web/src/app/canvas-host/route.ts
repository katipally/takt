export const runtime = "nodejs";

// Sandboxed iframe host for a freeform `Page` surface (the primary generative-UI
// canvas). Loaded with sandbox="allow-scripts" (NO allow-same-origin) so the
// model's HTML/CSS runs isolated from app cookies/DOM/storage. The parent posts
// { html, css, theme }; this host injects them under the Takt DESIGN SYSTEM and
// upgrades the ISLAND custom elements (<takt-cite>/<takt-figure>/<takt-video>/
// <takt-model>/<takt-action>) which bridge back to the app via postMessage —
// that's how grounded media + citations stay first-class while layout is free.
// A strict CSP blocks all external egress; only own-origin media/images load.

function buildHtml() {
  const appOrigin = (() => {
    try { return new URL(process.env.WEB_PUBLIC_URL ?? "http://localhost:3000").origin; }
    catch { return "http://localhost:3000"; }
  })();
  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    `img-src 'self' data: blob: ${appOrigin}`,
    `media-src 'self' blob: ${appOrigin}`,
    "font-src data:",
    `connect-src ${appOrigin}`,
  ].join("; ");

  return `<!doctype html><html><head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="${csp}"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>${DESIGN_CSS}</style>
</head><body>
<main id="root" class="takt-page"></main>
<style id="page-css"></style>
<script>${RUNTIME_JS}</script>
</body></html>`;
}

// ── The Takt editorial design system (injected into every Page surface) ───────
// One consistent, high-craft visual language: real type hierarchy (serif display
// + sans body), layered neutrals, generous rhythm, container-query responsive so
// the SAME page reflows from a narrow rail to a wide monitor. Tokens mirror the
// app theme (--takt-*) so light/dark match the shell.
const DESIGN_CSS = String.raw`
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
}
.dark{
  --takt-bg:#131315; --takt-fg:#f2f1ee; --takt-muted:#a6a6a1; --takt-faint:#76766f;
  --takt-border:rgba(255,255,255,.10); --takt-border-strong:rgba(255,255,255,.18);
  --takt-card:#1b1b1e; --takt-surface:#202024; --takt-surface-2:#26262b;
  --takt-accent:#6ba2ff; --takt-arc:#ff8a4c; --takt-ok:#57c98a; --takt-warn:#e0a34a; --takt-danger:#f2645c;
  --takt-shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px -14px rgba(0,0,0,.6);
}
*{box-sizing:border-box}
html,body{margin:0;height:auto;background:var(--takt-bg);color:var(--takt-fg);
  font-family:var(--takt-sans);font-size:17px;line-height:1.66;-webkit-font-smoothing:antialiased;overflow-x:hidden;text-rendering:optimizeLegibility}
.takt-page{container-type:inline-size;padding:clamp(20px,4cqi,56px);max-width:1400px;margin:0 auto;overflow-x:clip}
img,video,model-viewer{max-width:100%;height:auto}
img{display:block}
/* never let a wide child force horizontal overflow */
.takt-page *{max-width:100%}
.takt-page pre{overflow-x:auto}
/* GUARANTEED vertical rhythm — top-level blocks and stacked content always get
   breathing room, so a page never renders cramped even if the model forgets
   margins. (Grid items use gap, so they're unaffected.) */
/* two-tier rhythm: a big, editorial jump BETWEEN top-level sections; a small,
   tight step WITHIN a card/panel. This gap is what reads as "designed". */
.takt-page > * + *{margin-top:clamp(30px,4.2cqi,68px)}
.takt-card > * + *,.takt-panel > * + *,.takt-callout > * + *{margin-top:.7em}
.takt-page > :is(h1,h2,h3){margin-top:0}
.takt-grid{align-items:start}

/* Type hierarchy — dramatic scale jumps (editorial), not additive weight. */
/* Headline is a VISUAL EVENT: oversized serif, LIGHT weight, tight negative
   tracking, capped measure — scale + whitespace carry hierarchy, not boldness. */
h1,.takt-display{font-family:var(--takt-serif);font-weight:500;line-height:1.02;letter-spacing:-.022em;
  font-size:clamp(2.3rem,6.4cqi,4.2rem);margin:0 0 .3em;max-width:20ch;text-wrap:balance}
h2{font-family:var(--takt-serif);font-weight:520;line-height:1.14;font-size:clamp(1.55rem,3.4cqi,2.5rem);margin:1.1em 0 .45em;letter-spacing:-.016em;text-wrap:balance}
h3{font-family:var(--takt-sans);font-weight:650;font-size:1.12rem;margin:1.3em 0 .35em;letter-spacing:.005em}
p,li{max-width:var(--takt-maxcol)}
p{margin:0 0 1em}
a{color:var(--takt-accent);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--takt-accent) 35%,transparent)}
strong{font-weight:650}
code{font-family:var(--takt-mono);font-size:.88em;background:var(--takt-surface);padding:.12em .38em;border-radius:5px}
hr{border:0;border-top:1px solid var(--takt-border);margin:2em 0}
.takt-eyebrow{font-family:var(--takt-sans);text-transform:uppercase;letter-spacing:.14em;font-size:.72rem;font-weight:650;color:var(--takt-arc);margin:0 0 .6em}
.takt-lead{font-size:clamp(1.12rem,1.7cqi,1.34rem);line-height:1.5;color:var(--takt-muted);max-width:62ch}
blockquote,.takt-quote{font-family:var(--takt-serif);font-size:1.3rem;line-height:1.35;border-left:3px solid var(--takt-arc);
  margin:1.4em 0;padding:.1em 0 .1em 1em;color:var(--takt-fg)}

/* Layout primitives — the model composes real page structure with these. */
.takt-grid{display:grid;gap:clamp(16px,2.4cqi,32px)}
@container (min-width:640px){ .takt-cols-2{grid-template-columns:repeat(2,1fr)} .takt-cols-3{grid-template-columns:repeat(3,1fr)} }
@container (min-width:900px){ .takt-cols-4{grid-template-columns:repeat(4,1fr)} .takt-split{grid-template-columns:1.4fr 1fr} }
/* Cards are FLAT paper: a 1px hairline + a one-shade surface offset separate
   them — no drop shadow (whitespace does the work, not elevation). */
.takt-card{background:var(--takt-card);border:1px solid var(--takt-border);border-radius:var(--takt-radius);padding:clamp(20px,2.4cqi,30px)}
.takt-panel{background:var(--takt-surface);border:1px solid var(--takt-border);border-radius:var(--takt-radius);padding:clamp(20px,2.4cqi,30px)}

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
table{border-collapse:collapse;width:100%;font-size:.94rem;margin:1.2em 0;table-layout:fixed}
th,td{text-align:left;padding:.55em .7em;border-bottom:1px solid var(--takt-border);overflow-wrap:anywhere;vertical-align:top}
th{font-size:.76rem;text-transform:uppercase;letter-spacing:.06em;color:var(--takt-muted)}

/* Islands */
takt-cite{cursor:pointer}
.takt-cite{display:inline-flex;align-items:center;gap:.2em;vertical-align:baseline;font-family:var(--takt-sans);
  font-size:.72em;font-weight:600;color:var(--takt-accent);background:color-mix(in srgb,var(--takt-accent) 12%,transparent);
  border-radius:5px;padding:.05em .38em;margin:0 .12em;line-height:1.4;white-space:nowrap;user-select:none}
.takt-cite:hover{background:color-mix(in srgb,var(--takt-accent) 22%,transparent)}
/* ── Media: figures, video, 3D — ONE consistent editorial treatment ──────────
   Images BLEED into the column (no boxy border); a hairline under the caption,
   newspaper-style. Variants: default column · lead (wider, rounded) · inset
   (floats so body text WRAPS around it, like a real newspaper column). */
/* Manual crops are white-background scans. Frame each in a fixed LIGHT "paper"
   card (both themes) so it reads as an intentional clipping from the manual
   instead of a jarring white block on the dark canvas. */
figure.takt-figure{margin:0;display:block;background:#f7f6f2;border:1px solid rgba(20,20,18,.1);border-radius:var(--takt-radius);padding:.5rem .5rem 0;box-shadow:0 1px 2px rgba(0,0,0,.05)}
figure.takt-figure img{width:100%;display:block;border-radius:var(--takt-radius-sm);cursor:zoom-in}
/* caption sits on the light card → fixed dark tones so it stays legible in dark mode */
figure.takt-figure figcaption{color:#6a6a66;border-top-color:rgba(20,20,18,.12)}
figure.takt-figure figcaption .fignum{color:#c2521a}
figure.takt-figure figcaption,.takt-mediacap{font-family:var(--takt-sans);font-size:.78rem;line-height:1.4;color:var(--takt-muted);
  margin-top:.55em;padding-top:.5em;border-top:1px solid var(--takt-border)}
figure.takt-figure figcaption .fignum{color:var(--takt-arc);font-weight:650}
figure.takt-figure[data-variant=inset]{float:right;width:min(42cqi,360px);margin:.2em 0 1em 1.6em}
figure.takt-figure[data-variant=lead] img{border-radius:var(--takt-radius)}
@container (max-width:560px){ figure.takt-figure[data-variant=inset]{float:none;width:100%;margin:1.2em 0} }

/* annotation overlay — EDITABLE marks (only when a figure has no printed
   numbers). Labels drag; boxes/arrows move + resize via handles. */
.takt-figwrap{position:relative;display:block;line-height:0}
svg.takt-anno{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.takt-anno-label{position:absolute;transform:translate(-50%,-128%);background:var(--takt-arc);color:#fff;font-family:var(--takt-sans);
  font-size:.64rem;font-weight:650;line-height:1.22;padding:.14em .44em;border-radius:6px;max-width:34cqi;text-align:center;cursor:grab;user-select:none;
  touch-action:none;box-shadow:0 1px 6px rgba(0,0,0,.35);z-index:2}
.takt-anno-label::after{content:"";position:absolute;left:50%;top:100%;transform:translateX(-50%);border:5px solid transparent;border-top-color:var(--takt-arc)}
.takt-anno-handle{position:absolute;width:13px;height:13px;border-radius:50%;background:#fff;border:2px solid var(--takt-arc);transform:translate(-50%,-50%);cursor:pointer;z-index:3;touch-action:none}

/* Legend — maps the figure's OWN printed callout numbers to descriptions
   (accurate; no guessed marks). Hovering a row highlights it. */
.takt-legend{list-style:none;margin:.8em 0 0;padding:0;display:grid;gap:.35em;font-size:.94rem;line-height:1.45}
.takt-legend li{display:grid;grid-template-columns:auto 1fr;gap:.6em;align-items:start;border-radius:8px;padding:.2em .35em;transition:background .12s}
.takt-legend li:hover{background:var(--takt-surface)}
.takt-legend .num{display:grid;place-items:center;width:1.55em;height:1.55em;border-radius:50%;border:1.5px solid var(--takt-arc);
  color:var(--takt-arc);font-family:var(--takt-sans);font-weight:700;font-size:.78rem;line-height:1;margin-top:.05em}
.takt-legend .d{color:var(--takt-muted)}

video.takt-video{width:100%;display:block;border-radius:var(--takt-radius-sm);background:#000}

/* 3D part reads as a MEDIA block (like a figure), not a button. */
.takt-model-tile{cursor:pointer;position:relative;display:grid;place-items:center;gap:.45em;min-height:172px;
  border:1px solid var(--takt-border);border-radius:var(--takt-radius-sm);background:var(--takt-surface);
  font-family:var(--takt-sans);color:var(--takt-muted);transition:border-color .15s,background .15s}
.takt-model-tile:hover{border-color:var(--takt-accent);background:var(--takt-surface-2)}
.takt-model-tile .badge{font-size:.64rem;text-transform:uppercase;letter-spacing:.12em;color:var(--takt-arc);font-weight:700}
.takt-model-tile .cap{font-weight:600;color:var(--takt-fg)}
.takt-model-tile .hint{font-size:.8rem}

button.takt-action{cursor:pointer;font-family:var(--takt-sans);font-weight:600;font-size:.92rem;color:#fff;background:var(--takt-accent);
  border:0;border-radius:var(--takt-radius-sm);padding:.6em 1.1em;margin:.3em .4em .3em 0;transition:filter .15s}
button.takt-action:hover{filter:brightness(1.08)}
button.takt-action[data-variant=secondary]{color:var(--takt-fg);background:var(--takt-surface-2);border:1px solid var(--takt-border)}
/* custom media elements are block-level so captions + margins flow correctly */
takt-figure,takt-video,takt-model{display:block}
/* charts/diagrams: sensible theme-aware defaults so a model SVG is never
   invisible or a black box even if it forgets to set colors. */
svg{max-width:100%;height:auto;color:var(--takt-fg)}
svg text{fill:var(--takt-muted);font-family:var(--takt-sans);font-size:12px}
svg .axis,svg line.axis{stroke:var(--takt-border)}
.takt-err{white-space:pre-wrap;color:var(--takt-danger);font-family:var(--takt-mono);font-size:12px;padding:14px}
`;

// ── The island runtime + postMessage bridge (inline; no external deps) ────────
const RUNTIME_JS = String.raw`
(function(){
  var root = document.getElementById('root');
  var pageCss = document.getElementById('page-css');
  function post(m){ m.__takt = true; parent.postMessage(m, '*'); }
  function applyTheme(t){ document.documentElement.classList.toggle('dark', t === 'dark'); }
  function postHeight(){ post({ type:'height', height: Math.ceil(document.body.scrollHeight) }); }
  new ResizeObserver(postHeight).observe(document.body);
  window.addEventListener('resize', function(){ postHeight(); });

  // The page runs in a SANDBOXED, opaque-origin iframe (allow-scripts, NO
  // allow-same-origin, CSP default-src 'none') — model JS is fully contained and
  // can't reach the app's DOM/cookies/storage. So we ALLOW <script> + inline
  // handlers: that's what makes live calculators/configurators actually compute.
  // We only drop nested frames + external <link> (CSP would block them anyway).
  function sanitize(html){
    return String(html)
      .replace(/<iframe[\s\S]*?<\/iframe>/gi,'')
      .replace(/<link\b[^>]*>/gi,'');
  }
  // innerHTML-injected <script> tags don't auto-run — re-create them so the
  // model's client-side logic (calculators, toggles, chart drawing) executes.
  function runScripts(container){
    container.querySelectorAll('script').forEach(function(old){
      var s = document.createElement('script');
      for(var i=0;i<old.attributes.length;i++){ s.setAttribute(old.attributes[i].name, old.attributes[i].value); }
      s.textContent = old.textContent;
      old.parentNode.replaceChild(s, old);
    });
  }

  // ── island custom elements ─────────────────────────────────────────────────
  function def(tag, build){ try{ customElements.define(tag, class extends HTMLElement{ connectedCallback(){ if(this.__b) return; this.__b=1; build(this); } }); }catch(e){} }

  def('takt-cite', function(el){
    var page = (el.getAttribute('page') || '').trim();
    var isNum = /^\d+$/.test(page);
    // Only a numeric page is a real, clickable manual page. A non-numeric value
    // (e.g. a web-sourced concept name) shows plainly WITHOUT the "p." prefix.
    var label = el.getAttribute('label') || (isNum ? 'p.' + page : (page || 'source'));
    var s = document.createElement('span'); s.className='takt-cite'; s.textContent=label;
    el.textContent=''; el.appendChild(s);
    if(isNum){ el.addEventListener('click', function(){ post({ type:'cite', page: Number(page), product: el.getAttribute('product')||null }); }); }
    else { el.style.cursor='default'; }
  });
  var SVGNS = 'http://www.w3.org/2000/svg';
  function toneColor(t){ return t==='ok'?'var(--takt-ok)':t==='warn'?'var(--takt-warn)':t==='danger'?'var(--takt-danger)':'var(--takt-arc)'; }
  function parseAnnos(s){ if(!s) return []; try{ var a = JSON.parse(s); return Array.isArray(a) ? a : []; }catch(e){ return []; } }
  function dragLabel(el, wrap){
    el.addEventListener('pointerdown', function(e){
      e.preventDefault(); el.setPointerCapture(e.pointerId); el.style.cursor='grabbing';
      function move(ev){ var r = wrap.getBoundingClientRect(); if(!r.width) return;
        el.style.left = Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100)) + '%';
        el.style.top  = Math.max(0, Math.min(100, ((ev.clientY - r.top)  / r.height) * 100)) + '%'; }
      function up(){ try{ el.releasePointerCapture(e.pointerId); }catch(x){} el.style.cursor='grab';
        el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); }
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    });
  }
  // Draw the agent's annotations over the image: boxes/arrows/redaction as SVG
  // (non-scaling stroke so it stays crisp), labels as draggable HTML (so text
  // isn't distorted by the non-uniform viewBox and the user can nudge them).
  function overlay(wrap, annos){
    var svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('class','takt-anno');
    svg.setAttribute('viewBox','0 0 100 100'); svg.setAttribute('preserveAspectRatio','none');
    var defs = document.createElementNS(SVGNS, 'defs');
    defs.innerHTML = '<marker id="tk-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" style="fill:var(--takt-arc)"/></marker>';
    svg.appendChild(defs);
    annos.forEach(function(a){
      if(a.kind==='box' || a.kind==='redact'){
        var r = document.createElementNS(SVGNS,'rect');
        r.setAttribute('x', a.x*100); r.setAttribute('y', a.y*100); r.setAttribute('width', a.w*100); r.setAttribute('height', a.h*100); r.setAttribute('rx','1.2');
        r.setAttribute('vector-effect','non-scaling-stroke');
        if(a.kind==='redact'){ r.style.fill='#111'; r.style.stroke='none'; }
        else { r.style.fill='none'; r.style.stroke = toneColor(a.tone); r.setAttribute('stroke-width','2.5'); }
        svg.appendChild(r);
      } else if(a.kind==='arrow'){
        var ln = document.createElementNS(SVGNS,'line');
        ln.setAttribute('x1', a.x1*100); ln.setAttribute('y1', a.y1*100); ln.setAttribute('x2', a.x2*100); ln.setAttribute('y2', a.y2*100);
        ln.style.stroke = 'var(--takt-arc)'; ln.setAttribute('stroke-width','2.5'); ln.setAttribute('vector-effect','non-scaling-stroke'); ln.setAttribute('marker-end','url(#tk-arrow)');
        svg.appendChild(ln);
      }
    });
    wrap.appendChild(svg);
    annos.forEach(function(a){
      var txt = a.label || (a.kind==='label' ? a.text : null); if(!txt) return;
      var lx, ly;
      if(a.kind==='arrow'){ lx=a.x1; ly=a.y1; }          // label sits at the arrow's tail
      else if(a.kind==='label'){ lx=a.x; ly=a.y; }
      else { lx=a.x + (a.w||0)/2; ly=a.y; }               // box: top-centre
      if(typeof lx!=='number' || typeof ly!=='number') return;
      // keep the (centered) label inside the figure so it never spills over the edge
      lx = Math.max(0.14, Math.min(0.86, lx));
      ly = Math.max(0.08, Math.min(0.94, ly));
      var d = document.createElement('div'); d.className='takt-anno-label'; d.textContent = txt;
      d.style.left = (lx*100)+'%'; d.style.top = (ly*100)+'%';
      dragLabel(d, wrap); wrap.appendChild(d);
    });
    // once laid out, push any labels that still overlap apart so they never stack
    requestAnimationFrame(function(){ deoverlap(wrap); });
  }
  // Separate overlapping annotation labels by nudging the lower one down a few
  // times — deterministic, so a cluttered set of callouts self-untangles.
  function deoverlap(wrap){
    var labels = [].slice.call(wrap.querySelectorAll('.takt-anno-label'));
    if(labels.length < 2) return;
    var wr = wrap.getBoundingClientRect(); if(!wr.height) return;
    for(var pass=0; pass<5; pass++){
      var moved = false;
      for(var i=0;i<labels.length;i++){ for(var j=i+1;j<labels.length;j++){
        var a=labels[i].getBoundingClientRect(), b=labels[j].getBoundingClientRect();
        if(a.right>b.left-6 && a.left<b.right+6 && a.bottom>b.top-6 && a.top<b.bottom+6){
          var lower = (a.top<=b.top) ? labels[j] : labels[i];
          var cur = parseFloat(lower.style.top)||0;
          lower.style.top = Math.min(97, cur + (Math.min(a.height,b.height)+9)/wr.height*100) + '%';
          moved = true;
        }
      }}
      if(!moved) break;
    }
  }
  // Legend under a figure — maps the figure's OWN printed callout numbers to
  // label+detail (accurate; no drawn marks). items: [{n,label,detail,cite}]
  function buildLegend(items){
    var ul = document.createElement('ul'); ul.className='takt-legend';
    items.forEach(function(it){
      var li = document.createElement('li');
      var num = document.createElement('span'); num.className='num'; num.textContent = (it.n!=null ? it.n : '•');
      var body = document.createElement('span');
      var b = document.createElement('b'); b.textContent = it.label || ''; body.appendChild(b);
      if(it.detail){ var d=document.createElement('span'); d.className='d'; d.textContent=' — '+it.detail; body.appendChild(d); }
      if(it.cite){ var c=document.createElement('span'); c.className='takt-cite'; c.style.marginLeft='.4em'; c.style.cursor='pointer'; c.textContent='p.'+it.cite; c.addEventListener('click', function(){ post({type:'cite', page:Number(it.cite)||0}); }); body.appendChild(c); }
      li.appendChild(num); li.appendChild(body); ul.appendChild(li);
    });
    return ul;
  }
  def('takt-figure', function(el){
    var src = el.getAttribute('src'); if(!src){ return; }
    var cap = el.getAttribute('caption');
    var fig = document.createElement('figure'); fig.className='takt-figure';
    var variant = el.getAttribute('variant'); if(variant){ fig.setAttribute('data-variant', variant); }
    var wrap = document.createElement('div'); wrap.className='takt-figwrap';
    var img = document.createElement('img'); img.src=src; img.alt = el.getAttribute('alt')||cap||'';
    img.addEventListener('click', function(){ post({ type:'lightbox', src: src, caption: cap||'' }); });   // click to zoom
    wrap.appendChild(img);
    var legend = parseAnnos(el.getAttribute('legend'));
    var annos = parseAnnos(el.getAttribute('annos'));
    // Draw our OWN marks ONLY when there's no legend (the figure has no printed
    // numbers to reference); otherwise the legend is the accurate source of truth.
    if(!legend.length && annos.length){ var draw = function(){ if(!wrap.querySelector('svg.takt-anno')) overlay(wrap, annos); postHeight(); }; if(img.complete) draw(); else { img.addEventListener('load', draw); img.addEventListener('error', draw); } }
    fig.appendChild(wrap);
    if(cap || el.getAttribute('fignum')){
      var fc=document.createElement('figcaption');
      var num=el.getAttribute('fignum');
      if(num){ var sp=document.createElement('span'); sp.className='fignum'; sp.textContent='Fig '+num+' · '; fc.appendChild(sp); }
      fc.appendChild(document.createTextNode(cap||''));
      fig.appendChild(fc);
    }
    if(legend.length){ fig.appendChild(buildLegend(legend)); }
    el.textContent=''; el.appendChild(fig);
  });
  def('takt-video', function(el){
    var src = el.getAttribute('src'); if(!src){ return; }
    var v = document.createElement('video'); v.className='takt-video'; v.controls=true; v.src=src; v.preload='metadata';
    var poster = el.getAttribute('poster'); if(poster) v.poster=poster;
    el.textContent=''; el.appendChild(v);
    var cap = el.getAttribute('caption');
    if(cap){ var fc=document.createElement('div'); fc.className='takt-mediacap'; fc.textContent=cap; el.appendChild(fc); }
  });
  def('takt-model', function(el){
    var src = el.getAttribute('src'); if(!src){ return; }
    var cap = el.getAttribute('caption') || '3D part';
    var t = document.createElement('div'); t.className='takt-model-tile';
    var badge=document.createElement('span'); badge.className='badge'; badge.textContent='3D model';
    var capEl=document.createElement('span'); capEl.className='cap'; capEl.textContent=cap;
    var hint=document.createElement('span'); hint.className='hint'; hint.textContent='Click to rotate';
    t.appendChild(badge); t.appendChild(capEl); t.appendChild(hint);
    el.textContent=''; el.appendChild(t);
    t.addEventListener('click', function(){ post({ type:'model', src: src, caption: cap }); });
  });
  def('takt-action', function(el){
    var label = el.getAttribute('label') || el.textContent || 'Submit';
    var b = document.createElement('button'); b.className='takt-action'; b.textContent=label;
    var v = el.getAttribute('variant'); if(v) b.setAttribute('data-variant', v);
    el.textContent=''; el.appendChild(b);
    b.addEventListener('click', function(){ post({ type:'action', id: el.getAttribute('id')||'action', value: el.getAttribute('value')||label }); });
  });

  // plain links open in the parent (new tab)
  root.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href]');
    if(a && a.getAttribute('href') && a.getAttribute('href')[0] !== '#'){ e.preventDefault(); post({ type:'link', url: a.href }); }
  });

  function render(html, css){
    pageCss.textContent = css || '';
    root.innerHTML = sanitize(html);
    try{ runScripts(root); }catch(e){}
    requestAnimationFrame(postHeight);
    setTimeout(postHeight, 250);
  }

  window.addEventListener('message', function(e){
    var d = e.data || {}; if(!d.__takt) return;
    if(d.type === 'theme'){ applyTheme(d.theme); return; }
    if(d.type === 'render'){ if(d.theme) applyTheme(d.theme); try{ render(d.html, d.css); }catch(err){ root.innerHTML = '<div class="takt-err">Canvas error: ' + (err && err.message ? err.message : err) + '</div>'; } }
  });
  post({ type:'ready' });
})();
`;

export function GET() {
  return new Response(buildHtml(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
