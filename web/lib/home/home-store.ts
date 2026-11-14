// Home's state and requests: the chats, the open one, a reply on its way, the files waiting to go. Same routes as the old
// board/home.ts: /chats, /chat (GET one, POST streams newline-delimited JSON), /chat/delete, /chat/stop, /popup/open,
// /popup/handoff. The page (pages/home-page.tsx) only reads and calls these.
import { create } from "zustand";
import { flushSync } from "react-dom";
import { ask, host, toast } from "@lib/core";
import { applyEvent, fits, lines, readLine, type Chat, type ListedChat, type Msg } from "./home.ts";

type Home = {
  chats: ListedChat[];
  cur: Chat | null; // the open chat, as /chat returns it; null is a new one
  sending: boolean;
  remoteBusy: boolean; // a turn started elsewhere (another tab, before a reload) is still running
  side: boolean; // the chat list beside the conversation
  files: File[];
  here: string | null; // the project a new chat starts in: the board's, unless it shows every project or none
  tick: number; // bumped to draw the open chat again after a change made in place
};
const phone = () => matchMedia("(max-width:640px)").matches;
// The chat list: open or closed, kept per browser. A phone opens it as a drawer, closed at first.
const sideAtStart = () => {
  try {
    return !phone() && localStorage.getItem("kz-hist") !== "0";
  } catch {
    return !phone();
  }
};
export const useHome = create<Home>()(() => ({
  chats: [],
  cur: null,
  sending: false,
  remoteBusy: false,
  side: false, // set when Home first opens (sideAtStart): tests load this module with no window
  files: [],
  here: null,
  tick: 0,
}));
export const getHome = useHome.getState;
export const setHome = useHome.setState;
const touch = () => setHome((s) => ({ tick: s.tick + 1 }));
const DK = "kz-d:";
let poll: ReturnType<typeof setTimeout> | undefined;

const remember = (id: string | null) => {
  try {
    id ? sessionStorage.setItem("kz-chat", id) : sessionStorage.removeItem("kz-chat");
  } catch {}
};
const json = (u: string, b: object) =>
  fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
// The project a new chat starts in: the board's, unless it shows every project or none.
export const hereNow = () => {
  const d = host.scopeDir();
  return d && host.projects().some((p) => p.dir === d) ? d : null;
};
export const syncHere = () => {
  const here = hereNow();
  if (here !== getHome().here) setHome({ here });
};
// The board follows the chat into its project.
const follow = (d: string | null | undefined) => d && d !== host.currentDir() && void host.pickProject(d);

export function setSide(on: boolean) {
  setHome({ side: on });
  if (!phone())
    try {
      localStorage.setItem("kz-hist", on ? "1" : "0");
    } catch {}
}
export async function refreshChats() {
  try {
    setHome({ chats: (await (await fetch("/chats")).json()).chats || [] });
  } catch {
    setHome({ chats: [] });
  }
}
// fn as a view transition where the browser has them and motion is on; resolves once the DOM is updated.
const vt = (fn: () => void): Promise<void> =>
  host.motion() && document.startViewTransition
    ? document.startViewTransition(() => flushSync(fn)).updateCallbackDone
    : (fn(), Promise.resolve());

export function newChat() {
  const s = getHome();
  if (s.sending) return;
  clearTimeout(poll);
  remember(null);
  void vt(() =>
    setHome({ cur: null, files: [], remoteBusy: false, side: phone() ? false : s.side, here: hereNow() }),
  ).then(() => document.getElementById("hq")?.focus());
}
export async function show(id: string) {
  const c: Chat & { error?: string } = await (await fetch("/chat?id=" + encodeURIComponent(id))).json();
  if (c.error) return toast(c.error);
  const was = getHome();
  // The list's busy dot is from the last /chats: a turn that ended since redraws it.
  const chats = was.chats.map((x) => (x.id === c.id ? { ...x, busy: !!c.busy } : x));
  remember(c.id);
  setHome({ chats, cur: c, remoteBusy: !!c.busy, files: was.cur?.id === c.id ? was.files : [], tick: was.tick + 1 });
  follow(c.project);
  // A turn started from another tab, or before a reload, is still running: follow it until it saves.
  clearTimeout(poll);
  if (c.busy && !getHome().sending) poll = setTimeout(() => getHome().cur?.id === id && void show(id), 2000);
}
export async function deleteChat(id: string, title: string) {
  if (!(await ask({ title: "Delete this chat?", description: title, confirmLabel: "Delete", danger: true }))) return;
  const r = await json("/chat/delete", { id });
  if (!r.ok) return toast((await r.json()).error);
  if (getHome().cur?.id === id) (setHome({ cur: null, remoteBusy: false }), remember(null));
  await refreshChats();
}
export const stop = () => void json("/chat/stop", { id: getHome().cur?.id });
export const popOut = () =>
  json("/popup/open", { id: getHome().cur?.id })
    .then((r) => r.ok || toast("Could not open the popup"))
    .catch(() => toast("Could not open the popup"));
