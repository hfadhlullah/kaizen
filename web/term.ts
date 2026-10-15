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
  const ro = new ResizeObserver(size);
  ro.observe(el);
  term.focus();

  return () => {
    ro.disconnect();
    typed.dispose();
    ws.onclose = null;
    ws.close();
    term.dispose();
  };
}

(window as any).kzTerm = mountTerm;
