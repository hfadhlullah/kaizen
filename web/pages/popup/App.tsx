import { useEffect, useRef, useState, type ReactNode } from "react";

// The chat popup (`kaizen chat`): a small window over the desktop, on Home's chat: same chats, same agent. Enter sends,
// Shift+Enter is a new line, Esc closes the window. It uses no kit and no board code: its own page, its own styles
// (web/ui/legacy/popup.css), and the server's /chat routes.
type Msg = { role: "user" | "assistant"; text?: string; wait?: string; error?: string };
const K = "kz-popup-chat";
const keep = (id: string | null) => {
  try {
    id === null ? localStorage.removeItem(K) : localStorage.setItem(K, id);
  } catch {}
};
const startId = () => {
  // Popped out of Home (`kaizen chat --chat <id>`): continue that chat.
  const handed = new URLSearchParams(location.search).get("chat");
  if (handed) return (keep(handed), handed);
  try {
    return localStorage.getItem(K);
  } catch {
    return null;
  }
};
const post = (path: string, body: object) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
// The see-through window (cli/chat-window.py) moves itself; Chromium's has no handler.
const host = (window as unknown as { webkit?: { messageHandlers?: { kaizen?: { postMessage(m: string): void } } } })
  .webkit?.messageHandlers?.kaizen;

const Btn = (p: {
  id: string;
  title: string;
  hidden?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  children: ReactNode;
}) => (
  <button
    id={p.id}
    hidden={p.hidden}
    title={p.title}
    aria-label={p.title}
    onClick={p.onClick}
    onPointerDown={p.onPointerDown}
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {p.children}
    </svg>
  </button>
);

export function App() {
  const [msgs, setMsgs] = useState<Msg[]>([]),
    [busy, setBusy] = useState(false);
  const id = useRef<string | null>(null),
    list = useRef<Msg[]>([]),
    shown = useRef(0),
    on = useRef(false),
    log = useRef<HTMLDivElement>(null),
    ta = useRef<HTMLTextAreaElement>(null);
  const set = (f: (m: Msg[]) => Msg[]) => setMsgs((list.current = f(list.current)));
  const patch = (at: number, p: Partial<Msg>) => set((m) => m.map((x, i) => (i === at ? { ...x, ...p } : x)));
  // Only bubbles not shown before pop in; redraws of a streaming reply do not.
  const fresh = shown.current;
  useEffect(() => {
    shown.current = msgs.length;
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [msgs]);

  async function open() {
    if (!id.current) return;
    const r = await fetch("/chat?id=" + encodeURIComponent(id.current));
    if (!r.ok) return void ((id.current = null), set(() => []));
    const c = await r.json();
    set(() => (c.messages || []).map((m: Msg) => ({ role: m.role, text: m.text, error: m.error })));
    setBusy(!!c.busy);
    // A turn still running from before this window opened: show it when it ends.
    if (c.busy) setTimeout(open, 2000);
  }
  async function send(text: string) {
    const at = list.current.length + 1;
    set((m) => [...m, { role: "user", text }, { role: "assistant", text: "", wait: "Thinking…" }]);
    setBusy(true);
    let reply: Msg = list.current[at]!;
    const upd = (p: Partial<Msg>) => patch(at, (reply = { ...reply, ...p }));
    try {
      const r = await post("/chat", { id: id.current, text });
      if (!r.ok) return void upd({ error: (await r.json().catch(() => ({}))).error || "Could not send" });
      const rd = r.body!.getReader(),
        dec = new TextDecoder();
      let buf = "";
      for (let x; !(x = await rd.read()).done;) {
        buf += dec.decode(x.value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          let e: any;
          try {
            e = JSON.parse(buf.slice(0, i));
          } catch {
            e = {};
          }
          buf = buf.slice(i + 1);
          if (e.t === "chat") ((id.current = e.id), keep(e.id));
          if (e.t === "text") upd({ text: (reply.text ? reply.text + "\n\n" : "") + e.text, wait: undefined });
          if (e.t === "status" && !reply.text) upd({ wait: e.text });
          if (e.t === "error") upd({ error: e.error });
        }
      }
    } catch {
      upd({ error: "Lost the connection; the agent keeps going and the chat saves when it finishes." });
    } finally {
      setBusy(false);
      if (!reply.text && !reply.error) upd({ wait: "(no reply)" });
    }
  }
  useEffect(() => {
    if (on.current) return;
    on.current = true;
    id.current = startId();
    void open();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && window.close();
    addEventListener("keydown", esc);
  }, []);
  const newChat = () => {
    if (busy) return;
    id.current = null;
    keep(null);
    set(() => []);
    ta.current?.focus();
  };
  return (
    <>
      <main>
        <div id="log" ref={log}>
          {msgs.map((m, i) => (
            <div
              key={i}
              className={
                "m " +
                (m.role === "user" ? "u" : "a") +
                (m.wait ? " wait" : "") +
                (m.error ? " err" : "") +
                (i >= fresh ? " pop" : "")
              }
            >
              {m.error || m.text || m.wait || ""}
            </div>
          ))}
        </div>
        <form id="f" onSubmit={(e) => e.preventDefault()}>
          <textarea
            id="t"
            ref={ta}
            rows={1}
            placeholder="Ask kaizen…"
            autoFocus
            onInput={(e) => {
              e.currentTarget.style.height = "auto";
              e.currentTarget.style.height = e.currentTarget.scrollHeight + "px";
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              const text = e.currentTarget.value.trim();
              if (!text || busy) return;
              e.currentTarget.value = "";
              void send(text);
            }}
          />
        </form>
      </main>
      <nav>
        <Btn
          id="drag"
          hidden={!host}
          title="Drag to move"
          onPointerDown={(e) => e.button === 0 && host?.postMessage("drag")}
        >
          <circle cx="9" cy="6" r=".6" />
          <circle cx="15" cy="6" r=".6" />
          <circle cx="9" cy="12" r=".6" />
          <circle cx="15" cy="12" r=".6" />
          <circle cx="9" cy="18" r=".6" />
          <circle cx="15" cy="18" r=".6" />
        </Btn>
        <span className="sp" />
        <Btn id="stop" hidden={!busy} title="Stop" onClick={() => void post("/chat/stop", { id: id.current })}>
          <rect x="7" y="7" width="10" height="10" rx="2" />
        </Btn>
        {/* Back to the board: the server shows and focuses its window, then closes this one. */}
        <Btn id="board" title="Back to the board" onClick={() => void post("/popup/board", { id: id.current })}>
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        </Btn>
        <Btn id="new" title="New chat" onClick={newChat}>
          <path d="M12 5v14M5 12h14" />
        </Btn>
      </nav>
    </>
  );
}
