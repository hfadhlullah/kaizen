import { store } from "./store.ts";
import { key, render } from "./cards.ts";
import { $ } from "./dom.ts";
import { close, ideaBody, open, openRun } from "./panel.ts";
import { notifyUser, toast } from "./toast.ts";

// The server writes notifier() from state.ts over a marker in board.html: one rule for both UIs.
declare const due: (key: string, say: string | null, done: boolean, now: number) => boolean;

// This page's project, sent with each request: the server keeps none, so another
// tab or a phone picking a project never moves this one.
export const dirHeader = () => (store.dir ? { "x-kz-dir": store.dir } : {});
// quiet: the server said something changed, nobody asked for a redraw.
export async function load(quiet) {
  let r;
  try {
    r = await fetch("/state" + (store.all ? "?all=1" : ""), { headers: dirHeader() });
  } catch {
    toast(GONE);
    return;
  }
  const was = store.openKey && store.S.cards.find((x) => key(x) === store.openKey);
  store.S = await r.json();
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
  // A redraw under a form being typed in would reset its fields and its focus.
  if (!(quiet && store.mode && $("board").querySelector(".inl input"))) render();
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
    if (store.runDoc) openRun(c, true, true);
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
