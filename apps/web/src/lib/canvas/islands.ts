// Canvas island custom elements + selection runtime. Ported from the (deleted)
// canvas-host iframe's RUNTIME_JS. The canvas now renders DIRECTLY in the app
// document, so instead of postMessage the islands dispatch bubbling CustomEvents
// that Canvas.tsx bridges into the app (source modal, lightbox, 3D, actions,
// block selection). registerIslands() is idempotent.
//
// CustomEvent contract (all bubble + composed, dispatched at document):
//   takt:cite     {page:number, product:string|null}
//   takt:lightbox {src:string, caption:string}
//   takt:model    {src:string, caption:string}
//   takt:action   {id:string, value:string}
//   takt:select   {id:string, text:string}   (right-click → "Select this area")

const SVGNS = "http://www.w3.org/2000/svg";

function emit(el: Element, type: string, detail: unknown) {
  el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

function toneColor(t?: string) {
  return t === "ok" ? "var(--takt-ok)" : t === "warn" ? "var(--takt-warn)" : t === "danger" ? "var(--takt-danger)" : "var(--takt-arc)";
}
function parseAnnos(s: string | null): any[] {
  if (!s) return [];
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; }
}

function dragLabel(el: HTMLElement, wrap: HTMLElement) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault(); el.setPointerCapture(e.pointerId); el.style.cursor = "grabbing";
    const move = (ev: PointerEvent) => {
      const r = wrap.getBoundingClientRect(); if (!r.width) return;
      el.style.left = Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100)) + "%";
      el.style.top = Math.max(0, Math.min(100, ((ev.clientY - r.top) / r.height) * 100)) + "%";
    };
    const up = () => {
      try { el.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      el.style.cursor = "grab";
      el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move); el.addEventListener("pointerup", up);
  });
}

// Draw the agent's annotations over the image: boxes/arrows/redaction as SVG,
// labels as draggable HTML positioned in %.
function overlay(wrap: HTMLElement, annos: any[]) {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("class", "takt-anno");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  const defs = document.createElementNS(SVGNS, "defs");
  defs.innerHTML = '<marker id="tk-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" style="fill:var(--takt-arc)"/></marker>';
  svg.appendChild(defs);
  annos.forEach((a) => {
    if (a.kind === "box" || a.kind === "redact") {
      const r = document.createElementNS(SVGNS, "rect");
      r.setAttribute("x", String(a.x * 100)); r.setAttribute("y", String(a.y * 100));
      r.setAttribute("width", String(a.w * 100)); r.setAttribute("height", String(a.h * 100)); r.setAttribute("rx", "1.2");
      r.setAttribute("vector-effect", "non-scaling-stroke");
      if (a.kind === "redact") { r.style.fill = "#111"; r.style.stroke = "none"; }
      else { r.style.fill = "none"; r.style.stroke = toneColor(a.tone); r.setAttribute("stroke-width", "2.5"); }
      svg.appendChild(r);
    } else if (a.kind === "arrow") {
      const ln = document.createElementNS(SVGNS, "line");
      ln.setAttribute("x1", String(a.x1 * 100)); ln.setAttribute("y1", String(a.y1 * 100));
      ln.setAttribute("x2", String(a.x2 * 100)); ln.setAttribute("y2", String(a.y2 * 100));
      ln.style.stroke = "var(--takt-arc)"; ln.setAttribute("stroke-width", "2.5");
      ln.setAttribute("vector-effect", "non-scaling-stroke"); ln.setAttribute("marker-end", "url(#tk-arrow)");
      svg.appendChild(ln);
    }
  });
  wrap.appendChild(svg);
  annos.forEach((a) => {
    const txt = a.label || (a.kind === "label" ? a.text : null); if (!txt) return;
    let lx: number, ly: number;
    if (a.kind === "arrow") { lx = a.x1; ly = a.y1; }
    else if (a.kind === "label") { lx = a.x; ly = a.y; }
    else { lx = a.x + (a.w || 0) / 2; ly = a.y; }
    if (typeof lx !== "number" || typeof ly !== "number") return;
    lx = Math.max(0.14, Math.min(0.86, lx));
    ly = Math.max(0.08, Math.min(0.94, ly));
    const d = document.createElement("div"); d.className = "takt-anno-label"; d.textContent = txt;
    d.style.left = lx * 100 + "%"; d.style.top = ly * 100 + "%";
    dragLabel(d, wrap); wrap.appendChild(d);
  });
  requestAnimationFrame(() => deoverlap(wrap));
}

