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
  --takt-maxcol:74ch;
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
  font-family:var(--takt-sans);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
.takt-page{container-type:inline-size;padding:clamp(20px,4cqi,56px);max-width:1400px;margin:0 auto}
img{max-width:100%;height:auto;display:block}

/* Type hierarchy — dramatic scale jumps (editorial), not additive weight. */
h1,.takt-display{font-family:var(--takt-serif);font-weight:600;line-height:1.05;letter-spacing:-.01em;
  font-size:clamp(2rem,5.2cqi,3.6rem);margin:0 0 .3em}
h2{font-family:var(--takt-serif);font-weight:600;line-height:1.12;font-size:clamp(1.4rem,3cqi,2.1rem);margin:1.6em 0 .5em;letter-spacing:-.01em}
h3{font-family:var(--takt-sans);font-weight:650;font-size:1.12rem;margin:1.4em 0 .4em;letter-spacing:.005em}
p,li{max-width:var(--takt-maxcol)}
p{margin:0 0 1em}
a{color:var(--takt-accent);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--takt-accent) 35%,transparent)}
strong{font-weight:650}
code{font-family:var(--takt-mono);font-size:.88em;background:var(--takt-surface);padding:.12em .38em;border-radius:5px}
hr{border:0;border-top:1px solid var(--takt-border);margin:2em 0}
.takt-eyebrow{font-family:var(--takt-sans);text-transform:uppercase;letter-spacing:.14em;font-size:.72rem;font-weight:650;color:var(--takt-arc);margin:0 0 .6em}
.takt-lead{font-size:1.15rem;color:var(--takt-muted);max-width:var(--takt-maxcol)}
blockquote,.takt-quote{font-family:var(--takt-serif);font-size:1.3rem;line-height:1.35;border-left:3px solid var(--takt-arc);
  margin:1.4em 0;padding:.1em 0 .1em 1em;color:var(--takt-fg)}

/* Layout primitives — the model composes real page structure with these. */
.takt-grid{display:grid;gap:clamp(16px,2.4cqi,32px)}
@container (min-width:640px){ .takt-cols-2{grid-template-columns:repeat(2,1fr)} .takt-cols-3{grid-template-columns:repeat(3,1fr)} }
@container (min-width:900px){ .takt-cols-4{grid-template-columns:repeat(4,1fr)} .takt-split{grid-template-columns:1.4fr 1fr} }
.takt-card{background:var(--takt-card);border:1px solid var(--takt-border);border-radius:var(--takt-radius);
  padding:clamp(16px,2cqi,24px);box-shadow:var(--takt-shadow)}
.takt-panel{background:var(--takt-surface);border:1px solid var(--takt-border);border-radius:var(--takt-radius);padding:clamp(16px,2cqi,24px)}

/* Info blocks */
.takt-callout{border:1px solid var(--takt-border);border-left-width:3px;border-radius:var(--takt-radius-sm);
  padding:.85em 1.1em;margin:1.2em 0;background:var(--takt-surface)}
.takt-callout[data-tone=warn]{border-left-color:var(--takt-warn);background:color-mix(in srgb,var(--takt-warn) 8%,var(--takt-card))}
.takt-callout[data-tone=danger]{border-left-color:var(--takt-danger);background:color-mix(in srgb,var(--takt-danger) 8%,var(--takt-card))}
.takt-callout[data-tone=ok]{border-left-color:var(--takt-ok);background:color-mix(in srgb,var(--takt-ok) 8%,var(--takt-card))}
.takt-callout[data-tone=tip]{border-left-color:var(--takt-accent);background:color-mix(in srgb,var(--takt-accent) 8%,var(--takt-card))}
.takt-stat{display:flex;flex-direction:column;gap:.15em}
.takt-stat .n{font-family:var(--takt-serif);font-size:clamp(1.8rem,4cqi,2.8rem);line-height:1;font-weight:600}
.takt-stat .l{font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:var(--takt-muted)}
table{border-collapse:collapse;width:100%;font-size:.94rem;margin:1.2em 0}
th,td{text-align:left;padding:.55em .7em;border-bottom:1px solid var(--takt-border)}
th{font-size:.76rem;text-transform:uppercase;letter-spacing:.06em;color:var(--takt-muted)}

