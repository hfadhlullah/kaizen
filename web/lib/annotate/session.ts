// The Browser tab's annotator, board side: the state (a Zustand store), the keys and the conversation with the page.
// The page is served by the board's proxy on another origin (cli/annotate-proxy.ts) and runs web/annotate/annotate.ts
// (web/dist/annotate.js); the two talk only by postMessage, and this side accepts a message only from the frame window,
// from the proxy's origin, with the token the proxy handed out when it was opened. Notes live here (and in localStorage,
// without crops). The toolbar and the notes list are components/annotate; this file draws nothing.
import { create } from "zustand";
import { post, toast } from "@lib/core";
import {
  editedComment,
  formatBody,
  fromPage,
  loadNotes,
  loadSettings,
  markersOf,
  plural,
  saveNotes,
  saveSettings,
  sendBody,
  without,
  type Note,
  type Settings,
} from "./notes.ts";
import { accept, acceptHost, isHttpUrl, isLoopbackUrl, mapUrl, newToken } from "./rules.ts";

export type Px = { origin: string; token: string; target: string };
export type AnnState = {
  settings: Settings;
  on: boolean; // picking
  hide: boolean; // markers hidden on the page
  pause: boolean; // page animations frozen
  want: boolean; // the Annotate button is pressed
  list: boolean; // the notes list is open
  setOpen: boolean; // the settings box (inside the list) is open
  px: Px | null; // the proxy this page was opened through, or the webview's own origin
  notes: Note[];
  flash: number | null; // the note whose marker was just clicked on the page
};
export type AnnotatorOpts = {
  frame: () => HTMLElement | null; // an <iframe>, or in the desktop app a <webview> (talks over IPC, not postMessage)
  wsKey: string;
  run: () => { dir: string; id: string } | null;
  onLocation: (u: string) => void;
  reload: () => void;
};
export type Annotator = ReturnType<typeof createAnnotator>;

