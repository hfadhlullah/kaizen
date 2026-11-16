// What the Icebox does: every request it posts (POST /icebox, /reply, /sources, /chatgpt, /google), the words it
// toasts, and how the cursor, the selection and the open item move with them. Components call these; nothing here
// draws. Routes and payloads are the old page's, unchanged.
import { post, host, toast, toastUndo } from "@lib/core";
import { gatherLine, hostOf, iceKey, sameName, snoozedLine, stepPast, type IceItem, type Source, PLAT } from "./icebox.ts";
import { getIce, patchCap, setIce, type Ask, type Capture } from "./icebox-store.ts";
import { refreshIce } from "./use-icebox.ts";

// After a change: the board's own data (counts, the rail badge) and the Icebox, and focus back to the cursor
// row when the pressed button went away with its row.
const settle = async () => {
  host.reload();
  await refreshIce();
  requestAnimationFrame(() => {
    if (!document.activeElement || document.activeElement === document.body)
      document.querySelector<HTMLElement>("[data-cur] [data-title]")?.focus();
  });
};
const step = (gone: IceItem[]) => {
  const s = getIce();
  setIce({ cur: stepPast(s.order, s.cur, new Set(gone.map(iceKey))) });
};
const byDir = (its: IceItem[]) =>
  [...new Set(its.map((it) => it.dir))].map((d) => [d, its.filter((it) => it.dir === d)] as const);

// ---- dialogs asked as a promise, drawn by the page (components/icebox/collection-dialog.tsx, confirm-dialog.tsx)
const ask = <T>(a: (done: (v: T) => void) => Ask) =>
  new Promise<T>((res) =>
    setIce({
      ask: a((v) => {
        setIce({ ask: null });
        res(v);
      }),
    }),
  );
// A new collection: its name and whether it is a client's. Null when cancelled.
export const askCollection = (where = "") =>
  ask<{ name: string; client: boolean } | null>((done) => ({ kind: "collection", where, done }));
export const askConfirm = (title: string, description: string, label: string, danger = false) =>
  ask<boolean>((done) => ({ kind: "confirm", title, description, label, danger, done }));

// ---- one request
export async function iceAct(op: "promote" | "dismiss" | "restore", it: IceItem, msg: string, extra = {}) {
  step([it]);
  const j = await post("/icebox", { op, dir: it.dir, ids: [it.id], ...extra });
  if (j.ok) {
    if (op === "promote" && getIce().open === iceKey(it)) setIce({ open: null, armed: null, form: null });
    toast(msg);
  }
  await settle();
}
// Snooze: the items leave the page until their day, with Undo on the toast.
export async function snoozeAll(its: IceItem[], until: string) {
  if (!its.length) return;
  step(its);
  setIce({ busy: true });
  const done: IceItem[] = [];
  try {
    for (const [dir, xs] of byDir(its))
      if ((await post("/icebox", { op: "snooze", dir, ids: xs.map((it) => it.id), until })).ok) done.push(...xs);
  } finally {
    setIce({ busy: false });
  }
  if (done.length) {
    const gone = new Set(done.map(iceKey));
    setIce((s) => ({ sel: s.sel.filter((k) => !gone.has(k)) }));
    toastUndo(snoozedLine(done.length, until), async () => {
      let back = 0;
      for (const [dir, xs] of byDir(done))
        if ((await post("/icebox", { op: "unsnooze", dir, ids: xs.map((it) => it.id) })).ok) back++;
      if (back) {
        setIce({ cur: iceKey(done[0]!) });
        toast("Back in the icebox");
      }
      await settle();
    });
  }
  await settle();
}
// Kind and collection: the item stays, changed.
export async function setOne(it: IceItem, body: Record<string, unknown>, msg: string) {
  const j = await post("/icebox", { dir: it.dir, ids: [it.id], ...body });
  if (j.ok) toast(msg);
  await settle();
}
export async function setBoard(it: IceItem, board: string) {
  if (board === "\n") {
    const a = await askCollection();
    if (!a) return;
    if (a.client) await post("/icebox", { op: "boards", act: "add", dir: it.dir, name: a.name, client: true });
    board = a.name;
  }
  return setOne(it, { op: "board", board }, board ? `Moved to ${board}` : "Moved to the Inbox");
}
// Bulk: one dismiss per project; promote one request at a time, each its own task titled as gathered (one promote
// call with several ids would merge them into one).
export async function bulkDo(op: "promote" | "dismiss") {
  const keys = new Set(getIce().sel),
    its = getIce().order.filter((it) => keys.has(iceKey(it)));
  if (!its.length) return;
  step(its);
  setIce({ busy: true });
  let ok = 0;
  try {
    if (op === "dismiss")
      for (const [dir, xs] of byDir(its)) {
        const ids = xs.map((it) => it.id);
        if ((await post("/icebox", { op, dir, ids })).ok) ok += ids.length;
      }
    else for (const it of its) if ((await post("/icebox", { op, dir: it.dir, ids: [it.id] })).ok) ok++;
  } finally {
    setIce({ busy: false });
  }
  setIce({ sel: [] });
  if (ok)
    toast(
      `${ok} ${op === "promote" ? "promoted to Tasks" : "dismissed"}${ok < its.length ? `, ${its.length - ok} not` : ""}`,
    );
  await settle();
}
// The phone row's drag: right makes a task, left dismisses (with Undo on the toast).
export async function rowDecide(it: IceItem, op: "promote" | "dismiss"): Promise<boolean> {
  if (host.motion()) await new Promise((ok) => setTimeout(ok, 180));
  host.pop();
  step([it]);
  const j = await post("/icebox", { op, dir: it.dir, ids: [it.id] });
  if (j.ok) {
    if (op === "dismiss")
      toastUndo("Dismissed", async () => {
        if ((await post("/icebox", { op: "restore", dir: it.dir, ids: [it.id] })).ok) {
          setIce({ cur: iceKey(it) });
          toast("Back in the icebox");
        }
        await settle();
      });
    else toast("Made a task");
  } else toast(`Could not ${op}: ${j.error || "kaizen did not answer"}`);
  await settle();
  return !!j.ok;
}