// Nudge overlapping annotation labels apart so they never stack.
function deoverlap(wrap: HTMLElement) {
  const labels = Array.prototype.slice.call(wrap.querySelectorAll(".takt-anno-label")) as HTMLElement[];
  if (labels.length < 2) return;
  const wr = wrap.getBoundingClientRect(); if (!wr.height) return;
  for (let pass = 0; pass < 5; pass++) {
    let moved = false;
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i]!.getBoundingClientRect(), b = labels[j]!.getBoundingClientRect();
        if (a.right > b.left - 6 && a.left < b.right + 6 && a.bottom > b.top - 6 && a.top < b.bottom + 6) {
          const lower = a.top <= b.top ? labels[j]! : labels[i]!;
          const cur = parseFloat(lower.style.top) || 0;
          lower.style.top = Math.min(97, cur + (Math.min(a.height, b.height) + 9) / wr.height * 100) + "%";
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

// Legend under a figure — maps the figure's OWN printed callout numbers to
// label+detail. items: [{n,label,detail,cite}]
function buildLegend(items: any[]): HTMLElement {
  const ul = document.createElement("ul"); ul.className = "takt-legend";
  items.forEach((it) => {
    const li = document.createElement("li");
    const num = document.createElement("span"); num.className = "num"; num.textContent = it.n != null ? String(it.n) : "•";
    const body = document.createElement("span");
    const b = document.createElement("b"); b.textContent = it.label || ""; body.appendChild(b);
    if (it.detail) { const d = document.createElement("span"); d.className = "d"; d.textContent = " — " + it.detail; body.appendChild(d); }
    if (it.cite) {
      const c = document.createElement("span"); c.className = "takt-cite";
      c.style.marginLeft = ".4em"; c.style.cursor = "pointer"; c.textContent = "p." + it.cite;
      c.addEventListener("click", () => emit(c, "takt:cite", { page: Number(it.cite) || 0, product: null }));
      body.appendChild(c);
    }
    li.appendChild(num); li.appendChild(body); ul.appendChild(li);
  });
  return ul;
}

// An island that BUILDS its replacement DOM synchronously on connect. We mark it
// __islandRendered so morphdom (onBeforeElChildrenUpdated) leaves its internal DOM
// alone on later stream frames — otherwise it'd re-inject the model's empty source
// and wipe the built <img>/<video>/tile.
function build(tag: string, fn: (el: HTMLElement) => void) {
  if (customElements.get(tag)) return;
  customElements.define(tag, class extends HTMLElement {
    private __b = false;
    connectedCallback() { if (this.__b) return; this.__b = true; fn(this); (this as any).__islandRendered = true; }
  });
}

function defineIslands() {
  build("takt-cite", (el) => {
    const page = (el.getAttribute("page") || "").trim();
    const isNum = /^\d+$/.test(page);
    const label = el.getAttribute("label") || (isNum ? "p." + page : page || "source");
    const s = document.createElement("span"); s.className = "takt-cite"; s.textContent = label;
    el.textContent = ""; el.appendChild(s);
    if (isNum) el.addEventListener("click", () => emit(el, "takt:cite", { page: Number(page), product: el.getAttribute("product") || null }));
    else (el as HTMLElement).style.cursor = "default";
  });

  build("takt-figure", (el) => {
    const src = el.getAttribute("src"); if (!src) return;
    const cap = el.getAttribute("caption");
    const fig = document.createElement("figure"); fig.className = "takt-figure";
    const variant = el.getAttribute("variant"); if (variant) fig.setAttribute("data-variant", variant);
    const wrap = document.createElement("div"); wrap.className = "takt-figwrap";
    const img = document.createElement("img"); img.src = src; img.alt = el.getAttribute("alt") || cap || "";
    img.addEventListener("click", () => emit(el, "takt:lightbox", { src, caption: cap || "" }));
    wrap.appendChild(img);
    const legend = parseAnnos(el.getAttribute("legend"));
    const annos = parseAnnos(el.getAttribute("annos"));
    if (!legend.length && annos.length) {
      const draw = () => { if (!wrap.querySelector("svg.takt-anno")) overlay(wrap, annos); };
      if (img.complete) draw(); else { img.addEventListener("load", draw); img.addEventListener("error", draw); }
    }
    fig.appendChild(wrap);
    if (cap || el.getAttribute("fignum")) {
      const fc = document.createElement("figcaption");
      const num = el.getAttribute("fignum");
      if (num) { const sp = document.createElement("span"); sp.className = "fignum"; sp.textContent = "Fig " + num + " · "; fc.appendChild(sp); }
      fc.appendChild(document.createTextNode(cap || ""));
      fig.appendChild(fc);
    }
    if (legend.length) fig.appendChild(buildLegend(legend));
    el.textContent = ""; el.appendChild(fig);
  });

  build("takt-video", (el) => {
    const src = el.getAttribute("src"); if (!src) return;
    const v = document.createElement("video"); v.className = "takt-video"; v.controls = true; v.src = src; v.preload = "metadata";
    const poster = el.getAttribute("poster"); if (poster) v.poster = poster;
    el.textContent = ""; el.appendChild(v);
    const cap = el.getAttribute("caption");
    if (cap) { const fc = document.createElement("div"); fc.className = "takt-mediacap"; fc.textContent = cap; el.appendChild(fc); }
  });

  build("takt-model", (el) => {
    const src = el.getAttribute("src"); if (!src) return;
    const cap = el.getAttribute("caption") || "3D part";
    const t = document.createElement("div"); t.className = "takt-model-tile";
    const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = "3D model";
    const capEl = document.createElement("span"); capEl.className = "cap"; capEl.textContent = cap;
    const hint = document.createElement("span"); hint.className = "hint"; hint.textContent = "Click to rotate";
    t.appendChild(badge); t.appendChild(capEl); t.appendChild(hint);
    el.textContent = ""; el.appendChild(t);
    t.addEventListener("click", () => emit(el, "takt:model", { src, caption: cap }));
  });

  build("takt-action", (el) => {
    const label = el.getAttribute("label") || el.textContent || "Submit";
    const b = document.createElement("button"); b.className = "takt-action"; b.textContent = label;
    const v = el.getAttribute("variant"); if (v) b.setAttribute("data-variant", v);
    el.textContent = ""; el.appendChild(b);
    b.addEventListener("click", () => emit(el, "takt:action", { id: el.getAttribute("id") || "action", value: el.getAttribute("value") || label }));
  });

  // takt-mermaid renders LATE — unlike the other islands its source is its streamed
  // TEXT (mermaid syntax), which morphdom updates until the stream settles. So it
  // observes its own text, debounces, and renders once the diagram is complete;
  // only then does it mark __islandRendered (freezing the rendered SVG).
  if (!customElements.get("takt-mermaid")) {
    customElements.define("takt-mermaid", class extends HTMLElement {
      private __done = false;
      private __timer: ReturnType<typeof setTimeout> | null = null;
      private __obs: MutationObserver | null = null;
      connectedCallback() {
        this.classList.add("takt-mermaid");
        const schedule = () => { if (this.__timer) clearTimeout(this.__timer); this.__timer = setTimeout(() => void this.paint(), 320); };
        this.__obs = new MutationObserver(schedule);
        this.__obs.observe(this, { childList: true, characterData: true, subtree: true });
        schedule();
      }
      disconnectedCallback() { this.__obs?.disconnect(); if (this.__timer) clearTimeout(this.__timer); }
      async paint() {
        if (this.__done) return;
        const src = (this.textContent || "").trim();
        if (src.length < 10 || !/\n/.test(src)) return; // wait for a complete-looking diagram
        try {
          const mermaid = (await import("mermaid")).default;
          const dark = document.documentElement.classList.contains("dark");
          mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "neutral", securityLevel: "strict", fontFamily: "ui-sans-serif, system-ui, sans-serif" });
          const id = "tm-" + Math.random().toString(36).slice(2);
          const { svg } = await mermaid.render(id, src);
          this.__done = true;
          (this as any).__islandRendered = true;
          this.__obs?.disconnect();
          this.innerHTML = svg;
        } catch {
          // partial/invalid syntax — leave the source text; a later mutation retries
        }
      }
    });
  }
}

