// The in-card terminal: xterm.js on the board's /pty WebSocket. Bundled into
// web/term.js by `bun run build:web`; the board loads it (`termLoad` in web/board/agent-term.ts) the first time a card's
// Terminal tab opens and calls window.kzTerm(el, key).
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

function mountTerm(el: HTMLElement, key: string, onEnd?: () => void): () => void {
  const css = getComputedStyle(el);
  const tok = (n: string) => css.getPropertyValue(n).trim() || undefined;
  const term = new Terminal({
    cursorBlink: true,
    fontFamily: tok("--mono"),
    fontSize: 12,
    scrollback: 5000,
    theme: {
      background: tok("--bg"),
      foreground: tok("--ink-hi"),
      cursor: tok("--accent"),
      selectionBackground: tok("--line"),
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(el);

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
  // Phone/tablet: a bar of the keys a soft keyboard lacks. Ctrl and Alt are sticky —
  // they modify the next key typed, from the soft keyboard or the bar. The ⌨ button
  // hides the native keyboard (inputmode none) so the bar alone drives the terminal.
  const mods = { ctrl: false, alt: false };
  const typed = term.onData((d) => {
    if (d.length === 1 && mods.ctrl && /[a-z@[\\\]^_]/i.test(d)) d = String.fromCharCode(d.toUpperCase().charCodeAt(0) & 31);
    if (mods.alt) d = "\x1b" + d;
    mods.ctrl = mods.alt = false;
    bar?.querySelectorAll(".on").forEach((b) => b.classList.remove("on"));
    send({ t: "i", d });
  });
  let bar: HTMLElement | null = null;
  if (matchMedia("(pointer: coarse)").matches) {
    const arrow = (c: string) => () => `\x1b${term.modes.applicationCursorKeysMode ? "O" : "["}${c}`;
    const keys: [string, string | (() => string) | "ctrl" | "alt" | "kbd"][] = [
      ["Esc", "\x1b"], ["Tab", "\t"], ["↵", "\r"], ["⇧⇥", "\x1b[Z"], ["Ctrl", "ctrl"], ["Alt", "alt"],
      ["←", arrow("D")], ["↑", arrow("A")], ["↓", arrow("B")], ["→", arrow("C")], ["^C", "\x03"], ["⌨", "kbd"],
    ];
    bar = document.createElement("div");
    bar.className = "termkeys";
    for (const [label, v] of keys) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      // pointerdown + preventDefault: the tap must not move focus off the terminal, or the keyboard closes.
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (v === "ctrl" || v === "alt") b.classList.toggle("on", (mods[v] = !mods[v]));
        else if (v === "kbd") {
          const ta = el.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
          if (ta) ta.inputMode = ta.inputMode === "none" ? "text" : "none";
          b.classList.toggle("on", ta?.inputMode === "none");
          ta?.blur();
          ta?.focus();
        } else send({ t: "i", d: (typeof v === "function" ? v() : v) as string });
        term.focus();
      });
      bar.append(b);
    }
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
  const ro = new ResizeObserver(size);
  ro.observe(el);
  term.focus();

  return () => {
    ro.disconnect();
    el.removeEventListener("touchstart", touchStart);
    el.removeEventListener("touchmove", touchMove);
    typed.dispose();
    bar?.remove();
    ws.onclose = null;
    ws.close();
    term.dispose();
  };
}

(window as any).kzTerm = mountTerm;
