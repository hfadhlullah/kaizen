// The in-card terminal: xterm.js on the board's /pty WebSocket. Bundled into
// web/term.js by `bun run build:web`; the board loads it (`termLoad` in web/board/agent-term.ts) the first time a card's
// Terminal tab opens and calls window.kzTerm(el, key).
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";

function mountTerm(el: HTMLElement, key: string, onEnd?: () => void): () => void {
  const css = getComputedStyle(el);
  const tok = (n: string) => css.getPropertyValue(n).trim() || undefined;
  const term = new Terminal({
    cursorBlink: true,
    fontFamily: tok("--mono"),
    fontSize: 12,
    scrollback: 5000,
    allowProposedApi: true, // search match decorations
    theme: {
      background: tok("--bg"),
      foreground: tok("--ink-hi"),
      cursor: tok("--accent"),
      selectionBackground: tok("--line"),
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon((_e, url) => window.open(url, "_blank", "noopener")));
  const search = new SearchAddon();
  term.loadAddon(search);
  term.open(el);
  // The DOM renderer lags on a full-screen agent's constant redraws; WebGL keeps up.
  // No WebGL, or the context lost: xterm.js falls back to the DOM renderer by itself.
  try {
    const gl = new WebglAddon();
    gl.onContextLoss(() => gl.dispose());
    term.loadAddon(gl);
  } catch { /* DOM renderer */ }

  const ws = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/pty?key=${encodeURIComponent(key)}`,
  );
  const send = (m: object) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };
  const size = () => {
    if (!el.offsetWidth) return;
    fit.fit();
    send({ t: "r", c: term.cols, r: term.rows });
  };
  ws.onopen = size;
  ws.onmessage = (e) => term.write(String(e.data));
  // The board closes with "ended" when the agent exits; anything else is the board gone.
  ws.onclose = (e) => {
    term.write(`\r\n\x1b[2m[${e.reason === "ended" ? "agent ended" : "connection to the board lost"}]\x1b[0m\r\n`);
    onEnd?.();
  };
  // Phone/tablet: a bar of the keys a soft keyboard lacks. Alt is sticky for the next key.
  // Ctrl opens its own a-z pad instead of waiting on the native keyboard, whose IME can
  // deliver the letter without the modifier. The handle above the bar hides it.
  const mods = { alt: false };
  const typed = term.onData((d) => {
    if (mods.alt) d = "\x1b" + d;
    mods.alt = false;
    bar?.querySelector(".alt")?.classList.remove("on");
    send({ t: "i", d });
  });
  let bar: HTMLElement | null = null;
  if (matchMedia("(pointer: coarse)").matches) {
    const arrow = (c: string) => () => `\x1b${term.modes.applicationCursorKeysMode ? "O" : "["}${c}`;
    const paste = () => navigator.clipboard?.readText().then((t) => t && term.paste(t), () => {});
    // inverted T: Up above Down, Left and Right beside it
    const keys: [string, string | (() => unknown) | "alt" | "ctrl" | ""][] = [
      ["Esc", "\x1b"], ["Paste", paste], ["↵", "\r"], ["⇧⇥", "\x1b[Z"], ["↑", arrow("A")], ["", ""],
      ["Ctrl", "ctrl"], ["Alt", "alt"], ["^C", "\x03"], ["←", arrow("D")], ["↓", arrow("B")], ["→", arrow("C")],
    ];
    bar = document.createElement("div");
    bar.className = "termkeys";
    // pointerdown + preventDefault: a tap must not move focus off the terminal.
    const key = (label: string, fn: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); fn(); term.focus(); });
      return b;
    };
    const grid = document.createElement("div");
    grid.className = "keygrid";
    const setPad = (on: boolean) => { pad.hidden = !on; grid.hidden = on; };
    const pad = document.createElement("div");
    pad.className = "ctrlpad";
    pad.hidden = true;
    // qwerty rows; the last row ends with ✕ to leave the pad
    for (const row of ["qwertyuiop", "asdfghjkl", "zxcvbnm✕"]) {
      const r = document.createElement("div");
      for (const c of row) r.append(key(c, () => {
        if (c !== "✕") send({ t: "i", d: String.fromCharCode(c.charCodeAt(0) & 31) });
        setPad(false);
      }));
      pad.append(r);
    }
    for (const [label, v] of keys) {
      if (!label) { grid.append(document.createElement("i")); continue; }
      const b = key(label, () => {
        if (v === "alt") b.classList.toggle("on", (mods.alt = !mods.alt));
        else if (v === "ctrl") setPad(true);
        else send({ t: "i", d: (typeof v === "function" ? v() : v) as string });
      });
      if (v === "alt") b.classList.add(v);
      grid.append(b);
    }
    const hide = key("Keys ▾", () => {
      const off = hide.textContent === "Keys ▾";
      grid.hidden = pad.hidden = true;
      if (!off) grid.hidden = false;
      hide.textContent = off ? "Keys ▴" : "Keys ▾";
    });
    // The native keyboard stays shut (inputmode none) until this button asks for it, so
    // tapping the terminal or a key never pops it over the Ctrl pad and Paste.
    const ta = term.textarea;
    if (ta) ta.inputMode = "none";
    const kbd = key("⌨", () => {
      if (!ta) return;
      const on = kbd.classList.toggle("on");
      ta.inputMode = on ? "text" : "none";
      ta.blur(); // inputmode is read on focus; the key's term.focus() reopens it
    });
    const top = document.createElement("div");
    top.className = "keytop";
    top.append(hide, kbd);
    bar.append(top, pad, grid);
    el.after(bar);
  }
  // xterm.js has no touch scrolling, so on a phone a swipe did nothing. Each line's
  // worth of swipe scrolls the buffer, or — when the agent tracks the mouse, as a
  // full-screen Claude Code does — goes to it as a wheel report.
  // ponytail: always the SGR (1006) encoding; an agent asking for X10 mouse would misread it.
  let lastY: number | null = null;
  const touchStart = (e: TouchEvent) => { lastY = e.touches.length === 1 ? e.touches[0].clientY : null; };
  const touchMove = (e: TouchEvent) => {
    if (lastY === null || e.touches.length !== 1) return;
    const screen = el.querySelector<HTMLElement>(".xterm-screen");
    const cell = (screen?.clientHeight || el.clientHeight) / term.rows;
    const t = e.touches[0];
    const lines = Math.trunc((lastY - t.clientY) / cell);
    e.preventDefault();
    if (!lines) return;
    lastY -= lines * cell;
    if (term.modes.mouseTrackingMode === "none") return term.scrollLines(lines);
    const r = (screen ?? el).getBoundingClientRect();
    const col = Math.min(term.cols, Math.max(1, Math.ceil((t.clientX - r.left) / (r.width / term.cols))));
    const row = Math.min(term.rows, Math.max(1, Math.ceil((t.clientY - r.top) / cell)));
    send({ t: "i", d: `\x1b[<${lines > 0 ? 65 : 64};${col};${row}M`.repeat(Math.abs(lines)) });
  };
  el.addEventListener("touchstart", touchStart, { passive: true });
  el.addEventListener("touchmove", touchMove, { passive: false });
  // Top-right strip: search the output (all devices; Ctrl/Cmd+Shift+F from the terminal)
  // and, with a mouse, Paste — phones already have Paste in the key bar.
  const tools = document.createElement("div");
  tools.className = "termtools";
  const tool = (label: string, title: string, fn: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", fn);
    return b;
  };
  const q = document.createElement("input");
  q.type = "search";
  q.placeholder = "Search";
  const deco = { matchBackground: "#7a5c00", activeMatchBackground: "#d08000", matchOverviewRuler: "#d08000", activeMatchColorOverviewRuler: "#ff9900" };
  const find = (back = false) => {
    if (!q.value) return search.clearDecorations();
    const o = { decorations: deco };
    back ? search.findPrevious(q.value, o) : search.findNext(q.value, o);
  };
  const box = document.createElement("span");
  box.className = "tsearch";
  box.hidden = true;
  const closeSearch = () => { box.hidden = true; search.clearDecorations(); term.focus(); };
  const openSearch = () => { box.hidden = false; q.select(); q.focus(); };
  q.addEventListener("input", () => find());
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); find(e.shiftKey); }
    else if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
  });
  box.append(q, tool("↑", "Previous (Shift+Enter)", () => find(true)), tool("↓", "Next (Enter)", () => find()), tool("✕", "Close (Esc)", closeSearch));
  tools.append(box, tool("⌕", "Search (Ctrl+Shift+F)", () => (box.hidden ? openSearch() : closeSearch())));
  // A refused read (permission, or a plain-http origin) says so on the button for a moment.
  const pasteBtn = tool("Paste", "Paste from clipboard", () => {
    const no = () => { pasteBtn.textContent = "Blocked"; setTimeout(() => (pasteBtn.textContent = "Paste"), 1500); };
    if (!navigator.clipboard?.readText) no();
    else navigator.clipboard.readText().then((t) => t && term.paste(t), no);
    term.focus();
  });
  if (!bar) tools.append(pasteBtn);
  el.append(tools);
  // xterm keeps one custom key handler: add further shortcuts here, not in a second call.
  term.attachCustomKeyEventHandler((e) => {
    if (e.type === "keydown" && (e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyF") {
      e.preventDefault();
      openSearch();
      return false;
    }
    return true;
  });
  // Each resize makes the agent redraw its whole screen, so a panel animating or a
  // soft keyboard opening sends one, not dozens.
  let resizing: Timer | undefined;
  const ro = new ResizeObserver(() => { clearTimeout(resizing); resizing = setTimeout(size, 100); });
  ro.observe(el);
  term.focus();

  return () => {
    ro.disconnect();
    clearTimeout(resizing);
    el.removeEventListener("touchstart", touchStart);
    el.removeEventListener("touchmove", touchMove);
    typed.dispose();
    bar?.remove();
    tools.remove();
    ws.onclose = null;
    ws.close();
    term.dispose();
  };
}

(window as any).kzTerm = mountTerm;