export function createAnnotator(o: AnnotatorOpts) {
  const notes = loadNotes(o.wsKey);
  const use = create<AnnState>(() => ({
    settings: loadSettings(),
    on: false,
    hide: false,
    pause: false,
    want: false,
    list: false,
    setOpen: false,
    px: null,
    notes,
    flash: null,
  }));
  const get = use.getState,
    set = use.setState;
  let counter = notes.reduce((m, n) => Math.max(m, n.n), 0);
  // The Browser pane is on screen (its workspace is shown, on the run view, and this tab is the one in front). A kept, hidden
  // pane keeps its window listeners, so keys and the page's messages are ignored while it is not: `x` on Tasks must not wipe
  // the notes, and `s` must not send them to the run of another workspace.
  let shown = true;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  const webview = () => {
    const f = o.frame();
    return f?.tagName === "WEBVIEW" ? (f as any) : null;
  };
  const frameWin = () => (o.frame() as HTMLIFrameElement | null)?.contentWindow ?? null;
  const say = (m: Record<string, unknown>) => {
    const { px } = get();
    if (!px) return;
    const msg = { kz: 1, t: px.token, ...m };
    const web = webview();
    if (web) {
      try {
        web.send("kz-ann", msg);
      } catch {
        /* not loaded yet: the page says ready when it is */
      }
    } else frameWin()?.postMessage(msg, px.origin);
  };
  // What the page is told: how to pick, and the notes' markers.
  const push = () => {
    const s = get();
    say({
      type: "config",
      cfg: {
        on: s.on,
        mode: s.settings.mode,
        hide: s.hide,
        block: s.settings.block,
        color: s.settings.color,
        components: s.settings.components,
        pause: s.pause,
      },
    });
    say({ type: "markers", list: markersOf(s.notes) });
  };
  const setNotes = (next: Note[]) => {
    set({ notes: next });
    saveNotes(o.wsKey, next);
    say({ type: "markers", list: markersOf(next) });
  };

  const clear = () => setNotes([]);
  async function copy() {
    const { notes: ns, settings: s } = get();
    if (!ns.length) return;
    const r = await post("/annotate/format", formatBody(ns, s));
    if (!r?.ok) return;
    try {
      await navigator.clipboard.writeText(r.text);
    } catch {
      say({ type: "copy", text: r.text });
    }
    toast(`Copied ${plural(ns.length, "note")}`);
    if (s.clear) clear();
  }
  async function send() {
    const run = o.run();
    if (!run) return void toast("Open this run's agent first: there is nothing to send to.");
    const { notes: ns, settings: s } = get();
    if (!ns.length) return;
    const r = await post("/annotate/send", sendBody(run, ns, s));
    if (!r?.ok) return;
    toast(`Sent ${plural(r.sent, "note")} to the agent${r.crops ? `, ${plural(r.crops, "crop")} saved` : ""}`);
    if (s.clear) clear();
  }

  const api = {
    use,
    live(on: boolean) {
      shown = on;
    },
    // Picking mode and the tools.
    setMode(m: string) {
      const settings = { ...get().settings, mode: m };
      set({ settings, on: true });
      saveSettings(settings);
      push();
    },
    pick() {
      set({ on: !get().on });
      push();
    },
    togglePause() {
      set({ pause: !get().pause });
      push();
    },
    toggleHide() {
      set({ hide: !get().hide });
      push();
    },
    toggleList() {
      set({ list: !get().list });
    },
    toggleSettings() {
      const open = !get().setOpen;
      set({ setOpen: open, ...(open ? { list: true } : {}) });
    },
    // The Annotate button's second press, or the bar's own close: back to the page's own address.
    close() {
      set({ want: false, on: false, pause: false, list: false, px: null });
      o.reload();
    },
    clear,
    copy,
    send,
    // A setting changed: saved at once; the page is told the ones it acts on (colour, blocking, component names).
    setting(k: keyof Settings, v: string | boolean) {
      const settings = { ...get().settings, [k]: v };
      set({ settings });
      saveSettings(settings);
      if (k === "color" || k === "block" || k === "components") push();
    },
    removeNote(n: number) {
      setNotes(without(get().notes, n));
    },
    editNote(n: number, text: string) {
      const next = editedComment(get().notes, n, text);
      if (next !== get().notes) {
        set({ notes: next });
        saveNotes(o.wsKey, next);
      }
    },
    // Pressing a mode that is already on turns picking off.
    mode(m: string) {
      const s = get();
      return s.on && s.settings.mode === m ? api.pick() : api.setMode(m);
    },

    // Keys on the board's own side (the page forwards the same ones from inside the frame).
    key(k: string) {
      if (k === "toggle") return api.pick();
      if (!get().on) return;
      if (k === "p") api.togglePause();
      else if (k === "h") api.toggleHide();
      else if (k === "c") void copy();
      else if (k === "s") void send();
      else if (k === "x") clear();
      else if (k === "esc") api.pick();
    },

    proxied: () => !!get().px,
    active: () => get().on,
    // Open this address, through the proxy when Annotate is on; returns the address for the frame, or null to load it directly.
    async open(u: string): Promise<string | null> {
      inject = false;
      const { want } = get();
      // A public site in the desktop app's webview: no proxy can add the script, so the board puts it in after each load.
      if (want && webview() && isHttpUrl(u) && !isLoopbackUrl(u)) {
        const origin = new URL(u).origin;
        set({ px: { origin, token: newToken(), target: origin }, on: false });
        inject = true;
        return null; // loaded directly; dom-ready puts the annotator in
      }
      if (!want || !isLoopbackUrl(u)) {
        set({ px: null, on: false, pause: false });
        return null;
      }
      const r = await post("/annotate/open", { url: u });
      if (!r?.ok) {
        set({ want: false, px: null });
        return null;
      }
      set({ px: { origin: r.origin, token: r.token, target: new URL(u).origin } });
      return r.url;
    },
    closeProxy() {
      inject = false;
      set({ px: null, on: false, pause: false });
    },
    toggle() {
      set({ want: !get().want });
      o.reload();
    },
    // The window's listeners: keys, the page's messages, the webview's own events. Returns the way back.
    listen,
  };

  // A message from the page.
  const handle = (d: any) => {
    const { px } = get();
    if (!px) return;
    if (d.type === "ready") {
      set({ on: true });
      push();
    } else if (d.type === "loc") {
      const u = mapUrl(String(d.href), px.origin, px.target);
      if (u) o.onLocation(u);
    } else if (d.type === "key") api.key(String(d.key));
    else if (d.type === "marker") {
      set({ flash: Number(d.n) });
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => set({ flash: null }), 900);
    } else if (d.type === "note" && d.note) {
      const note = fromPage(d.note, get().notes.length, counter + 1, px);
      if (!note) return;
      counter++;
      setNotes([...get().notes, note]);
    }
  };
  // Typed keys: Ctrl/Cmd+Shift+F toggles; P H C S X and Escape work when nothing is being typed into.
  const onKey = (e: KeyboardEvent) => {
    if (!shown || !get().px) return;
    const t = e.target as HTMLElement;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      return api.key("toggle");
    }
    if (
      (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    )
      return;
    const k = e.key.toLowerCase();
    if (k === "escape") api.key("esc");
    else if (k.length === 1 && "phcsx".includes(k)) api.key(k);
  };
  const onMsg = (e: MessageEvent) => {
    const { px } = get();
    // A hidden pane still takes `ready` (a page that reloaded while away must get its picker config and markers again) and
    // `loc` (its address); keys, notes and markers are for a pane on screen.
    const t = e.data?.type;
    if ((shown || t === "ready" || t === "loc") && px && accept(e, frameWin(), px.origin, px.token)) handle(e.data);
  };
  // The desktop app's webview: put the script in after each load, with this open's token (annotate.js reads __kzAnnToken).
  // The webview's preload relays its messages; only ones carrying the token are taken (acceptHost).
  let inject = false,
    src: string | null = null;
  const injectNow = async () => {
    const web = webview();
    if (!web || !inject || !get().px) return;
    try {
      const origin = new URL(web.getURL()).origin;
      set({ px: { ...get().px!, origin, target: origin } });
    } catch {
      /* about:blank */
    }
    src ??= await fetch("/annotate.js").then(
      (r) => (r.ok ? r.text() : null),
      () => null,
    );
    const px = get().px;
    if (!src || !inject || !px) return;
    web.executeJavaScript(`window.__kzAnnToken=${JSON.stringify(px.token)};\n${src}`).catch(() => {});
  };
  const onIpc = (e: any) => {
    const px = get().px;
    if (px && e.channel === "kz-ann" && acceptHost(e.args?.[0], px.token)) handle(e.args[0]);
  };
  const onDom = () => void injectNow();
  function listen() {
    const web = webview();
    addEventListener("keydown", onKey);
    addEventListener("message", onMsg);
    web?.addEventListener("dom-ready", onDom);
    web?.addEventListener("ipc-message", onIpc);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("message", onMsg);
      web?.removeEventListener("dom-ready", onDom);
      web?.removeEventListener("ipc-message", onIpc);
      clearTimeout(flashTimer);
    };
  }
  return api;
}