// ---- the promote form: a clean title for the task's card and the person's own details; what was gathered is
// added to the task's notes by the server.
export function armPromote(it: IceItem) {
  const k = iceKey(it),
    s = getIce();
  setIce({
    cur: k,
    open: k,
    armed: k,
    view: "sort",
    form: s.form?.k === k ? s.form : { k, title: it.text, details: "" },
  });
  if (s.data?.gatherer?.connected && s.task?.k !== k) void taskDraft(it);
}
// Ask for a draft; when it comes, fill the form only where the person has not typed.
export async function taskDraft(it: IceItem) {
  const k = iceKey(it),
    f0 = getIce().form,
    before = { title: f0?.k === k ? f0.title : it.text, details: f0?.k === k ? f0.details : "" },
    prev = getIce().task;
  setIce({
    task: { k, wait: true, title: prev?.k === k ? prev.title : "", details: prev?.k === k ? prev.details : "" },
  });
  const r = await fetch("/icebox", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "task-draft", dir: it.dir, ids: [it.id] }),
  })
    .then((x) => x.json())
    .catch(() => ({ error: "kaizen did not answer" }));
  if (getIce().task?.k !== k) return;
  const f = getIce().form;
  if (r.ok && r.title) {
    const untouched = f?.k !== k || (f.title === before.title && f.details === before.details);
    if (f?.k === k && untouched)
      setIce({
        task: { k, wait: false, title: r.title, details: r.details || "" },
        form: { k, title: r.title, details: r.details || "" },
      });
    else if (f?.k === k) setIce({ task: { k, wait: false, title: f.title, details: f.details, kept: true } });
    else setIce({ task: { k, wait: false, title: r.title, details: r.details || "" } });
  } else
    setIce({ task: { k, wait: false, title: "", details: "", note: r.error || r.note || "ChatGPT did not answer" } });
}
export const cancelPromote = () => setIce({ armed: null });
export function submitPromote(it: IceItem) {
  const f = getIce().form,
    title = f?.k === iceKey(it) ? f.title.trim() : "";
  if (!title) return false;
  void iceAct("promote", it, "Promoted to Tasks", { text: title, details: f!.details });
  return true;
}

