// takt-frame-runtime.js — runs INSIDE the sandboxed canvas iframe.
// Served as a real same-origin asset (allowed by the app CSP's script-src 'self')
// and referenced with <script src="/takt-frame-runtime.js"> from the frame document.
// It is NOT part of the Next bundle — kept out on purpose so it isn't minified/
// transformed (an earlier inline-string version had its \d regex mangled by SWC).
//
// Responsibilities: auto-height the frame, sync theme, upgrade the island custom
// elements, and bridge island interactions (cite / lightbox / action / select) to
// the parent app via postMessage. The frame is opaque-origin (sandbox without
// allow-same-origin), so postMessage is the only channel. Mermaid is PRE-rendered
// in the parent; model-viewer is vendored same-origin.
(function () {
  "use strict";
  var M = { ready: "takt:ready", size: "takt:size", cite: "takt:cite", lightbox: "takt:lightbox", action: "takt:action", select: "takt:select", theme: "takt:theme", highlight: "takt:highlight", wheel: "takt:wheel" };
  function send(type, payload) { try { parent.postMessage(Object.assign({ __takt: 1, type: type }, payload || {}), "*"); } catch (e) {} }
  var MODELVIEWER_URL = "/vendor/model-viewer.min.js";
  var SVGNS = "http://www.w3.org/2000/svg";

  /* ---------- theme ---------- */
  function applyTheme(dark) { document.documentElement.classList.toggle("dark", !!dark); }

  /* ---------- auto-height ----------
     Measure body.scrollHeight (NOT documentElement.scrollHeight, which is floored at
     the iframe's own height and so can grow but never shrink — a feedback trap that
     leaves dead space on shorter re-renders). rAF-batched, 2px dead-band. */
  var lastH = -1, raf = 0;
  function measure() {
    raf = 0;
    var h = document.body ? document.body.scrollHeight : document.documentElement.scrollHeight;
    if (Math.abs(h - lastH) < 2) return;
    lastH = h; send(M.size, { h: h });
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(measure); }

  /* ---------- helpers ---------- */
  function toneColor(t) { return t === "ok" ? "var(--takt-ok)" : t === "warn" ? "var(--takt-warn)" : t === "danger" ? "var(--takt-danger)" : "var(--takt-arc)"; }
  function parseAnnos(s) { if (!s) return []; try { var a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function hashStr(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  var STL_GREY = [0.33, 0.35, 0.4];
  var PART_PALETTE = [[0.80, 0.33, 0.09], [0.10, 0.42, 0.45], [0.30, 0.34, 0.58], [0.58, 0.20, 0.26], [0.26, 0.42, 0.24], [0.46, 0.27, 0.50], [0.20, 0.30, 0.40], [0.68, 0.50, 0.12]];
  function isDefaultGrey(f) { return !!f && STL_GREY.every(function (c, i) { return Math.abs((f[i] || 0) - c) < 0.02; }); }
  function colorizeFlat(mv, key) {
    try {
      var mats = (mv && mv.model && mv.model.materials) || [];
      var color = PART_PALETTE[hashStr(key) % PART_PALETTE.length];
      for (var i = 0; i < mats.length; i++) {
        var pbr = mats[i] && mats[i].pbrMetallicRoughness; if (!pbr) continue;
        var textured = !!(pbr.baseColorTexture && pbr.baseColorTexture.texture);
        if (!textured && isDefaultGrey(pbr.baseColorFactor)) pbr.setBaseColorFactor([color[0], color[1], color[2], 1]);
      }
    } catch (e) {}
  }

  function dragLabel(el, wrap) {
    el.addEventListener("pointerdown", function (e) {
      e.preventDefault(); el.setPointerCapture(e.pointerId); el.style.cursor = "grabbing";
      function move(ev) { var r = wrap.getBoundingClientRect(); if (!r.width) return; el.style.left = Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100)) + "%"; el.style.top = Math.max(0, Math.min(100, ((ev.clientY - r.top) / r.height) * 100)) + "%"; }
      function up() { try { el.releasePointerCapture(e.pointerId); } catch (x) {} el.style.cursor = "grab"; el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); }
      el.addEventListener("pointermove", move); el.addEventListener("pointerup", up);
    });
  }
  function overlay(wrap, annos) {
    var svg = document.createElementNS(SVGNS, "svg"); svg.setAttribute("class", "takt-anno"); svg.setAttribute("viewBox", "0 0 100 100"); svg.setAttribute("preserveAspectRatio", "none");
    var defs = document.createElementNS(SVGNS, "defs");
    defs.innerHTML = '<marker id="tk-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" style="fill:var(--takt-arc)"/></marker>';
    svg.appendChild(defs);
    annos.forEach(function (a) {
      if (a.kind === "box" || a.kind === "redact") {
        var r = document.createElementNS(SVGNS, "rect"); r.setAttribute("x", String(a.x * 100)); r.setAttribute("y", String(a.y * 100)); r.setAttribute("width", String(a.w * 100)); r.setAttribute("height", String(a.h * 100)); r.setAttribute("rx", "1.2"); r.setAttribute("vector-effect", "non-scaling-stroke");
        if (a.kind === "redact") { r.style.fill = "#111"; r.style.stroke = "none"; } else { r.style.fill = "none"; r.style.stroke = toneColor(a.tone); r.setAttribute("stroke-width", "2.5"); }
        svg.appendChild(r);
      } else if (a.kind === "arrow") {
        var ln = document.createElementNS(SVGNS, "line"); ln.setAttribute("x1", String(a.x1 * 100)); ln.setAttribute("y1", String(a.y1 * 100)); ln.setAttribute("x2", String(a.x2 * 100)); ln.setAttribute("y2", String(a.y2 * 100)); ln.style.stroke = "var(--takt-arc)"; ln.setAttribute("stroke-width", "2.5"); ln.setAttribute("vector-effect", "non-scaling-stroke"); ln.setAttribute("marker-end", "url(#tk-arrow)"); svg.appendChild(ln);
      }
    });
    wrap.appendChild(svg);
    annos.forEach(function (a) {
      var txt = a.label || (a.kind === "label" ? a.text : null); if (!txt) return;
      var lx, ly; if (a.kind === "arrow") { lx = a.x1; ly = a.y1; } else if (a.kind === "label") { lx = a.x; ly = a.y; } else { lx = a.x + (a.w || 0) / 2; ly = a.y; }
      if (typeof lx !== "number" || typeof ly !== "number") return;
      lx = Math.max(0.14, Math.min(0.86, lx)); ly = Math.max(0.08, Math.min(0.94, ly));
      var d = document.createElement("div"); d.className = "takt-anno-label"; d.textContent = txt; d.style.left = lx * 100 + "%"; d.style.top = ly * 100 + "%"; dragLabel(d, wrap); wrap.appendChild(d);
    });
    requestAnimationFrame(function () { deoverlap(wrap); });
  }
  function deoverlap(wrap) {
    var labels = Array.prototype.slice.call(wrap.querySelectorAll(".takt-anno-label")); if (labels.length < 2) return;
    var wr = wrap.getBoundingClientRect(); if (!wr.height) return;
    for (var pass = 0; pass < 5; pass++) {
      var moved = false;
      for (var i = 0; i < labels.length; i++) for (var j = i + 1; j < labels.length; j++) {
        var a = labels[i].getBoundingClientRect(), b = labels[j].getBoundingClientRect();
        if (a.right > b.left - 6 && a.left < b.right + 6 && a.bottom > b.top - 6 && a.top < b.bottom + 6) {
          var lower = a.top <= b.top ? labels[j] : labels[i]; var cur = parseFloat(lower.style.top) || 0;
          lower.style.top = Math.min(97, cur + (Math.min(a.height, b.height) + 9) / wr.height * 100) + "%"; moved = true;
        }
      }
      if (!moved) break;
    }
  }
  function buildLegend(items) {
    var ul = document.createElement("ul"); ul.className = "takt-legend";
    items.forEach(function (it) {
      var li = document.createElement("li");
      var num = document.createElement("span"); num.className = "num"; num.textContent = it.n != null ? String(it.n) : "•";
      var body = document.createElement("span");
      var b = document.createElement("b"); b.textContent = it.label || ""; body.appendChild(b);
      if (it.detail) { var d = document.createElement("span"); d.className = "d"; d.textContent = " — " + it.detail; body.appendChild(d); }
      if (it.cite) { var c = document.createElement("span"); c.className = "takt-cite"; c.style.marginLeft = ".4em"; c.style.cursor = "pointer"; c.textContent = "p." + it.cite; c.addEventListener("click", function () { send(M.cite, { page: Number(it.cite) || 0, product: null }); }); body.appendChild(c); }
      li.appendChild(num); li.appendChild(body); ul.appendChild(li);
    });
    return ul;
  }

  /* ---------- islands (upgrade once; the document loads complete, no morphdom) ---------- */
  // The runtime is inlined in <head>, so connectedCallback fires at the OPEN tag,
  // before the element's children/text exist (a <takt-action>'s label text isn't
  // parsed yet). Defer the upgrade to DOMContentLoaded while the doc is loading.
  function define(tag, fn) { if (customElements.get(tag)) return; customElements.define(tag, class extends HTMLElement { connectedCallback() { if (this.__b) return; this.__b = true; var el = this; if (document.readyState === "loading") addEventListener("DOMContentLoaded", function () { fn(el); }); else fn(el); } }); }

  function defineIslands() {
    define("takt-cite", function (el) {
      var page = (el.getAttribute("page") || "").trim(); var isNum = /^[0-9]+$/.test(page);
      var label = el.getAttribute("label") || (isNum ? "p." + page : page || "source");
      var s = document.createElement("span"); s.className = "takt-cite"; s.textContent = label; el.textContent = ""; el.appendChild(s);
      if (isNum) el.addEventListener("click", function () { send(M.cite, { page: Number(page), product: el.getAttribute("product") || null }); }); else el.style.cursor = "default";
    });
    define("takt-figure", function (el) {
      var src = el.getAttribute("src"); if (!src) return; var cap = el.getAttribute("caption");
      var fig = document.createElement("figure"); fig.className = "takt-figure";
      var variant = el.getAttribute("variant"); if (variant) fig.setAttribute("data-variant", variant);
      var wrap = document.createElement("div"); wrap.className = "takt-figwrap";
      var img = document.createElement("img"); img.src = src; img.alt = el.getAttribute("alt") || cap || "";
      img.addEventListener("click", function () { send(M.lightbox, { src: src, caption: cap || "" }); });
      img.addEventListener("load", schedule); img.addEventListener("error", schedule);
      wrap.appendChild(img);
      var legend = parseAnnos(el.getAttribute("legend")); var annos = parseAnnos(el.getAttribute("annos"));
      if (!legend.length && annos.length) { var draw = function () { if (!wrap.querySelector("svg.takt-anno")) overlay(wrap, annos); }; if (img.complete) draw(); else { img.addEventListener("load", draw); img.addEventListener("error", draw); } }
      fig.appendChild(wrap);
      if (cap || el.getAttribute("fignum")) { var fc = document.createElement("figcaption"); var num = el.getAttribute("fignum"); if (num) { var sp = document.createElement("span"); sp.className = "fignum"; sp.textContent = "Fig " + num + " · "; fc.appendChild(sp); } fc.appendChild(document.createTextNode(cap || "")); fig.appendChild(fc); }
      if (legend.length) fig.appendChild(buildLegend(legend));
      el.textContent = ""; el.appendChild(fig);
    });
    define("takt-video", function (el) {
      var src = el.getAttribute("src"); if (!src) return;
      var v = document.createElement("video"); v.className = "takt-video"; v.controls = true; v.src = src; v.preload = "metadata";
      var poster = el.getAttribute("poster"); if (poster) v.poster = poster;
      v.addEventListener("loadedmetadata", schedule); el.textContent = ""; el.appendChild(v);
      var cap = el.getAttribute("caption"); if (cap) { var fc = document.createElement("div"); fc.className = "takt-mediacap"; fc.textContent = cap; el.appendChild(fc); }
    });
    define("takt-model", function (el) {
      var src = el.getAttribute("src"); if (!src) return; var cap = el.getAttribute("caption") || ""; el.textContent = "";
      var wrap = document.createElement("div"); wrap.className = "takt-model-view";
      var status = document.createElement("div"); status.className = "takt-model-status"; status.textContent = "Loading 3D model…"; wrap.appendChild(status); el.appendChild(wrap);
      if (cap) { var fc = document.createElement("div"); fc.className = "takt-mediacap"; fc.textContent = cap; el.appendChild(fc); }
      import(MODELVIEWER_URL).then(function () {
        var mv = document.createElement("model-viewer");
        var A = { src: src, alt: cap || "3D model", "camera-controls": "", "auto-rotate": "", "auto-rotate-delay": "600", "rotation-per-second": "18deg", "interaction-prompt": "none", "environment-image": "neutral", "tone-mapping": "aces", "shadow-intensity": "1.1", "shadow-softness": "0.9", exposure: "1.15", "touch-action": "pan-y", loading: "eager" };
        for (var k in A) mv.setAttribute(k, A[k]);
        mv.style.width = "100%"; mv.style.height = "100%"; mv.style.background = "var(--takt-surface)"; mv.style.borderRadius = "10px";
        mv.addEventListener("load", function () { colorizeFlat(mv, src); });
        mv.addEventListener("error", function () { status.style.display = ""; status.textContent = "Couldn’t load this 3D part."; });
        var hint = document.createElement("div"); hint.className = "takt-model-hint"; hint.textContent = "drag to rotate · scroll to zoom";
        wrap.replaceChildren(mv, hint); schedule();
      }).catch(function () { status.textContent = "Couldn’t load the 3D viewer."; });
    });
    define("takt-action", function (el) {
      var label = el.getAttribute("label") || el.textContent || "Submit";
      var b = document.createElement("button"); b.className = "takt-action"; b.textContent = label;
      var v = el.getAttribute("variant"); if (v) b.setAttribute("data-variant", v); el.textContent = ""; el.appendChild(b);
      b.addEventListener("click", function () { send(M.action, { id: el.getAttribute("id") || "action", value: el.getAttribute("value") || label }); });
    });
    /* mermaid is PRE-rendered in the parent (already inline SVG); nothing to upgrade. */
  }

  /* ---------- selection: right-click a [data-takt-id] block ---------- */
  var ctxMenu = null, presel = null;
  function clearPresel() { if (presel) { presel.classList.remove("takt-preselect"); presel = null; } }
  function closeMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } clearPresel(); }
  function selectBlock(block, fromParent) {
    var prev = document.querySelector(".takt-selected"); if (prev) prev.classList.remove("takt-selected");
    if (!block) { send(M.select, { id: "", text: "" }); return; }
    block.classList.add("takt-selected");
    if (fromParent && block.scrollIntoView) { try { block.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { block.scrollIntoView(); } }
    send(M.select, { id: block.getAttribute("data-takt-id"), text: (block.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240) });
  }
  function installSelection() {
    document.addEventListener("click", closeMenu);
    window.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
    document.addEventListener("contextmenu", function (e) {
      var target = e.target; var root = target && target.closest ? target.closest(".takt-page") : null; if (!root) return;
      var block = target.closest("[data-takt-id]"); if (!block || !root.contains(block)) return;
      e.preventDefault(); closeMenu();
      var isSel = block.classList.contains("takt-selected"); block.classList.add("takt-preselect"); presel = block;
      var m = document.createElement("div"); m.className = "takt-ctxmenu"; m.addEventListener("click", function (ev) { ev.stopPropagation(); });
      var item = document.createElement("button"); item.className = "takt-ctxitem";
      var dot = document.createElement("span"); dot.className = "dot"; item.appendChild(dot);
      item.appendChild(document.createTextNode(isSel ? "Deselect this area" : "Select this area"));
      item.addEventListener("click", function (ev) { ev.stopPropagation(); clearPresel(); selectBlock(isSel ? null : block, false); closeMenu(); });
      m.appendChild(item); document.body.appendChild(m);
      var mw = m.offsetWidth || 172, mh = m.offsetHeight || 40;
      m.style.left = Math.max(6, Math.min(e.clientX, window.innerWidth - mw - 6)) + "px";
      m.style.top = Math.max(6, Math.min(e.clientY, window.innerHeight - mh - 6)) + "px"; ctxMenu = m;
    });
  }
  function highlight(id) {
    var b = null; if (id) { try { b = document.querySelector('[data-takt-id="' + String(id).replace(/"/g, '\\"') + '"]'); } catch (e) {} }
    selectBlock(b, true);
  }

  /* ---------- wheel forwarding ----------
     The frame auto-heights so its document never scrolls — but wheel events over a
     cross-origin iframe do NOT chain to the parent, which makes scrolling die over
     the canvas ("scroll twice" bug). Forward deltas up unless an element INSIDE the
     frame (an overflow-x table, a zoomed model-viewer) can consume the gesture. */
  addEventListener("wheel", function (e) {
    var el = e.target instanceof Element ? e.target : null;
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.tagName === "MODEL-VIEWER") return; // scroll-to-zoom owns the wheel
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
        var st = getComputedStyle(el);
        if (/(auto|scroll)/.test(st.overflowY + st.overflowX)) return;
      }
      el = el.parentElement;
    }
    send(M.wheel, { dx: e.deltaX, dy: e.deltaY });
  }, { passive: true });

  /* ---------- inbound messages from parent ---------- */
  addEventListener("message", function (e) {
    if (e.source !== parent) return; var d = e.data; if (!d || typeof d !== "object") return;
    if (d.type === M.theme) { applyTheme(d.dark); schedule(); }
    else if (d.type === M.highlight) { highlight(d.id || ""); }
  });

  /* ---------- boot ---------- */
  defineIslands(); installSelection();
  var ro = new ResizeObserver(schedule); ro.observe(document.documentElement);
  // The runtime is inlined in <head>, so body may not exist yet — observe it when it does.
  if (document.body) ro.observe(document.body);
  else addEventListener("DOMContentLoaded", function () { if (document.body) ro.observe(document.body); schedule(); });
  addEventListener("load", schedule); if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule).catch(function () {});
  schedule(); send(M.ready, {});
})();