/* Islands */
takt-cite{cursor:pointer}
.takt-cite{display:inline-flex;align-items:center;gap:.2em;vertical-align:baseline;font-family:var(--takt-sans);
  font-size:.72em;font-weight:600;color:var(--takt-accent);background:color-mix(in srgb,var(--takt-accent) 12%,transparent);
  border-radius:5px;padding:.05em .38em;margin:0 .12em;line-height:1.4;white-space:nowrap;user-select:none}
.takt-cite:hover{background:color-mix(in srgb,var(--takt-accent) 22%,transparent)}
figure.takt-figure{margin:1.4em 0}
figure.takt-figure img{width:100%;border-radius:var(--takt-radius-sm);border:1px solid var(--takt-border);background:var(--takt-surface)}
figure.takt-figure figcaption{font-size:.82rem;color:var(--takt-muted);margin-top:.5em;font-family:var(--takt-sans)}
.takt-media{position:relative;border-radius:var(--takt-radius-sm);overflow:hidden;border:1px solid var(--takt-border);background:var(--takt-surface-2)}
video.takt-video{width:100%;display:block;border-radius:var(--takt-radius-sm);border:1px solid var(--takt-border);background:#000}
.takt-model-tile{cursor:pointer;display:flex;align-items:center;gap:.7em;padding:.9em 1.1em;border:1px solid var(--takt-border);
  border-radius:var(--takt-radius-sm);background:var(--takt-surface);font-family:var(--takt-sans);font-weight:600;margin:1.2em 0;transition:border-color .15s}
.takt-model-tile:hover{border-color:var(--takt-accent)}
.takt-model-tile .badge{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#fff;background:var(--takt-arc);border-radius:5px;padding:.2em .5em}
button.takt-action{cursor:pointer;font-family:var(--takt-sans);font-weight:600;font-size:.92rem;color:#fff;background:var(--takt-accent);
  border:0;border-radius:var(--takt-radius-sm);padding:.6em 1.1em;margin:.3em .4em .3em 0;transition:filter .15s}
button.takt-action:hover{filter:brightness(1.08)}
button.takt-action[data-variant=secondary]{color:var(--takt-fg);background:var(--takt-surface-2);border:1px solid var(--takt-border)}
svg{max-width:100%;height:auto}
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

  // Strip anything executable from model HTML (belt — the sandbox is the real
  // boundary, but keep the DOM clean of scripts/handlers/framed content).
  function sanitize(html){
    return String(html)
      .replace(/<script[\s\S]*?<\/script>/gi,'')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi,'')
      .replace(/<link\b[^>]*>/gi,'')
      .replace(/ on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,'')
      .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi,'$1="#"');
  }

  // ── island custom elements ─────────────────────────────────────────────────
  function def(tag, build){ try{ customElements.define(tag, class extends HTMLElement{ connectedCallback(){ if(this.__b) return; this.__b=1; build(this); } }); }catch(e){} }

  def('takt-cite', function(el){
    var page = el.getAttribute('page') || '';
    var label = el.getAttribute('label') || ('p.' + page);
    var s = document.createElement('span'); s.className='takt-cite'; s.textContent=label;
    el.textContent=''; el.appendChild(s);
    el.addEventListener('click', function(){ post({ type:'cite', page: Number(page)||0, product: el.getAttribute('product')||null }); });
  });
  def('takt-figure', function(el){
    var src = el.getAttribute('src'); if(!src){ return; }
    var cap = el.getAttribute('caption');
    var fig = document.createElement('figure'); fig.className='takt-figure';
    var img = document.createElement('img'); img.src=src; img.alt = el.getAttribute('alt')||cap||'';
    fig.appendChild(img);
    if(cap){ var fc=document.createElement('figcaption'); fc.textContent=cap; fig.appendChild(fc); }
    el.textContent=''; el.appendChild(fig);
  });
  def('takt-video', function(el){
    var src = el.getAttribute('src'); if(!src){ return; }
    var v = document.createElement('video'); v.className='takt-video'; v.controls=true; v.src=src;
    var poster = el.getAttribute('poster'); if(poster) v.poster=poster;
    el.textContent=''; el.appendChild(v);
  });
  def('takt-model', function(el){
    var src = el.getAttribute('src'); if(!src){ return; }
    var cap = el.getAttribute('caption') || '3D part';
    var t = document.createElement('div'); t.className='takt-model-tile';
    t.innerHTML = '<span class="badge">3D</span><span>' + cap + '</span><span style="color:var(--takt-muted);font-weight:400">— tap to rotate</span>';
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