// ---- reply: a gathered post can be answered. Reply drafts, the box is the approval, Send reply posts that text.
export const replyStyle = (dir: string) => {
  const s = getIce().styles;
  if (!s[dir])
    try {
      s[dir] = localStorage.getItem("kz-reply-style:" + dir) || "";
    } catch {}
  return s[dir] || "casual";
};
export function setReplyStyle(dir: string, v: string) {
  setIce((s) => ({ styles: { ...s.styles, [dir]: v } }));
  try {
    localStorage.setItem("kz-reply-style:" + dir, v);
  } catch {}
}
export async function replyDraft(it: IceItem) {
  const k = iceKey(it);
  setIce({ reply: { k, text: "", wait: true } });
  const j = await post("/reply", { op: "draft", dir: it.dir, id: it.id, style: replyStyle(it.dir) });
  if (getIce().reply?.k !== k) return;
  setIce({ reply: { k, text: j.text || "", note: j.ok ? j.note || "" : "", wait: false } });
}
// Another draft in the picked style, told to differ from the one in the box; the box keeps its text until it lands.
export async function replyAgain(it: IceItem) {
  const r = getIce().reply;
  if (!r) return;
  setIce({ reply: { ...r, again: true } });
  const j = await post("/reply", { op: "draft", dir: it.dir, id: it.id, style: replyStyle(it.dir), avoid: r.text });
  const now = getIce().reply;
  if (!now || now.k !== r.k) return;
  setIce({ reply: { ...now, again: false, text: j.text || now.text, note: j.ok ? j.note || "" : "" } });
}
export const replyText = (text: string) => setIce((s) => (s.reply ? { reply: { ...s.reply, text } } : {}));
export const replyCancel = () => setIce({ reply: null });
export async function replySend(it: IceItem) {
  const r = getIce().reply;
  if (!r) return;
  setIce({ reply: { ...r, busy: true } });
  const j = await post("/reply", { op: "send", dir: it.dir, id: it.id, text: r.text });
  if (j.ok) {
    setIce({ reply: null });
    toast("Reply posted");
  } else if (j.sent) setIce({ reply: null });
  else setIce((s) => (s.reply ? { reply: { ...s.reply, busy: false } } : {}));
  await settle();
}

// ---- swipe: one waiting request at a time, decided by drag, button or arrow key
export const startSwipe = () =>
  setIce({ swipe: { n: 0, pro: 0, dis: 0, t0: Date.now(), last: null, skip: new Map(), busy: false, pop: false } });
export const exitSwipe = () => setIce({ swipe: null });
// A decision flies the card off (`fly`, by the card's own element), clicks when the board's sound is on, then posts.
export async function swGo(op: "promote" | "dismiss" | "skip", fly?: (dir: 1 | -1) => Promise<void | (() => void)>) {
  const S = getIce().swipe,
    it = getIce().deck[0];
  if (!S || S.busy || !it) return;
  const k = iceKey(it);
  if (op === "skip") {
    if (getIce().deck.length < 2) return;
    const max = Math.max(...getIce().deck.map((x) => S.skip.get(iceKey(x)) || 0));
    setIce({ swipe: { ...S, skip: new Map(S.skip).set(k, max + 1) } });
    return;
  }
  setIce({ swipe: { ...S, busy: true } });
  const home = await fly?.(op === "promote" ? 1 : -1);
  host.pop();
  const j = await post("/icebox", { op, dir: it.dir, ids: [it.id] });
  const now = getIce().swipe;
  if (now) {
    if (j.ok)
      setIce({
        swipe: {
          ...now,
          busy: false,
          n: now.n + 1,
          pro: now.pro + (op === "promote" ? 1 : 0),
          dis: now.dis + (op === "dismiss" ? 1 : 0),
          // Only a dismiss can be undone here: a promote has already made a task card.
          last: op === "dismiss" ? it : null,
          pop: true,
        },
      });
    else {
      setIce({ swipe: { ...now, busy: false } });
      home?.(); // the card flew off for a decision that did not happen: bring it back
      toast(`Could not ${op}: ${j.error || "kaizen did not answer"}`);
    }
  }
  await settle();
}
export async function swUndo() {
  const S = getIce().swipe,
    it = S?.last;
  if (!S || !it || S.busy) return;
  setIce({ swipe: { ...S, busy: true } });
  const j = await post("/icebox", { op: "restore", dir: it.dir, ids: [it.id] });
  const now = getIce().swipe;
  if (now) {
    if (j.ok) {
      setIce({
        swipe: {
          ...now,
          busy: false,
          n: now.n - 1,
          dis: now.dis - 1,
          last: null,
          skip: new Map(now.skip).set(iceKey(it), -1),
        },
      });
      toast("Restored");
    } else setIce({ swipe: { ...now, busy: false } });
  }
  await settle();
}
// Icebox zero: the day's streak counts days in a row the stack was emptied, per project filter, in this browser.
export function streak(dir: string | null): number {
  const key = "kz-ice-streak:" + (dir || "all"),
    day = (t: number) => new Date(t).toLocaleDateString("sv"),
    today = day(Date.now());
  let st = { last: "", days: 0 };
  try {
    st = JSON.parse(localStorage.getItem(key) || "") || st;
  } catch {}
  if (st.last !== today) st = { last: today, days: st.last === day(Date.now() - 864e5) ? st.days + 1 : 1 };
  try {
    localStorage.setItem(key, JSON.stringify(st));
  } catch {}
  return st.days;
}

