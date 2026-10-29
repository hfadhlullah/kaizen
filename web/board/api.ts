import { store } from "./store.ts";
import { key, render } from "./cards.ts";
import { $, vt } from "./dom.ts";
import { close, ideaBody, open, openRun } from "./panel.ts";
import { notifyUser, toast } from "./toast.ts";
import { openTerms, termsShowing } from "./terms.ts";
import { refreshBoardBadge } from "./badge.ts";

// The server writes notifier() from state.ts over a marker in board.html: one rule for both UIs.
declare const due: (key: string, say: string | null, done: boolean, now: number) => boolean;

// In-card agents waiting on input, by session key. null until the first /state: what is
// already asking when the page loads is not news, only what starts asking after.
let asked: Set<string> | null = null;

// Each card's column and whether it needed you, as of the last /state: a card that changed
// column slides to the new one, one that starts needing you flashes. null: the first load is not news.
let before: Map<string, [number, boolean]> | null = null;

// This page's project, sent with each request: the server keeps none, so another
// tab or a phone picking a project never moves this one.
export const dirHeader = () => (store.dir ? { "x-kz-dir": store.dir } : {});
let latestLoad = 0;
// quiet: the server said something changed, nobody asked for a redraw.
export async function load(quiet) {
  const current = ++latestLoad;
  let r;
  try {
    r = await fetch("/state" + (store.all ? "?all=1" : ""), { headers: dirHeader() });
  } catch {
    toast(GONE);
    return;
  }
  const next = await r.json();
  if (current !== latestLoad) return;
  const was = store.openKey && store.S.cards.find((x) => key(x) === store.openKey);
  store.S = next;
  if (!store.all) void refreshBoardBadge();
  // Home follows a project switch without the board importing it.
  dispatchEvent(new Event("kz-state"));
  {
    const seen = new Map();
    for (const c of store.S.cards) {
      const b = key(c),
        n = seen.get(b) || 0;
      seen.set(b, n + 1);
      c._k = n ? b + "#" + n : b;
    }
  }
  for (const c of store.S.cards) {
    if (c.kind !== "run" || c.archived) continue;
    if (due(key(c), c.notice, c.status === "done", store.S.now)) notifyUser(c.notice);
  }
  {
    const now = new Map(store.S.cards.filter((c) => !c.archived && c.pty?.alive && c.pty.asking).map((c) => [c.pty.key, c]));
    if (asked && document.hidden)
      for (const [k, c] of now) if (!asked.has(k)) notifyUser(`${c.kind === "run" ? c.id : String(c.text).split("\n")[0].slice(0, 80)} needs you`, "ask:" + k);
    asked = new Set(now.keys());
  }
  const need = (c) => c.status === "waiting" || !!(c.pty?.alive && c.pty.asking),
    moved = [];
  for (const c of before ? store.S.cards : []) {
    const b = before.get(key(c));
    if (b && b[0] !== c.column) moved.push(key(c));
    if (b && !b[1] && need(c)) store.flash.add(key(c));
  }
  before = new Map(store.S.cards.map((c) => [key(c), [c.column, need(c)]]));
  // The old and new element of a moved card share a view-transition-name, so the browser slides one into the other.
  const name = () =>
    moved.forEach((k, i) => {
      const el = $("board").querySelector(`[data-k="${CSS.escape(k)}"]`);
      if (el) el.style.viewTransitionName = "kzm" + i;
    });
  // A redraw under a form being typed in would reset its fields and its focus.
  if (!(quiet && store.mode && $("board").querySelector(".inl input"))) {
    name();
    await (moved.length ? vt(() => (render(), name())) : (render(), undefined));
    store.flash.clear();
  } else store.flash.clear(); // no redraw now: a flash at some later one would be stale
  if (termsShowing()) openTerms();
  // Run on an idea closed the panel: open the card on its agent once the board knows the session.
  if (store.wantTerm && !store.openKey && !store.mode) {
    const n = store.S.cards.find((x) => key(x) === store.wantTerm && x.pty);
    if (n) {
      store.wantTerm = null;
      open(n);
      return;
    }
  }
  if (store.openKey) {
    const c = store.S.cards.find((x) => key(x) === store.openKey),
      ta = $("pbody").querySelector(".notes textarea");
    if (ta && document.activeElement === ta) return;
    if (!c) {
      if (was && was.kind === "idea") follow(was);
      return;
    }
    if (store.runDoc && c.kind === "run") openRun(c, true, true);
    else if (c.kind === "idea") ideaBody(c);
  }
}
// An idea's card goes when its run starts. Follow it to that run rather than keep
// offering "Run again": the newest run in its project whose request holds the idea's
// text, the rule boardCards() retires it by. No such run: close the panel.
// ponytail: checks the five newest runs, one /run fetch each; a run that took the idea
// further back than that closes the panel instead.
async function follow(idea) {
  const k = key(idea),
    norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim(),
    t = norm(idea.text);
  for (const r of store.S.cards
    .filter((x) => x.kind === "run" && x.state === idea.state)
    .sort((a, b) => (b.moved ?? 0) - (a.moved ?? 0))
    .slice(0, 5)) {
    const d = await fetch(`/run/${encodeURIComponent(r.id)}?dir=${encodeURIComponent(r.state)}`)
      .then((x) => x.json())
      .catch(() => null);
    if (store.openKey !== k) return;
    if (norm(d?.request || "").includes(t)) {
      open(r);
      return;
    }
  }
  if (store.openKey === k) close();
}
// A tab outliving its server would otherwise swallow every click: say so.
const GONE = "The board server is not running — start it with kaizen web (or the shortcut), then reload.";
export async function post(path, body) {
  let r;
  try {
    r = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...dirHeader() },
      body: JSON.stringify(body),
    });
  } catch {
    toast(GONE);
    return { ok: false };
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = j.error || j.why || "That did not work";
    toast(m, { title: m.slice(0, 80), what: `POST ${path} failed (HTTP ${r.status}): ${m}` });
    if (j.manual) console.log("run manually:", j.manual);
  }
  return j;
}
