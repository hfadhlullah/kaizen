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
  const theme = () => ({ background: tok("--bg"), foreground: tok("--ink-hi"), cursor: tok("--accent"), selectionBackground: tok("--line") });
  const term = new Terminal({
    cursorBlink: true,
    // Nerd Font first: shell prompts print private-use glyphs that plain monospace fonts lack.
    fontFamily: `"JetBrainsMono Nerd Font",${tok("--mono")}`,
    fontSize: 12,
    scrollback: 5000,
    allowProposedApi: true, // search match decorations
    theme: theme(),
  });
  // The board's theme toggle, or the system's scheme when none is set: the terminal follows live.
  // getComputedStyle is live, so the same tokens read the new values.
  const retheme = () => requestAnimationFrame(() => (term.options.theme = theme()));
  const os = matchMedia("(prefers-color-scheme: dark)");
  addEventListener("kz-theme", retheme);
  os.addEventListener("change", retheme);
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

  // A dropped socket (network blip, sleep, a proxy hanging up) retries by itself a few
  // times, and the Reconnect button in the top-right strip retries on demand. The board
  // replays the whole session on attach, so a reopened socket starts from a reset screen.
  const WAIT = [1, 2, 4, 8, 15];
  let ws: WebSocket | undefined;
  let tries = 0;
  let retry: Timer | undefined;
  let lost = false;
  const send = (m: object) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };
  const size = (nudge = false) => {
    if (!el.offsetWidth) return;
    if (!ws) return connect(); // its onopen comes back here to fit and nudge
    fit.fit();
    // The replay was drawn at whatever size the agent had before; a resize to the same size
    // sends it no signal, so a full-screen agent never repaints it. One row short, then back, does.
    if (nudge && term.rows > 5) {
      send({ t: "r", c: term.cols, r: term.rows - 1 });
      setTimeout(() => send({ t: "r", c: term.cols, r: term.rows }), 80);
    } else send({ t: "r", c: term.cols, r: term.rows });
  };
  const connect = () => {
    clearTimeout(retry);
    // A click during a retry's handshake must not leave two sockets attached.
    if (ws) { ws.onopen = ws.onmessage = ws.onclose = null; ws.close(); }
    ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/pty?key=${encodeURIComponent(key)}`,
    );
    ws.onopen = () => {
      if (lost) term.reset();
      lost = false;
      tries = 0;
      reBtn.hidden = true;
      size(true);
    };
    ws.onmessage = (e) => term.write(String(e.data));
    // The board closes with "ended" when the agent exits; anything else is the board gone.
    ws.onclose = (e) => {
      if (e.reason === "ended") {
        term.write("\r\n\x1b[2m[agent ended]\x1b[0m\r\n");
        reBtn.hidden = true;
      } else {
        if (!lost) term.write("\r\n\x1b[2m[connection to the board lost]\x1b[0m\r\n");
        lost = true;
        reBtn.hidden = false;
        if (tries < WAIT.length) retry = setTimeout(connect, WAIT[tries++] * 1000);
        else term.write("\r\n\x1b[2m[session ended: open a new tab, or press Reconnect if the board is back]\x1b[0m\r\n");
      }
      onEnd?.();
    };
  };
  // Phone/tablet: a row of chips for the keys a soft keyboard lacks, and a message box
  // that types into the agent and presses Enter. Alt is sticky for the next key. Ctrl
  // opens its own a-z pad instead of waiting on the native keyboard, whose IME can
  // deliver the letter without the modifier. ⋯ holds Search, Paste and Raw keyboard.
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
    // 1-3 answer the agent's numbered prompts; the rest are the keys it asks for most.
    const keys: [string, string | (() => unknown) | "alt" | "ctrl" | "more"][] = [
      ["1", "1"], ["2", "2"], ["3", "3"], ["Esc", "\x1b"], ["^C", "\x03"], ["↑", arrow("A")], ["↓", arrow("B")],
      ["←", arrow("D")], ["→", arrow("C")], ["↵", "\r"], ["⇧⇥", "\x1b[Z"], ["Ctrl", "ctrl"], ["Alt", "alt"], ["⋯", "more"],
    ];
    bar = document.createElement("div");
    bar.className = "termkeys";
    const msg = document.createElement("input");
    // pointerdown + preventDefault: a tap must not move focus off the terminal, nor
    // close the soft keyboard while the message box is being typed in. The key itself
    // fires on click, which the browser drops when the touch becomes a swipe of the row.
    const key = (label: string, fn: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("pointerdown", (e) => e.preventDefault());
      b.addEventListener("click", () => { fn(); if (document.activeElement !== msg) term.focus(); });
      return b;
    };
    const chips = document.createElement("div");
    chips.className = "chips";
    const pad = document.createElement("div");
    pad.className = "ctrlpad";
    pad.hidden = true;
    // qwerty rows; the last row ends with ✕ to leave the pad
    for (const row of ["qwertyuiop", "asdfghjkl", "zxcvbnm✕"]) {
      const r = document.createElement("div");
      for (const c of row) r.append(key(c, () => {
        if (c !== "✕") send({ t: "i", d: String.fromCharCode(c.charCodeAt(0) & 31) });
        pad.hidden = true;
      }));
      pad.append(r);
    }
    // The native keyboard stays shut over the terminal (inputmode none) until Raw keyboard
    // asks for it; the message box below has its own.
    const ta = term.textarea;
    if (ta) ta.inputMode = "none";
    const more = document.createElement("div");
    more.className = "tmore";
    more.hidden = true;
    const raw = key("Raw keyboard", () => {
      more.hidden = true;
      if (!ta) return;
      const on = raw.classList.toggle("on");
      ta.inputMode = on ? "text" : "none";
      ta.blur(); // inputmode is read on focus; the key's term.focus() reopens it
    });
    more.append(key("Search", () => { more.hidden = true; openSearch(); }), key("Paste", () => { more.hidden = true; paste(); }), raw);
    for (const [label, v] of keys) {
      const b = key(label, () => {
        if (v === "alt") b.classList.toggle("on", (mods.alt = !mods.alt));
        else if (v === "ctrl") { pad.hidden = !pad.hidden; more.hidden = true; }
        else if (v === "more") { more.hidden = !more.hidden; pad.hidden = true; }
        else send({ t: "i", d: (typeof v === "function" ? v() : v) as string });
      });
      if (v === "alt") b.classList.add(v);
      chips.append(b);
    }
    // Send types the text, then Enter a beat later: sent together, a TUI agent reads the
    // pair as a paste and keeps the newline in its input instead of submitting.
    const form = document.createElement("form");
    form.className = "compose";
    msg.placeholder = "Message the agent…";
    msg.enterKeyHint = "send";
    msg.autocomplete = "off";
    msg.setAttribute("aria-label", "Message the agent");
    const go = document.createElement("button");
    go.textContent = "➤";
    go.setAttribute("aria-label", "Send");
    go.addEventListener("pointerdown", (e) => e.preventDefault()); // keep the keyboard up
    form.append(msg, go);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (msg.value) send({ t: "i", d: msg.value });
      msg.value = "";
      setTimeout(() => send({ t: "i", d: "\r" }), 60);
    });
    bar.append(pad, more, chips, form);
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
  const reBtn = tool("Reconnect", "Reconnect to the board", () => { tries = 0; connect(); term.focus(); });
  reBtn.className = "recon";
  reBtn.hidden = true;
  tools.prepend(reBtn);
  el.append(tools);
  // A pane in a background tab has no size yet. The replay is cursor moves for the agent's real
  // width, and xterm's default 80 columns would clamp them for good, so attach once it is shown.
  size();
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
    clearTimeout(retry);
    if (ws) { ws.onclose = null; ws.close(); }
    removeEventListener("kz-theme", retheme);
    os.removeEventListener("change", retheme);
    term.dispose();
  };
}

(window as any).kzTerm = mountTerm;