// ── selection: right-click a top-level [data-takt-id] block → "Select this area"
// Installed once at document level; only acts inside a .takt-page.
let ctxMenu: HTMLElement | null = null;
let presel: HTMLElement | null = null;
function clearPresel() { if (presel) { presel.classList.remove("takt-preselect"); presel = null; } }
function closeMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } clearPresel(); }

/** Select (ring) a block and emit takt:select; null clears. Shared by the context
 *  menu and by agent-driven highlight. */
export function selectBlock(root: HTMLElement, block: HTMLElement | null, fromAgent = false) {
  const prev = root.querySelector(".takt-selected"); if (prev) prev.classList.remove("takt-selected");
  if (!block) { emit(root, "takt:select", { id: "", text: "" }); return; }
  block.classList.add("takt-selected");
  if (fromAgent && block.scrollIntoView) {
    try { block.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { block.scrollIntoView(); }
  }
  emit(block, "takt:select", { id: block.getAttribute("data-takt-id"), text: (block.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240) });
}

/** Ring + scroll a block by data-takt-id (canvas_highlight); empty clears. */
export function highlightBlock(root: HTMLElement, id: string) {
  let b: HTMLElement | null = null;
  if (id) { try { b = root.querySelector(`[data-takt-id="${id.replace(/"/g, '\\"')}"]`); } catch { /* bad selector */ } }
  selectBlock(root, b, true);
}

let selectionInstalled = false;
function installSelection() {
  if (selectionInstalled) return;
  selectionInstalled = true;
  document.addEventListener("click", closeMenu);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  document.addEventListener("contextmenu", (e) => {
    const target = e.target as Element | null;
    const root = target?.closest(".takt-page") as HTMLElement | null;
    if (!root) return;
    const block = target?.closest("[data-takt-id]") as HTMLElement | null;
    if (!block || !root.contains(block)) return;
    e.preventDefault(); closeMenu();
    const isSel = block.classList.contains("takt-selected");
    block.classList.add("takt-preselect"); presel = block;
    const m = document.createElement("div"); m.className = "takt-ctxmenu";
    m.addEventListener("click", (ev) => ev.stopPropagation());
    const item = document.createElement("button"); item.className = "takt-ctxitem";
    const dot = document.createElement("span"); dot.className = "dot"; item.appendChild(dot);
    item.appendChild(document.createTextNode(isSel ? "Deselect this area" : "Select this area"));
    item.addEventListener("click", (ev) => { ev.stopPropagation(); clearPresel(); selectBlock(root, isSel ? null : block); closeMenu(); });
    m.appendChild(item);
    document.body.appendChild(m);
    const mw = m.offsetWidth || 172, mh = m.offsetHeight || 40;
    m.style.left = Math.max(6, Math.min(e.clientX, window.innerWidth - mw - 6)) + "px";
    m.style.top = Math.max(6, Math.min(e.clientY, window.innerHeight - mh - 6)) + "px";
    ctxMenu = m;
  });
}

let registered = false;
export function registerIslands() {
  if (registered || typeof window === "undefined") return;
  registered = true;
  defineIslands();
  installSelection();
}