// ---- the capture box: a note, a link, a picture, a dictation, saved to the picked collection
export async function saveCapture(to: string | null, focus: () => void) {
  const c = getIce().cap,
    text = c.text.trim();
  if (c.busy) return;
  if (!text) {
    if (c.files.length) toast("Write a line about it first");
    return focus();
  }
  if (!to) return toast("Pick a project first");
  patchCap({ busy: true });
  let j: Record<string, any> = { ok: false };
  try {
    j = await post("/icebox", {
      op: "add",
      dir: to,
      text,
      board: c.board || undefined,
      files: await host.dataUrls(c.files),
    });
  } finally {
    patchCap({ busy: false });
  }
  if (j.ok) {
    patchCap({ text: "", files: [] });
    setIce({ cur: null });
    toast(`Added to the icebox${c.board ? " · " + c.board : ""}`);
    host.reload();
  }
  await refreshIce();
  focus();
}
// "+ Collection": a name, and whether it is a client's (its items then count as Client).
export async function newCollection(to: string | null, where: string) {
  if (!to) return toast("Pick a project first");
  const a = await askCollection(where);
  if (!a) return;
  const j = await post("/icebox", { op: "boards", act: "add", dir: to, name: a.name, client: a.client });
  if (j.ok) {
    toast(`Collection ${a.name} made`);
    host.reload();
  }
  await refreshIce();
}
// The capture picker's "New collection…": a client's one is made first, then it is the box's board.
export async function pickCaptureBoard(v: string, to: string | null) {
  if (v === "\n") {
    if (!to) return (toast("Pick a project first"), false);
    const a = await askCollection();
    if (!a) return false;
    const j = await post("/icebox", { op: "boards", act: "add", dir: to, name: a.name, client: a.client });
    if (!j.ok) return (toast(j.error || "Could not make the collection"), false);
    toast(`Collection ${a.name} made`);
    await refreshIce();
    v = a.name;
  }
  patchCap({ board: v, boardDir: to });
  return true;
}
// Remove a collection after asking; its items go back to the Inbox. A box or a filter on it falls back to the Inbox.
export async function removeCollection(dir: string, name: string, items: number) {
  const ok = await askConfirm(
    `Remove ${name}?`,
    items ? `Its ${items} ${items === 1 ? "item goes" : "items go"} to the Inbox.` : "It has no items.",
    "Remove",
    true,
  );
  if (!ok) return;
  const j = await post("/icebox", { op: "boards", act: "remove", dir, name });
  if (!j.ok) return toast(j.error || "Could not remove the collection");
  const s = getIce();
  if (sameName(s.cap.board, name)) patchCap({ board: "", boardDir: null });
  if (sameName(s.board, name)) setIce({ board: "" });
  toast(`Collection ${name} removed`);
  host.reload();
  await refreshIce();
}

// ---- sources
// One change to a source, then what changed is shown.
export async function srcAct(body: Record<string, unknown>, done: (j: Record<string, any>) => void) {
  const j = await post("/sources", body);
  if (j.ok) {
    done(j);
    host.reload();
  }
  await refreshIce();
  return j;
}
const title = (s: Source) => s.label || hostOf(s.url);
export const checkNow = (s: Source) =>
  srcAct({ op: "gather", dir: s.dir, url: s.url }, (j) => {
    const r = j.results?.[0];
    toast(r ? (r.ok ? `${title(s)}: ${r.note}${r.added ? " in the icebox" : ""}` : `Failed: ${r.note}`) : "Checked");
  });
// A social source is read by the agent, so Gather opens one on /kaizen gather (or ChatGPT reads it).
export const gatherSocial = (s: Source) =>
  srcAct({ op: "agent", dir: s.dir, url: s.url }, (j) => {
    const r = j.results?.[0];
    toast(
      j.via === "chatgpt"
        ? r?.ok
          ? `${title(s)}: ${r.note}${r.added ? " in the icebox" : ""}`
          : `Failed: ${r ? r.note : "no answer"}`
        : "/kaizen gather opened in your terminal: " + host.agentLine(j.agent),
    );
  });