export function addFiles(list: File[]) {
  if (getHome().sending) return void toast("Wait for the current reply");
  const files = [...getHome().files];
  for (const f of list) {
    if (!fits(files, f)) {
      toast("Up to 5 files, 10 MB each and 20 MB total");
      break;
    }
    files.push(f);
  }
  setHome({ files });
}
export const removeFile = (i: number) => setHome((s) => ({ files: s.files.filter((_, n) => n !== i) }));

export async function send(text: string) {
  text = text.trim();
  const s0 = getHome();
  if ((!text && !s0.files.length) || s0.sending || s0.remoteBusy) return;
  const files = s0.files;
  clearTimeout(poll);
  const at = new Date().toISOString();
  const was = s0.cur ? s0.cur.id : "new";
  const fresh = !s0.cur || !s0.cur.messages.length;
  // The chat object is mutated as the reply streams in; `touch` draws it again.
  const cur: Chat = s0.cur ?? { id: null, title: text || files[0]!.name, project: hereNow(), messages: [] };
  const reply: Msg = { role: "agent", text: "", steps: [], activity: "Thinking…", at };
  cur.messages.push({ role: "user", text, files: files.map((f) => ({ name: f.name })), at }, reply);
  try {
    sessionStorage.removeItem(DK + "home:" + was);
    if (fresh) sessionStorage.setItem("kz-chat-pending", at);
  } catch {}
  // The first message: the box glides from the middle to the bottom.
  await (fresh ? vt : (f: () => void) => (f(), Promise.resolve()))(() =>
    setHome({ cur, files: [], sending: true, tick: s0.tick + 1 }),
  );
  let accepted = false;
  try {
    const r = files.length
      ? await fetch("/chat", {
          method: "POST",
          body: (() => {
            const form = new FormData();
            form.set("id", cur.id || "");
            form.set("text", text);
            form.set("project", cur.project || "");
            files.forEach((f) => form.append("files", f));
            return form;
          })(),
        })
      : await json("/chat", { id: cur.id, text, project: cur.project });
    if (!r.ok) {
      reply.error = (await r.json()).error || "Could not send";
      setHome((s) => ({ files: [...files, ...s.files] }));
      return;
    }
    accepted = true;
    const rd = r.body!.getReader(),
      dec = new TextDecoder(),
      feed = lines();
    for (let x; !(x = await rd.read()).done;) {
      for (const line of feed(dec.decode(x.value, { stream: true }))) {
        const e = readLine(line);
        if (!e) continue;
        const got = applyEvent(cur, reply, e);
        if (got.id) {
          remember(got.id);
          try {
            sessionStorage.removeItem("kz-chat-pending");
          } catch {}
          // In the list from its first message, marked busy, not only once the turn ends.
          void refreshChats();
        }
        if (got.project) follow(got.project);
        touch();
      }
    }
  } catch {
    reply.error = "Lost the connection; the agent keeps going and the chat saves when it finishes.";
    if (!accepted) setHome((s) => ({ files: [...files, ...s.files] }));
  } finally {
    try {
      sessionStorage.removeItem("kz-chat-pending");
    } catch {}
    setHome({ sending: false });
    delete reply.activity;
    if (accepted && cur.id) {
      try {
        await show(cur.id);
      } catch {
        setHome({ remoteBusy: false });
        touch();
      }
    } else (setHome({ remoteBusy: false }), touch());
    await refreshChats();
  }
}

// The Home view opens: every chat, and the open one kept.
let started = false;
export async function openHome() {
  if (!started) ((started = true), setHome({ side: sideAtStart() }));
  syncHere();
  await refreshChats();
  const { chats } = getHome();
  let id: string | null | undefined;
  try {
    id = sessionStorage.getItem("kz-chat");
  } catch {}
  if (!id) {
    try {
      const pending = sessionStorage.getItem("kz-chat-pending");
      if (pending) id = chats.find((c) => c.updated >= pending)?.id;
    } catch {}
  }
  // A new tab has no chat of its own yet: a chat still working is the one to follow.
  if (!id) id = chats.find((c) => c.busy)?.id;
  if (id && chats.some((c) => c.id === id)) await show(id);
  else (remember(null), setHome({ cur: null }));
}
// Back from the popup (`kaizen chat`): the server brings this window back and hands over the chat the popup was on.
export async function takeHandoff() {
  const r = await fetch("/popup/handoff")
    .then((r) => r.json())
    .catch(() => null);
  if (!r?.id) return;
  await refreshChats();
  if (getHome().chats.some((c) => c.id === r.id)) await show(r.id);
}
