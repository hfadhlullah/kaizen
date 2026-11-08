// The in-card terminal: xterm.js on the board's /pty WebSocket. Bundled into
// web/term.js by `bun run build:web`; the board loads it (`termLoad` in web/board/agent-term.ts) the first time a card's
// Terminal tab opens and calls window.kzTerm(el, key).
import { trackTerminalViewport } from "./board/terminal-viewport.ts";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { fontRead, fontSet, fontStep } from "./term-font.ts";

function mountTerm(el: HTMLElement, key: string, onEnd?: () => void): () => void {
  const css = getComputedStyle(el);
  const tok = (n: string) => css.getPropertyValue(n).trim() || undefined;
  const theme = () => ({ background: tok("--bg"), foreground: tok("--ink-hi"), cursor: tok("--accent"), // --line on --bg was near invisible in the dark theme (#2e2e2e on #121212), so a drag
  // looked like it selected nothing; --dim at 35% shows in both themes.
  selectionBackground: (tok("--dim") ?? "#808080") + "59" });
  const term = new Terminal({
    cursorBlink: true,
    // Nerd Font first: shell prompts print private-use glyphs that plain monospace fonts lack.
    fontFamily: `"JetBrainsMono Nerd Font",${tok("--mono")}`,
    fontSize: fontRead(),
    scrollback: 5000,
    allowProposedApi: true, // search match decorations
    theme: theme(),
  });
  // The board's theme toggle, or the system's scheme when none is set: the terminal follows live.
  // getComputedStyle is live, so the same tokens read the new values.
  // An agent that asked for theme updates (mode 2031) is told too, so its own auto theme follows.
  // The dataset is the toggle's choice; unset means the system's scheme.
  const retheme = () => requestAnimationFrame(() => {
    term.options.theme = theme();
    reportScheme();
  });
  const os = matchMedia("(prefers-color-scheme: dark)");
  addEventListener("kz-theme", retheme);
  os.addEventListener("change", retheme);
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon((_e, url) => window.open(url, "_blank", "noopener")));
  const search = new SearchAddon();
  term.loadAddon(search);
  // Unicode 11 widths: emoji and CJK take two cells, as agents and tmux count them, so
  // the cursor and borders line up after them (xterm.js defaults to Unicode 6).
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = "11";
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
  // Only to a program that asked: a plain shell would print the reply as text.
  let schemeNotify = false;
  const reportScheme = () => {
    if (!schemeNotify) return;
    const t = document.documentElement.dataset.theme;
    send({ t: "i", d: `\x1b[?997;${(t ? t === "dark" : os.matches) ? 1 : 2}n` });
  };
  // Returning false lets xterm.js handle the sequence as usual. A replayed session repeats
  // the request on attach, which also corrects a theme changed while this view was closed.
  const schemeMode = (on: boolean) => (params: (number | number[])[]) => {
    if (params.includes(2031)) {
      schemeNotify = on;
      if (on) reportScheme();
    }
    return false;
  };
  term.parser.registerCsiHandler({ prefix: "?", final: "h" }, schemeMode(true));
  term.parser.registerCsiHandler({ prefix: "?", final: "l" }, schemeMode(false));
  term.parser.registerCsiHandler({ prefix: "?", final: "n" }, (params) => {
    if (params[0] === 996) reportScheme();
    return false;
  });
  // Each message makes the agent repaint its whole screen, so a size already sent on this
  // socket (a few pixels of drag that move no cell) is not sent again.
  let sentOn: WebSocket | null = null, sentC = 0, sentR = 0;
  const size = (nudge = false) => {
    if (!el.offsetWidth) return;
    if (!ws) return connect(); // its onopen comes back here to fit and nudge
    fit.fit();
    if (!nudge && sentOn === ws && sentC === term.cols && sentR === term.rows) return;
    sentOn = ws; sentC = term.cols; sentR = term.rows;
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
      if (lost) { term.reset(); schemeNotify = false; }
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
  let stopViewport = () => {};
  if (matchMedia("(pointer: coarse)").matches) {
    const arrow = (c: string) => () => `\x1b${term.modes.applicationCursorKeysMode ? "O" : "["}${c}`;
    // A terminal carries no pictures: an image is saved on the board's computer and its path
    // typed in, which is how Claude Code and Codex take one.
    const sendImage = async (b: Blob) => {
      const r = await fetch("/term-image", { method: "POST", headers: { "content-type": b.type || "image/png" }, body: b }).catch(() => null);
      const path = r?.ok ? (await r.json()).path : "";
      if (path) term.paste(/\s/.test(path) ? `"${path}" ` : `${path} `);
    };
    const paste = async () => {
      const items = await navigator.clipboard?.read?.().catch(() => []) ?? [];
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith("image/"));
        if (type) return sendImage(await it.getType(type));
      }
      navigator.clipboard?.readText().then((t) => t && term.paste(t), () => {});
    };
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/*";
    picker.hidden = true;
    picker.onchange = () => {
      if (picker.files?.[0]) void sendImage(picker.files[0]);
      picker.value = "";
    };
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
    const key = (label: string, fn: () => void, focus = true) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("pointerdown", (e) => e.preventDefault());
      b.addEventListener("click", () => { fn(); if (focus && document.activeElement !== msg) term.focus(); });
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
    more.append(key("Search", () => { more.hidden = true; openSearch(); }), key("Paste", () => { more.hidden = true; void paste(); }), key("Pick image", () => { more.hidden = true; picker.click(); }));
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
    msg.placeholder = "Paste text here...";
    msg.enterKeyHint = "send";
    msg.autocomplete = "off";
    msg.setAttribute("aria-label", "Message the agent");
    const rawKeyboard = document.createElement("button");
    rawKeyboard.type = "button";
    rawKeyboard.className = "rawkeyboard";
    rawKeyboard.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="2" y="5" width="20" height="13" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 15h10"/></svg>';
    rawKeyboard.setAttribute("aria-label", "Type directly in terminal");
    rawKeyboard.title = "Raw keyboard";
    rawKeyboard.setAttribute("aria-pressed", "false");
    rawKeyboard.onclick = () => {
      showPanel("");
      if (!ta) return;
      const on = ta.inputMode !== "text";
      ta.inputMode = on ? "text" : "none";
      ta.blur();
      rawKeyboard.setAttribute("aria-pressed", String(on));
      if (on) term.focus();
    };
    rawKeyboard.addEventListener("pointerdown", (e) => e.preventDefault()); // keep the keyboard up
    form.append(msg, rawKeyboard);
    msg.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (msg.value) {
        const text = msg.value;
        try { localStorage.setItem("kz-term-history", JSON.stringify([text, ...readHistory().filter((s) => s !== text)].slice(0, 100))); } catch { /* typing works without storage */ }
        send({ t: "i", d: text });
      }
      msg.value = "";
      setTimeout(() => send({ t: "i", d: "\r" }), 60);
    });
    // The rightmost composer toggle replaces the native keyboard with a compact
    // accessory panel. History only loads the composer; it never executes a command.
    const grid = document.createElement("div");
    grid.className = "termgrid";
    grid.hidden = true;
    const press = (value: string | (() => string)) => {
      send({ t: "i", d: (mods.alt ? "\x1b" : "") + (typeof value === "function" ? value() : value) });
      mods.alt = false;
      bar?.querySelectorAll(".alt").forEach((b) => b.classList.remove("on"));
    };
    const group = (name: string) => {
      const section = document.createElement("div");
      section.className = "termkeygroup " + name;
      grid.append(section);
      return section;
    };
    const add = (parent: HTMLElement, label: string, value: string | (() => string), position?: string) => {
      const b = key(label, () => press(value));
      if (position) b.style.gridArea = position;
      parent.append(b);
      return b;
    };
    const primary = group("primary");
    add(primary, "Esc", "\x1b", "1 / 1");
    add(primary, "Tab", "\t", "1 / 2");
    add(primary, "⇧ Tab", "\x1b[Z", "1 / 3");
    primary.append(key("Ctrl", () => { pad.hidden = !pad.hidden; }));
    add(primary, "^C", "\x03", "2 / 1");
    add(primary, "^D", "\x04", "2 / 2");
    add(primary, "^Z", "\x1a", "2 / 3");
    const alt = key("Alt", () => {
      mods.alt = !mods.alt;
      bar?.querySelectorAll(".alt").forEach((b) => b.classList.toggle("on", mods.alt));
    });
    alt.className = "alt";
    alt.style.gridArea = "2 / 4";
    primary.append(alt);
    add(primary, "↑", arrow("A"), "1 / 6");
    add(primary, "←", arrow("D"), "2 / 5");
    add(primary, "↓", arrow("B"), "2 / 6");
    add(primary, "→", arrow("C"), "2 / 7");
    const enter = add(primary, "↵", "\r", "1 / 8 / span 2 / 9");
    enter.setAttribute("aria-label", "Enter");
    enter.className = "enter";
    const navigation = group("navigation");
    for (const [label, value] of [["Home", "\x1b[H"], ["End", "\x1b[F"], ["PgUp", "\x1b[5~"], ["PgDn", "\x1b[6~"], ["Ins", "\x1b[2~"], ["Del", "\x1b[3~"]]) add(navigation, label, value);
    navigation.append(key("Paste", () => { void paste(); }), key("Image", () => picker.click()));
    const symbols = group("symbols");
    for (const c of "? / = : ; ! * $ % ^ < > ( ) { } [ ] | ~ - @".split(" ")) add(symbols, c, c);
    const functions = group("functions");
    for (let i = 0; i < 12; i++) add(functions, `F${i + 1}`, i < 4 ? `\x1bO${"PQRS"[i]}` : `\x1b[${[15, 17, 18, 19, 20, 21, 23, 24][i - 4]}~`);
    const history = document.createElement("div");
    history.className = "termhistory";
    history.hidden = true;
    const filter = document.createElement("input");
    filter.type = "search";
    filter.placeholder = "Search history";
    filter.setAttribute("aria-label", "Search terminal message history");
    const list = document.createElement("div");
    const readHistory = (): string[] => {
      try {
        const value = JSON.parse(localStorage.getItem("kz-term-history") ?? "[]");
        return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string").slice(0, 100) : [];
      } catch { return []; }
    };
    let savedHistory: string[] = [];
    let historyStatus = "";
    const loadHistory = async () => {
      historyStatus = "Loading shell history…";
      drawHistory();
      try {
        const response = await fetch("/pty/history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
        if (!response.ok) throw new Error("history unavailable");
        const data = await response.json();
        savedHistory = Array.isArray(data.history) ? data.history.filter((s: unknown): s is string => typeof s === "string") : [];
        historyStatus = "";
      } catch { historyStatus = "Could not load shell history. Reopen History to retry."; }
      drawHistory();
    };
    const drawHistory = () => {
      list.replaceChildren();
      const entries = [...new Set([...readHistory(), ...savedHistory])];
      for (const text of entries.filter((s) => s.toLowerCase().includes(filter.value.toLowerCase()))) {
        const use = document.createElement("button");
        use.type = "button";
        use.textContent = text;
        use.title = "Load into message field";
        use.onclick = () => { msg.value = text; showPanel(""); msg.focus(); };
        list.append(use);
      }
      if (historyStatus) {
        const status = document.createElement("p");
        status.textContent = historyStatus;
        list.append(status);
      } else if (!list.childElementCount) list.textContent = filter.value ? "No matching commands." : "No saved shell commands or messages yet.";
    };
    filter.oninput = drawHistory;
    history.append(filter, list);
    const dock = document.createElement("nav");
    dock.className = "termdock";
    dock.hidden = true;
    dock.setAttribute("aria-label", "Terminal accessory panel");
    const icon = (paths: string) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const keyboardIcon = icon('<rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="15" width="7" height="7" rx="1"/><rect x="14" y="15" width="7" height="7" rx="1"/>');
    const historyIcon = icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
    const toggle = key("", () => showPanel(panel ? "" : "keys"), false);
    toggle.className = "termtoggle";
    toggle.innerHTML = keyboardIcon;
    toggle.setAttribute("aria-label", "Show keyboard and history");
    toggle.setAttribute("aria-expanded", "false");
    form.append(toggle);
    let panel = "";
    const showPanel = (next: string) => {
      panel = next;
      grid.hidden = next !== "keys";
      history.hidden = next !== "history";
      dock.hidden = !next;
      chips.hidden = !!next;
      pad.hidden = more.hidden = true;
      toggle.classList.toggle("on", !!next);
      toggle.setAttribute("aria-expanded", String(!!next));
      for (const b of dock.querySelectorAll<HTMLButtonElement>("[data-panel]")) {
        const active = b.dataset.panel === next;
        b.classList.toggle("on", active);
        b.setAttribute("aria-pressed", String(active));
      }
      if (next) {
        if (ta) ta.inputMode = "none";
        rawKeyboard.setAttribute("aria-pressed", "false");
        msg.blur();
        ta?.blur();
      }
      if (next === "history") void loadHistory();
    };
    for (const [label, name, svg] of [["Keyboard", "keys", keyboardIcon], ["History", "history", historyIcon]]) {
      const b = key("", () => showPanel(name), false);
      b.innerHTML = svg;
      b.dataset.panel = name;
      b.setAttribute("aria-label", label);
      b.title = label;
      dock.append(b);
    }
    msg.addEventListener("focus", () => {
      showPanel("");
      if (ta) ta.inputMode = "none";
      rawKeyboard.setAttribute("aria-pressed", "false");
    });
    bar.append(form, pad, more, chips, grid, history, dock, picker);
    el.after(bar);
    stopViewport = trackTerminalViewport();
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
    // Copy: Ctrl/Cmd+Shift+C, or Ctrl+C while text is selected, as VS Code and Windows Terminal
    // do. With nothing selected Ctrl+C stays the agent's interrupt. xterm.js sent ^C even over a
    // selection, and the desktop app has no context menu, so there was no way to copy.
    if (e.type === "keydown" && (e.ctrlKey || e.metaKey) && !e.altKey && e.code === "KeyC" && (e.shiftKey || term.hasSelection())) {
      if (term.hasSelection()) navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
      term.clearSelection();
      e.preventDefault();
      return false;
    }
    if (e.type === "keydown" && (e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyF") {
      e.preventDefault();
      openSearch();
      return false;
    }
    const next = fontStep(term.options.fontSize!, e);
    if (next === null) return true;
    e.preventDefault(); // the browser would zoom the page
    if (e.type === "keydown") fontSet(next);
    return false;
  });
  const refont = (e: Event) => {
    term.options.fontSize = (e as CustomEvent<number>).detail;
    size();
  };
  addEventListener("kz-term-font", refont);
  // Fit and tell the agent in the same tick. If xterm narrows first, the agent keeps drawing
  // at the old width until the message lands, its long lines wrap, and the frame ends up
  // shifted with junk rows above it. Each resize still makes the agent redraw its screen, so
  // a drag is throttled (first one at once, then one trailing) rather than sent per frame.
  let resizing: Timer | undefined, last = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(resizing);
    const wait = 60 - (Date.now() - last);
    if (wait <= 0) { last = Date.now(); size(); }
    else resizing = setTimeout(() => { last = Date.now(); size(); }, wait);
  });
  ro.observe(el);
  term.focus();

  return () => {
    ro.disconnect();
    clearTimeout(resizing);
    el.removeEventListener("touchstart", touchStart);
    el.removeEventListener("touchmove", touchMove);
    typed.dispose();
    stopViewport();
    bar?.remove();
    tools.remove();
    clearTimeout(retry);
    if (ws) { ws.onclose = null; ws.close(); }
    removeEventListener("kz-theme", retheme);
    removeEventListener("kz-term-font", refont);
    os.removeEventListener("change", retheme);
    term.dispose();
  };
}

(window as any).kzTerm = mountTerm;