export async function removeSource(s: Source) {
  const ok = await askConfirm(
    `Remove ${title(s)}?`,
    "What it gathered stays; added again later, it may bring back ones you deleted or dismissed.",
    "Remove",
    true,
  );
  if (ok) await srcAct({ op: "remove", dir: s.dir, url: s.url }, () => toast("Source removed"));
}
export const moveSource = (s: Source, to: string) =>
  srcAct({ op: "move", dir: s.dir, to, url: s.url }, () => toast("Source moved"));
export const saveCategory = (s: Source, category: string) =>
  srcAct({ op: "category", dir: s.dir, url: s.url, category }, () =>
    toast(category ? `New requests from ${title(s)} go under ${category}` : "Category cleared"),
  );
export const setAutoGather = (s: Source, on: boolean) =>
  srcAct({ op: "paused", dir: s.dir, url: s.url, on: !on }, () => toast(on ? "Auto gather on" : "Auto gather off"));
export async function setWriteBack(s: Source, on: boolean, googleConnected: boolean) {
  if (on && s.social === undefined && /docs\.google\.com/.test(s.url) && !googleConnected) {
    toast("Connect Google first (Sources header), so kaizen can write to the sheet.");
    return;
  }
  if (
    on &&
    !(await askConfirm(
      "Write back to this source?",
      "When a promoted request's run is done, kaizen will write that back to this source. A closed issue or a changed cell is visible to others.",
      "Turn on",
    ))
  )
    return;
  await srcAct({ op: "writeback", dir: s.dir, url: s.url, on }, () => toast(on ? "Write back on" : "Write back off"));
}
export const gatherAll = (dir: string, list: Source[]) =>
  srcAct({ op: "gather", dir: dir || undefined }, (j) => toast(gatherLine(j.results || [], list)));
export type NewSource = {
  social: boolean;
  url: string;
  q: string;
  plat: string;
  label: string;
  category: string;
  to: string;
};
// A social source is a platform and what to follow; the server builds its link, and nothing is gathered here: the
// agent reads it. A link is gathered at once.
export async function addSource(n: NewSource) {
  const body = n.social
    ? {
        op: "add",
        dir: n.to,
        platform: n.plat,
        query: n.q,
        label: n.label || `${PLAT[n.plat]}: ${n.q}`,
        category: n.category,
      }
    : { op: "add", dir: n.to, url: n.url, label: n.label, category: n.category };
  const j = await post("/sources", body);
  if (j.ok && n.social) {
    toast("Source added");
    host.reload();
  } else if (j.ok) {
    const g = await post("/sources", { op: "gather", dir: n.to, url: n.url }),
      r = g.results?.[0];
    toast(r ? (r.ok ? `Source added: ${r.note} in the icebox` : `Source added, but: ${r.note}`) : "Source added");
    host.reload();
  } else toast(j.error || "Could not add source");
  if (j.ok) setIce({ srcAdd: false });
  await refreshIce();
  return !!j.ok;
}

// ---- ChatGPT and Google. The tab is opened inside the click, before the sign-in URL comes back: a popup blocker
// lets only that through. The board hears of the result through /events.
async function signIn(route: string, fail?: string) {
  const w = window.open("", "_blank"),
    j = await post(route, { op: "connect" });
  if (j.ok && w) w.location.href = j.url;
  else {
    w?.close();
    if (j.ok) location.href = j.url;
    else if (fail) toast(j.error || fail);
  }
}
export const connectChatGPT = () => signIn("/chatgpt");
export function connectGoogle(hasClient: boolean) {
  if (!hasClient) {
    toast("Add your Google client in Settings first");
    host.openSettings("google");
    return;
  }
  return signIn("/google", "Could not start Google sign-in");
}
export async function disconnect(route: "/chatgpt" | "/google") {
  const g = route === "/google",
    ok = await askConfirm(
      g ? "Disconnect Google?" : "Disconnect ChatGPT?",
      g ? "Done requests stop being written to sheets." : "Gather goes back to your agent.",
      "Disconnect",
    );
  if (ok && (await post(route, { op: "disconnect" })).ok) {
    toast(g ? "Google disconnected" : "ChatGPT disconnected");
    await refreshIce();
  }
}
export async function skipChatGPT() {
  if ((await post("/chatgpt", { op: "skip" })).ok) await refreshIce();
}
export type { Capture };
