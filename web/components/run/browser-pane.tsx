import { createElement, useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import {
  FAR,
  clearBrowse,
  expose,
  frameable,
  isLoopback,
  keepUrl,
  landed,
  navBack,
  navFwd,
  navReload,
  navTo,
  openAppWindow,
  run,
  start,
  startUrl,
  useLayout,
  withScheme,
  type Nav,
} from "@lib/run";
import { createAnnotator } from "@lib/annotate";
import { AnnotatePanel } from "@components/annotate";
import { cn, toast } from "@lib/core";
import { Icon } from "@web/ui";

type Act = { t: "go"; u: string } | { t: "reload" | "back" | "fwd" } | { t: "landed"; u: string };
const step = (n: Nav, a: Act): Nav =>
  a.t === "go"
    ? navTo(n, a.u)
    : a.t === "reload"
      ? navReload(n)
      : a.t === "back"
        ? navBack(n)
        : a.t === "fwd"
          ? navFwd(n)
          : landed(n, a.u);

// On a phone over the tailnet, localhost is the phone itself: framing it shows nothing useful.
const loopback = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
// In the desktop app the page is a <webview> in its own persistent session (desktop/src/browser-pane.ts): a first-party
// page with its own cookies. An iframe on the board's 127.0.0.1 origin made localhost:8000 third-party, so its Lax
// session cookie never came back, and the framing blocks screen capture. Browsers keep the iframe.
const web = !!(window as any).kaizenDesktop?.browserPane;
const FRAME = web
  ? { class: "rframe", title: "Browser", allowpopups: "" }
  : {
      className: "rframe",
      title: "Browser",
      // Dev apps run; a framed page cannot navigate the board itself (no allow-top-navigation).
      sandbox:
        "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads",
      // Without these the browser blocks microphone, camera and screen capture for the framed page.
      allow: "display-capture; microphone; camera; clipboard-read; clipboard-write; fullscreen",
    };
const small = "size-[15px]";

// The Browser tab: an address bar over a frame. Its three parts keep the board's own CSS (kz-keep: the kit's preflight
// would reset their padding and borders, and the annotator draws its toolbar and notes list inside the frame's row). The address is kept per workspace; a run's Preview sets it when the
// run reaches review (a request in the layout store). The frame is an iframe (a <webview> in the desktop app) that
// React renders but never writes the address of: it is loaded by hand so a re-render does not reload the page.
export function BrowserPane({ wsk }: { wsk: string }) {
  const [nav, dispatch] = useReducer(step, wsk, (k) => start(startUrl(k))),
    [draft, setDraft] = useState(nav.url),
    [frameOn, setFrameOn] = useState(true),
    // What the note under the bar says: text, or the page that refuses to be framed.
    [note, setNote] = useState<{ text?: string; refused?: string } | null>(null),
    [ext, setExt] = useState<string | null>(null),
    req = useLayout((s) => s.browse),
    frame = useRef<HTMLIFrameElement>(null),
    // The annotator (lib/annotate): its state, keys and the page's messages; AnnotatePanel draws its toolbar and notes.
    [ann] = useState(() =>
      createAnnotator({
        frame: () => frame.current,
        wsKey: wsk,
        run: () => run.act.currentRun(),
        reload: () => dispatch({ t: "reload" }),
        // The framed page navigated on its own: show its address, do not load it again.
        onLocation: (u) => dispatch({ t: "landed", u }),
      }),
    ),
    annOn = ann.use((s) => s.want),
    cur = useRef(nav.url);
  cur.current = nav.url;

  useEffect(() => {
    // The page navigated on its own (a link, a form, a redirect after login): show its address. Through the
    // annotator's proxy the page reports its address itself (onLocation).
    if (!web) return;
    const f = frame.current!,
      nav2 = (e: any) => {
        if (e.isMainFrame === false || ann.proxied() || !/^https?:\/\//.test(e.url)) return;
        dispatch({ t: "landed", u: e.url });
      };
    f.addEventListener("did-navigate", nav2);
    f.addEventListener("did-navigate-in-page", nav2);
  }, [wsk]);

  useEffect(() => {
    keepUrl(wsk, nav.url);
    setDraft(nav.url);
  }, [wsk, nav.url]);

  // A request from outside (a run reached review, `kaizen preview`, Run app): go to that address.
  useEffect(() => {
    if (req?.k !== wsk) return;
    clearBrowse();
    // A tab that just opened on this address (the request was written with it) has nothing to go to.
    if (nav.load === 0 && req.url === nav.url) return;
    dispatch({ t: "go", u: req.url });
  }, [req, wsk]);

  // The frame loads when the history says so (go, back, forward, reload), not on every change of address.
  useEffect(() => {
    const u = cur.current,
      f = frame.current!,
      here = () => cur.current === u;
    setExt(null);
    if (!loopback && isLoopback(u)) {
      // The board serves that port to the tailnet and the frame opens its tailnet address.
      setFrameOn(false);
      setNote({ text: "Opening this page for this device…" });
      expose(u)
        .then((j) => {
          if (!here()) return;
          if (!j.ok) return void setNote({ text: `${FAR} (${j.error})` });
          setNote(j.hint ? { text: j.hint } : null);
          setFrameOn(true);
          f.src = j.url!;
          setExt(j.url!);
        })
        .catch(() => here() && setNote({ text: FAR }));
      return;
    }
    setFrameOn(true);
    setNote(null);
    let live = true;
    // Annotate on: a loopback page is framed through the board's proxy (annotate-proxy.ts), which adds the picker.
    void ann.open(u).then((via) => {
      if (!live) return;
      f.src = via ?? u;
      // Most public sites refuse to be framed (X-Frame-Options / frame-ancestors), and the browser only shows its own
      // error page. The board asks the site first and says so. A webview is a top-level page: nothing refuses.
      if (via || web) return;
      frameable(u)
        .then((j) => {
          if (!here() || j.frameable !== false) return;
          setFrameOn(false);
          f.removeAttribute("src");
          setNote({ refused: u });
        })
        .catch(() => {});
    });
    return () => {
      live = false;
    };
  }, [nav.load]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    dispatch({ t: "go", u: withScheme(draft) });
  };
  return (
    <>
      <form className="urlbar kz-keep" onSubmit={submit}>
        <button type="button" title="Back" aria-label="Back" onClick={() => dispatch({ t: "back" })}>
          ‹
        </button>
        <button type="button" title="Forward" aria-label="Forward" onClick={() => dispatch({ t: "fwd" })}>
          ›
        </button>
        <button type="button" title="Reload" aria-label="Reload" onClick={() => dispatch({ t: "reload" })}>
          <Icon name="refresh" className={small} />
        </button>
        <input
          className="sel"
          aria-label="Address"
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          className={cn("rwin", annOn && "on")}
          hidden={!loopback}
          title="Pick elements on this page and send notes to the agent (localhost pages)"
          onClick={ann.toggle}
        >
          <Icon name="eye" className={small} />
          <span>Annotate</span>
        </button>
        <a className="rwin" target="_blank" rel="noopener" href={ext ?? nav.url} title="Open in a new browser tab">
          <Icon name="popout" className={small} />
          <span>New tab</span>
        </a>
      </form>
      <div className="annrow kz-keep">
        {createElement(web ? "webview" : "iframe", { ref: frame, hidden: !frameOn, ...FRAME })}
        <AnnotatePanel ann={ann} />
      </div>
      <p className="rnote kz-keep" hidden={!note}>
        {note?.refused ? <Refused u={note.refused} /> : note?.text}
      </p>
    </>
  );
}

// The fallback card: the page refuses to be framed, so offer it outside the board.
function Refused({ u }: { u: string }) {
  return (
    <>
      <b>This page refuses to be shown inside kaizen</b>
      {new URL(u).host} sends a header that forbids framing.{" "}
      <a className="rwin" target="_blank" rel="noopener" href={u}>
        <Icon name="popout" className={small} />
        <span>Open in new tab</span>
      </a>
      {loopback && isLoopback(u) && (
        <button
          type="button"
          className="rwin"
          title="Open in an app window"
          onClick={() => void openAppWindow(u).then((why) => why && toast(why))}
        >
          <Icon name="popout" className={small} />
          <span>Open in app window</span>
        </button>
      )}
    </>
  );
}
