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
  const typed = term.onData((d) => send({ t: "i", d }));
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
    ws.onclose = null;
    ws.close();
    term.dispose();
  };
}

(window as any).kzTerm = mountTerm;
