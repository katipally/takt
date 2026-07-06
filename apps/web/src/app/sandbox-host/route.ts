export const runtime = "nodejs";

// Sandboxed iframe host for Sandbox nodes. Loaded with sandbox="allow-scripts"
// (NO allow-same-origin) so bundled model code runs but can't touch app cookies/
// DOM/storage. The parent posts ALREADY-BUNDLED JS (from /api/sandbox) — there is
// NO CDN, NO import map, NO Babel here. A strict CSP blocks all external egress;
// only inline scripts (the bundle) + own-origin images/data: are allowed.
function buildHtml() {
  const appOrigin = (() => {
    try { return new URL(process.env.WEB_PUBLIC_URL ?? "http://localhost:3000").origin; }
    catch { return "http://localhost:3000"; }
  })();
  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval'",
    "style-src 'unsafe-inline'",
    `img-src 'self' data: blob: ${appOrigin}`,
    "font-src data:",
  ].join("; ");
  return `<!doctype html><html><head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="${csp}"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  :root{--takt-bg:#fff;--takt-fg:#1a1a18;--takt-muted:#6a6a66;--takt-border:rgba(0,0,0,.1);--takt-card:#fff;--takt-surface:#f5f4f1;--takt-accent:#2f6fed;--takt-arc:#e2701f;--takt-danger:#dc2626;--takt-radius:12px;}
  .dark{--takt-bg:#141416;--takt-fg:#fafafa;--takt-muted:#a1a1aa;--takt-border:rgba(255,255,255,.09);--takt-card:#1a1a1d;--takt-surface:#202024;--takt-accent:#5b9dff;--takt-arc:#ff8a3d;--takt-danger:#fa423e;}
  *{box-sizing:border-box}
  html,body{margin:0;height:auto;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:var(--takt-bg);color:var(--takt-fg);-webkit-font-smoothing:antialiased}
  #root{padding:16px}
  #root img{max-width:100%;height:auto}
  .takt-err{white-space:pre-wrap;color:var(--takt-danger);font-family:ui-monospace,monospace;font-size:12px;padding:14px}
</style></head><body>
<div id="root"></div>
<script>
  var root = document.getElementById('root');
  function applyTheme(t){ document.documentElement.classList.toggle('dark', t==='dark'); }
  function postHeight(){ parent.postMessage({ __takt:true, type:'height', height: Math.ceil(root.getBoundingClientRect().height)+32 }, '*'); }
  new ResizeObserver(postHeight).observe(root);
  function run(js){
    try { (0,eval)(js); }
    catch(e){ root.innerHTML = '<div class="takt-err">Sandbox error:\\n'+(e&&e.message?e.message:e)+'</div>'; }
    requestAnimationFrame(postHeight);
  }
  window.addEventListener('message', function(e){
    var d = e.data||{}; if(!d.__takt) return;
    if(d.type==='theme'){ applyTheme(d.theme); return; }
    if(d.type==='render'){ if(d.theme) applyTheme(d.theme); run(d.js); }
  });
  parent.postMessage({ __takt:true, type:'ready' }, '*');
</script></body></html>`;
}

export function GET() {
  return new Response(buildHtml(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
