// kaizen's annotator, the script the board's proxy adds to a framed page (cli/annotate-proxy.ts).
// Plain JS, no dependencies, nothing else loaded. It lets the user pick an element, text, several
// elements or an area, write a note and see numbered markers. It never changes the page except for
// its own overlay (and Pause). It talks to the board only by postMessage, signed with the per-open
// token in its own URL; the board keeps the notes and decides what to do with them.
(() => {
  // Framed by the board, or the desktop app's Browser tab (a <webview>, where the page has no parent
  // and the app's preload sets __kzHost and relays the messages).
  const hosted = window.parent !== window || window.__kzHost === true;
  if (window.__kzAnnotate || !hosted) return;
  window.__kzAnnotate = true;
  const script = document.currentScript;
  // The proxy's <script src="…?t=token">, or (desktop app, public site) the token the board set
  // before running this script in the page.
  let token = typeof window.__kzAnnToken === "string" ? window.__kzAnnToken : "";
  if (!token) try { token = new URL(script.src).searchParams.get("t") || ""; } catch {}
  const parent = window.parent;
  // `out` marks what the page says, so the webview's relay forwards it and not what the board sends.
  const send = (m) => parent.postMessage({ kz: 1, t: token, out: 1, ...m }, "*");

  const cfg = { on: false, mode: "element", hide: false, block: true, color: "#3c82f7", components: true };
  let marks = [];      // notes the board has: { n, kind, selector, items, pb, page }
  let draft = null;    // the pick the composer is open for
  let multi = [];      // elements ticked in multi mode
  let drag = null;     // area drag in progress
  let paused = false, pausedAnims = [], pausedMedia = [], held = [];

  // ---- pause: CSS animations and transitions, media, and requestAnimationFrame loops ----
  const raf0 = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => (paused ? (held.push(cb), held.length) : raf0(cb));
  const freeze = document.createElement("style");
  freeze.textContent = "*,*::before,*::after{animation-play-state:paused!important;transition:none!important}";
  function setPause(p) {
    if (p === paused) return;
    paused = p;
    if (p) {
      document.documentElement.append(freeze);
      try { pausedAnims = document.getAnimations().filter((a) => a.playState === "running"); pausedAnims.forEach((a) => a.pause()); } catch {}
      pausedMedia = [...document.querySelectorAll("video,audio")].filter((v) => !v.paused);
      pausedMedia.forEach((v) => v.pause());
    } else {
      freeze.remove();
      pausedAnims.forEach((a) => { try { a.play(); } catch {} });
      pausedMedia.forEach((v) => v.play().catch(() => {}));
      pausedAnims = []; pausedMedia = [];
      held.splice(0).forEach((cb) => raf0(cb));
    }
  }

  // ---- naming an element: a selector that finds exactly it, a path, source and component ----
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, "\\$&"));
  const uniq = (sel) => { try { return document.querySelectorAll(sel).length === 1; } catch { return false; } };
  const goodClass = (c) => c.length < 24 && !/\d{3,}|^css-|^_|^sc-|^jsx-/.test(c);
  function selectorFor(el) {
    if (el.id && uniq("#" + esc(el.id))) return "#" + esc(el.id);
    const t = el.getAttribute("data-testid");
    if (t && uniq(`[data-testid="${t.replace(/"/g, '\\"')}"]`)) return `[data-testid="${t.replace(/"/g, '\\"')}"]`;
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      let seg = n.tagName.toLowerCase();
      if (n.id) { parts.unshift("#" + esc(n.id)); if (uniq(parts.join(" > "))) break; parts.shift(); }
      const cls = [...n.classList].filter(goodClass).slice(0, 2);
      if (cls.length) seg += cls.map((c) => "." + esc(c)).join("");
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      if (same.length > 1 && !(cls.length && n.parentElement.querySelectorAll(":scope > " + seg).length === 1)) seg += `:nth-of-type(${same.indexOf(n) + 1})`;
      parts.unshift(seg);
      if (uniq(parts.join(" > "))) break;
    }
    return parts.join(" > ");
  }
  const pathOf = (el) => { const p = []; for (let n = el; n && n.nodeType === 1; n = n.parentElement) p.unshift(n.tagName.toLowerCase() + (n.id ? "#" + n.id : "")); return p.join(" > "); };
  const describe = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + [...el.classList].filter(goodClass).slice(0, 2).map((c) => "." + c).join("");
  const textOf = (el) => (el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("alt") || "").replace(/\s+/g, " ").trim();
  const ATTRS = ["id", "class", "role", "aria-label", "href", "type", "name", "placeholder", "alt", "data-testid"];
  const attrsOf = (el) => ATTRS.filter((a) => el.hasAttribute(a)).map((a) => `${a}="${el.getAttribute(a).slice(0, 80)}"`).join(" ");
  const STYLES = ["color", "background-color", "font-family", "font-size", "font-weight", "line-height", "padding", "margin", "display", "position", "border-radius", "width", "height"];
  const stylesOf = (el) => { const s = getComputedStyle(el); return STYLES.map((p) => `${p}: ${s.getPropertyValue(p)}`).join("; "); };

  // Where a dev build says an element came from: Astro, React (fibre), Vue 2/3, Svelte.
  function sourceOf(el) {
    let source = "";
    const names = [];
    for (let n = el, i = 0; n && n.nodeType === 1 && i < 14; n = n.parentElement, i++) {
      const af = n.getAttribute("data-astro-source-file");
      if (af && !source) source = af + (n.getAttribute("data-astro-source-loc") ? ":" + n.getAttribute("data-astro-source-loc").replace(/:/, ":") : "");
      const sv = n.__svelte_meta && n.__svelte_meta.loc;
      if (sv && !source) source = `${sv.file}:${sv.line}`;
      const vue = n.__vueParentComponent;
      for (let c = vue, j = 0; c && j < 6; c = c.parent, j++) {
        const nm = c.type && (c.type.name || c.type.__name);
        if (nm && !names.includes(nm)) names.push(nm);
        if (c.type && c.type.__file && !source) source = c.type.__file;
      }
      if (n.__vue__ && n.__vue__.$options) { const o = n.__vue__.$options; if (o.name && !names.includes(o.name)) names.push(o.name); if (o.__file && !source) source = o.__file; }
      const fk = Object.keys(n).find((k) => k.startsWith("__reactFiber$"));
      if (fk) {
        for (let f = n[fk], j = 0; f && j < 40; f = f.return, j++) {
          if (f._debugSource && !source) source = `${f._debugSource.fileName}:${f._debugSource.lineNumber}`;
          const t = f.type;
          if (typeof t === "function" || (t && typeof t === "object")) {
            const nm = (t.displayName || t.name || (t.render && t.render.name)) || "";
            if (nm && !names.includes(nm) && names.length < 8) names.push(nm);
          }
        }
      }
      if (source && names.length) break;
    }
    return { source, components: names.reverse().join(" > ") };
  }

  // ---- the overlay (closed shadow root, so the page's CSS and scripts cannot touch it) ----
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    *{box-sizing:border-box;font:12px/1.4 system-ui,sans-serif}
    .b{position:fixed;pointer-events:none;border:2px solid var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);border-radius:2px}
    .b.mk{border-width:1.5px;border-style:dashed;background:color-mix(in srgb,var(--c) 6%,transparent)}.b.mk.on{border-style:solid;background:color-mix(in srgb,var(--c) 14%,transparent)}
    .b.g{--c:#34c759}.b.sel{border-style:dashed}
    .l{position:fixed;pointer-events:none;background:var(--c);color:#fff;padding:1px 6px;border-radius:3px;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis}
    .m{position:fixed;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:var(--c);color:#fff;font-weight:600;border:2px solid #fff;display:grid;place-items:center;pointer-events:auto;cursor:pointer;box-shadow:0 1px 4px #0006}
    .m.g{background:#34c759}
    .c{position:fixed;width:320px;background:#1c1c1e;color:#f2f2f7;border:1px solid #2c2c2e;border-radius:14px;padding:12px;pointer-events:auto;box-shadow:0 12px 36px #000a}
    .c code{display:block;font:12px/1.4 system-ui,sans-serif;color:#98989f;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .c textarea{display:block;width:100%;height:68px;resize:none;background:#262628;color:inherit;border:1px solid #3a3a3c;border-radius:9px;padding:8px 10px;outline:0}
    .c textarea:focus{border-color:#5a5a5e}
    .c .r{display:flex;gap:6px;margin-top:10px;align-items:center;min-width:0}
    .c select{flex:none;width:76px;background:none;color:#98989f;border:1px solid #3a3a3c;border-radius:999px;padding:3px 4px;font-size:11px;text-overflow:ellipsis}
    .c button{flex:none;background:none;color:#98989f;border:0;border-radius:999px;padding:6px 8px;cursor:pointer}
    .c button:hover{color:#f2f2f7}
    .c button.go,.p button{background:#f59e0b;color:#1c1c1e;font-weight:600;padding:6px 14px}
    .c button.go:hover,.p button:hover{background:#fbb02d;color:#1c1c1e}
    .p button{border:0;border-radius:999px;cursor:pointer;padding:5px 14px}
    .t{position:fixed;width:260px;background:#1c1c1e;color:#f2f2f7;border:1px solid #2c2c2e;border-radius:12px;padding:8px 12px;pointer-events:none;box-shadow:0 8px 28px #0008;white-space:pre-wrap;word-break:break-word}
    .t small{display:block;color:#98989f;margin-top:4px}
    .p{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#1c1c1e;color:#f2f2f7;border:1px solid #2c2c2e;border-radius:999px;padding:6px 8px 6px 16px;pointer-events:auto;display:flex;gap:8px;align-items:center}
  </style><div id="o"></div>`;
  const layer = root.getElementById("o");
  layer.style.setProperty("--c", cfg.color);
  const mount = () => document.documentElement.append(host);
  mount();

  const el = (cls, css, text) => { const d = document.createElement("div"); d.className = cls; if (css) d.style.cssText = css; if (text) d.textContent = text; return d; };
  const box = (r, cls = "b") => el(cls, `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`);
  const union = (rs) => { const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top)), rr = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom)); return { left: l, top: t, right: rr, bottom: b, width: rr - l, height: b - t }; };

  let hov = null, tip = null;
  function paint() {
    layer.querySelectorAll(".dyn").forEach((n) => n.remove());
    layer.style.setProperty("--c", cfg.color);
    const add = (n) => (n.classList.add("dyn"), layer.append(n));
    if (cfg.on && !draft && hov && (cfg.mode === "element" || cfg.mode === "multi")) {
      const r = hov.getBoundingClientRect();
      add(box(r));
      add(el("l", `left:${Math.max(0, r.left)}px;top:${Math.max(0, r.top - 20)}px`, describe(hov)));
    }
    for (const m of multi) add(box(m.getBoundingClientRect(), "b g sel"));
    if (drag) add(box(rectOf(drag), "b g sel"));
    if (draft) add(box(draft.rect, "b" + (draft.els.length > 1 || draft.kind === "area" ? " g" : "")));
    if (multi.length && !draft) {
      const p = el("p dyn");
      p.append(`${multi.length} selected`);
      const bt = document.createElement("button"); bt.textContent = "Add note"; bt.onclick = commitMulti; p.append(bt);
      layer.append(p);
    }
    if (!cfg.hide) {
      marks.forEach((m) => {
        if (m.page && m.page !== location.pathname) return;
        let r = null;
        try { const e = m.kind === "area" ? null : document.querySelector(m.items && m.items[0] ? m.items[0] : m.selector); if (e) r = e.getBoundingClientRect(); } catch {}
        if (!r && m.pb) r = { left: m.pb.x - scrollX, top: m.pb.y - scrollY, width: m.pb.w, height: m.pb.h };
        if (!r) return;
        // What the note marks stays outlined (dashed; solid while its number is hovered), not only its number.
        add(box(r, "b mk" + (m.kind === "multi" || m.kind === "area" ? " g" : "") + (tip === m ? " on" : "")));
        const d = el("m dyn" + (m.kind === "multi" || m.kind === "area" ? " g" : ""), `left:${Math.min(innerWidth - 12, r.left + r.width)}px;top:${Math.max(12, r.top)}px`, String(m.n));
        d.onclick = (e) => { e.stopPropagation(); send({ type: "marker", n: m.n }); };
        d.onmouseenter = () => { tip = m; paint(); };
        d.onmouseleave = () => { tip = null; paint(); };
        add(d);
        // the comment sits under its block, as in Agentation
        if (tip === m && m.comment && !draft) {
          const t = el("t", `left:${Math.max(8, Math.min(innerWidth - 268, r.left))}px;top:${Math.min(r.top + r.height + 8, innerHeight - 90)}px`);
          t.append(String(m.comment).slice(0, 600));
          const sm = document.createElement("small"); sm.textContent = `${m.intent || ""} · ${m.severity || ""}`; t.append(sm);
          add(t);
        }
      });
    }
  }
  const rectOf = (d) => { const l = Math.min(d.x0, d.x1), t = Math.min(d.y0, d.y1); return { left: l, top: t, width: Math.abs(d.x1 - d.x0), height: Math.abs(d.y1 - d.y0), right: l + Math.abs(d.x1 - d.x0), bottom: t + Math.abs(d.y1 - d.y0) }; };

  // ---- the note box ----
  let composer = null;
  function openComposer(d) {
    draft = d;
    closeComposerUi();
    const r = d.rect;
    const c = el("c");
    const below = r.bottom + 330 < innerHeight;
    c.style.left = Math.max(8, Math.min(innerWidth - 316, r.left)) + "px";
    c.style.top = below ? Math.min(r.bottom + 8, innerHeight - 200) + "px" : Math.max(8, r.top - 190) + "px";
    const code = document.createElement("code"); code.textContent = d.label;
    const ta = document.createElement("textarea"); ta.placeholder = d.kind === "text" ? "What should change about this text?" : "What should change?";
    const row = el("r");
    const mk = (opts) => { const s = document.createElement("select"); opts.forEach((o) => s.add(new Option(o, o))); return s; };
    const intent = mk(["fix", "change", "question"]), sev = mk(["important", "blocking", "suggestion"]);
    const cancel = document.createElement("button"); cancel.textContent = "Cancel"; cancel.onclick = cancelDraft;
    const add = document.createElement("button"); add.textContent = "Add"; add.className = "go";
    const spacer = el(""); spacer.style.flex = "1";
    row.append(intent, sev, spacer, cancel, add);
    c.append(code, ta, row);
    const submit = () => { const comment = ta.value.trim(); if (comment) finish(comment, intent.value, sev.value); else ta.focus(); };
    add.onclick = submit;
    ta.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } else if (e.key === "Escape") cancelDraft(); };
    ta.onkeyup = ta.onkeypress = (e) => e.stopPropagation();
    layer.append(c);
    composer = c;
    paint();
    setTimeout(() => ta.focus(), 0);
  }
  function closeComposerUi() { if (composer) composer.remove(); composer = null; }
  function cancelDraft() { draft = null; closeComposerUi(); try { getSelection().removeAllRanges(); } catch {} paint(); }

  async function finish(comment, intent, severity) {
    const d = draft, first = d.els[0];
    closeComposerUi();
    const note = {
      kind: d.kind, comment, intent, severity,
      selector: selectorFor(first), items: d.els.length > 1 ? d.els.map(selectorFor) : [],
      path: pathOf(first), text: textOf(first).slice(0, 200), tag: describe(first), url: location.href,
      box: `${Math.round(d.rect.left + scrollX)},${Math.round(d.rect.top + scrollY)} ${Math.round(d.rect.width)}x${Math.round(d.rect.height)}`,
      pb: { x: d.rect.left + scrollX, y: d.rect.top + scrollY, w: d.rect.width, h: d.rect.height }, page: location.pathname,
      attrs: attrsOf(first), styles: stylesOf(first),
      nearby: [first.previousElementSibling, first.nextElementSibling].filter(Boolean).map((e) => textOf(e).slice(0, 80)).filter(Boolean).join(" | "),
      selected: d.selected || "",
    };
    const s = sourceOf(first);
    note.source = s.source;
    note.components = cfg.components ? s.components : "";
    draft = null; multi = []; paint();
    note.crop = await crop(d.els, d.rect);
    send({ type: "note", note });
    try { getSelection().removeAllRanges(); } catch {}
  }

  // ---- a picture of what was picked: the element cloned into an SVG, drawn on a canvas (best effort) ----
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "LINK", "META", "TEMPLATE"]);
  function snap(n, budget) {
    if (n.nodeType === 3) return n.cloneNode(true);
    if (n.nodeType !== 1 || SKIP.has(n.tagName) || budget.n-- <= 0) return null;
    let c;
    if (n.tagName === "CANVAS" || n.tagName === "VIDEO") {
      c = document.createElement("img");
      try { c.src = n.tagName === "CANVAS" ? n.toDataURL() : videoFrame(n); } catch {}
    } else c = n.cloneNode(false);
    const s = getComputedStyle(n);
    let css = "";
    for (const p of s) css += p + ":" + s.getPropertyValue(p) + ";";
    c.setAttribute("style", css);
    for (const a of [...c.attributes]) if (/^on/i.test(a.name)) c.removeAttribute(a.name);
    if (n.tagName === "IMG") { try { c.src = imgData(n); c.removeAttribute("srcset"); } catch { c.removeAttribute("src"); } }
    if (n.tagName === "INPUT" || n.tagName === "TEXTAREA") { c.setAttribute("value", n.value); if (n.tagName === "TEXTAREA") c.textContent = n.value; }
    if (n.tagName !== "CANVAS" && n.tagName !== "VIDEO") for (const k of n.childNodes) { const kc = snap(k, budget); if (kc) c.append(kc); }
    return c;
  }
  const imgData = (i) => { const k = document.createElement("canvas"); k.width = i.naturalWidth || 1; k.height = i.naturalHeight || 1; k.getContext("2d").drawImage(i, 0, 0); return k.toDataURL(); };
  const videoFrame = (v) => { const k = document.createElement("canvas"); k.width = v.videoWidth || v.clientWidth; k.height = v.videoHeight || v.clientHeight; k.getContext("2d").drawImage(v, 0, 0); return k.toDataURL(); };
  const common = (els) => { if (els.length === 1) return els[0]; let a = els[0]; while (a && !els.every((e) => a.contains(e))) a = a.parentElement; return a || document.body; };
  async function crop(els, want) {
    try {
      let base = common(els);
      let br = base.getBoundingClientRect();
      if (br.width > 2400 || br.height > 2400) { base = els[0]; br = base.getBoundingClientRect(); }
      if (br.width < 2 || br.height < 2 || br.width > 2400 || br.height > 2400) return undefined;
      const c = snap(base, { n: 1500 });
      const w = Math.ceil(br.width), h = Math.ceil(br.height);
      c.style.cssText += `;margin:0;transform:none;position:static;width:${w}px;height:${h}px;box-sizing:border-box`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="100%" height="100%">${new XMLSerializer().serializeToString(c)}</foreignObject></svg>`;
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error("render")); setTimeout(() => no(new Error("timeout")), 2500); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
      const sx = Math.max(0, want.left - br.left), sy = Math.max(0, want.top - br.top);
      const sw = Math.min(w - sx, want.width), sh = Math.min(h - sy, want.height);
      if (sw < 2 || sh < 2) return undefined;
      for (let k = Math.min(2, window.devicePixelRatio || 1); k >= 0.5; k -= 0.5) {
        const scale = Math.min(k, 1600 / Math.max(sw, sh));
        const cv = document.createElement("canvas");
        cv.width = Math.round(sw * scale); cv.height = Math.round(sh * scale);
        const g = cv.getContext("2d");
        g.fillStyle = getComputedStyle(document.body).backgroundColor || "#fff";
        if (g.fillStyle === "rgba(0, 0, 0, 0)") g.fillStyle = "#fff";
        g.fillRect(0, 0, cv.width, cv.height);
        g.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        const url = cv.toDataURL("image/png");
        if (url.length < 1_300_000) return url;
      }
    } catch {}
    return undefined;
  }

  // ---- picking ----
  const inHost = (e) => e.composedPath && e.composedPath().includes(host);
  const target = (x, y) => { const e = document.elementFromPoint(x, y); return e && e !== host && e !== document.documentElement ? e : null; };
  const rectFor = (els) => union(els.map((e) => e.getBoundingClientRect()));
  const quoted = (e) => { const t = textOf(e).replace(/\s+/g, " ").trim(); return t ? `"${t.slice(0, 60)}${t.length > 60 ? "…" : ""}"` : describe(e); };
  const pickElement = (e) => openComposer({ kind: "element", els: [e], rect: rectFor([e]), label: quoted(e) });
  function commitMulti() { if (!multi.length) return; const els = multi.slice(); openComposer({ kind: "multi", els, rect: rectFor(els), label: `${els.length} elements` }); }
  function areaItems(r) {
    const out = [];
    for (const e of document.body.querySelectorAll("*")) {
      if (SKIP.has(e.tagName) || e === host) continue;
      const b = e.getBoundingClientRect();
      if (b.width < 4 || b.height < 4) continue;
      if (b.left >= r.left - 1 && b.top >= r.top - 1 && b.right <= r.right + 1 && b.bottom <= r.bottom + 1 && !out.some((o) => o.contains(e))) { for (let i = out.length - 1; i >= 0; i--) if (e.contains(out[i])) out.splice(i, 1); out.push(e); }
      if (out.length >= 20) break;
    }
    return out;
  }

  const stop = (e) => { e.stopPropagation(); e.stopImmediatePropagation(); };
  addEventListener("mousemove", (e) => {
    if (!cfg.on || draft || inHost(e)) return;
    if (drag) { drag.x1 = e.clientX; drag.y1 = e.clientY; paint(); return; }
    if (cfg.mode === "element" || cfg.mode === "multi") { const t = target(e.clientX, e.clientY); if (t !== hov) { hov = t; paint(); } }
  }, true);
  for (const ev of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "auxclick"]) {
    addEventListener(ev, (e) => {
      if (!cfg.on || inHost(e)) return;
      if (draft) { if (ev === "click") e.preventDefault(); stop(e); return; }
      if (cfg.block && cfg.mode !== "text") stop(e);
      if (ev === "mousedown" && cfg.mode === "area" && e.button === 0) { e.preventDefault(); drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }; stop(e); }
      if (ev === "mouseup" && drag) {
        const r = rectOf(drag); drag = null;
        if (r.width >= 8 && r.height >= 8) { const els = areaItems(r); openComposer({ kind: "area", els: els.length ? els : [document.body], rect: r, label: `area ${Math.round(r.width)}x${Math.round(r.height)} (${els.length} elements)` }); } else paint();
      }
      if (ev === "mouseup" && cfg.mode === "text") {
        setTimeout(() => {
          const sel = getSelection();
          if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
          const rg = sel.getRangeAt(0), n = rg.commonAncestorContainer, anchor = n.nodeType === 1 ? n : n.parentElement;
          if (!anchor || anchor === host) return;
          const text = sel.toString().trim().replace(/\s+/g, " ");
          openComposer({ kind: "text", els: [anchor], rect: rg.getBoundingClientRect(), label: `"${text.slice(0, 60)}"`, selected: text.slice(0, 600) });
        }, 0);
      }
      if (ev === "click") {
        if (cfg.block) e.preventDefault(); // text mode too: selecting must not follow a link
        const t = target(e.clientX, e.clientY);
        if (!t) return;
        if (cfg.mode === "element") pickElement(t);
        else if (cfg.mode === "multi") { multi = multi.includes(t) ? multi.filter((x) => x !== t) : [...multi, t]; paint(); }
      }
    }, true);
  }
  const typing = (e) => { const t = e.target; return t && t.nodeType === 1 && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };
  addEventListener("keydown", (e) => {
    if (inHost(e)) return;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); send({ type: "key", key: "toggle" }); return; }
    if (!cfg.on || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "escape") { if (draft) cancelDraft(); else if (multi.length) { multi = []; paint(); } else if (drag) { drag = null; paint(); } else send({ type: "key", key: "esc" }); }
    else if (k === "enter" && multi.length && !draft) { e.preventDefault(); commitMulti(); }
    else if ("phcsxl".includes(k) && k.length === 1) { e.preventDefault(); send({ type: "key", key: k }); }
  }, true);
  addEventListener("scroll", () => marks.length && paint(), true);
  addEventListener("resize", () => paint());
  setInterval(() => marks.length && !draft && paint(), 700);

  // ---- the board speaks, the page listens (only the framing window, with the token) ----
  addEventListener("message", (e) => {
    const d = e.data;
    if (e.source !== parent || !d || d.kz !== 1 || d.t !== token) return;
    if (d.type === "config") {
      const was = cfg.on;
      Object.assign(cfg, d.cfg || {});
      if (typeof d.cfg?.pause === "boolean") setPause(d.cfg.pause);
      if (!cfg.on && was) { draft = null; closeComposerUi(); multi = []; drag = null; hov = null; }
      if (cfg.mode !== "multi") multi = [];
      document.documentElement.style.cursor = "";
      paint();
    } else if (d.type === "markers") { marks = Array.isArray(d.list) ? d.list : []; paint(); }
    else if (d.type === "commit") commitMulti();
    else if (d.type === "copy" && typeof d.text === "string") {
      (navigator.clipboard ? navigator.clipboard.writeText(d.text) : Promise.reject()).catch(() => {
        const t = document.createElement("textarea"); t.value = d.text; t.style.cssText = "position:fixed;opacity:0"; document.body.append(t); t.select(); try { document.execCommand("copy"); } catch {} t.remove();
      });
    }
  });

  // The board shows the page's real address (it can navigate with pushState on its own).
  const loc = () => send({ type: "loc", href: location.href, title: document.title });
  for (const m of ["pushState", "replaceState"]) { const o = history[m]; history[m] = function () { const r = o.apply(this, arguments); setTimeout(loc, 0); return r; }; }
  addEventListener("popstate", loc);
  addEventListener("hashchange", loc);
  addEventListener("load", loc);
  send({ type: "ready", href: location.href });
})();
