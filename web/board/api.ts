import { store } from "./store.ts";
import { getBoard } from "@lib/board";
import { notifier } from "@lib/core";
import { askingNow, changes, dirHeader, newlyAsking, setEngine, type Seen } from "@lib/server";
import { key, render } from "./cards.ts";
import { $, vt } from "./dom.ts";
import { close, taskBody, open, openRun } from "./panel.ts";
import { notifyUser, toast } from "./toast.ts";
import { termsChanged } from "./terms.ts";
import { editingNotes } from "@lib/run";

// The server reads are lib/server's (one poller, one store); what is left here is what the board does with a new /state:
// the notifications, the cards' redraw and slide, and the open card's panel.
export { dirHeader, flushLoad, load } from "@lib/server";

// When a run's notice is worth a notification (one rule for both UIs: lib/core/notifier.ts).
const due = notifier();

// In-card agents waiting on input, by session key. null until the first /state: what is
// already asking when the page loads is not news, only what starts asking after.
let asked: Set<string> | null = null;

// Each card's column and whether it needed you, as of the last /state: a card that changed
// column slides to the new one, one that starts needing you flashes. null: the first load is not news.
let before: Seen | null = null;

setEngine(async (next, prev) => {
  const was = store.openKey && prev.cards.find((x) => key(x) === store.openKey);
  for (const c of next.cards) {
    if (c.kind !== "run" || c.archived) continue;
    if (due(key(c), c.notice, c.status === "done", next.now)) notifyUser(c.notice);
  }
  {
    const now = askingNow(next.cards);
    if (document.hidden)
      for (const c of newlyAsking(asked, now))
        notifyUser(`${c.kind === "run" ? c.id : String(c.text).split("\n")[0].slice(0, 80)} needs you`, "ask:" + c.pty.key);
    asked = new Set(now.keys());
  }
  const { moved, flash, next: seen } = changes(before, next.cards);
  for (const k of flash) store.flash.add(k);
  before = seen;
  // The old and new element of a moved card share a view-transition-name, so the browser slides one into the other.
  const name = () =>
    moved.forEach((k, i) => {
      const el = $("board").querySelector(`[data-k="${CSS.escape(k)}"]`);
      if (el) el.style.viewTransitionName = "kzm" + i;
    });
  // A form being typed in is React state: a redraw keeps its fields and its focus.
  name();
  await (moved.length ? vt(() => (render(), name())) : (render(), undefined));
  store.flash.clear();
  termsChanged();
  // Run on a task closed the panel: open the card on its agent once the board knows the session.
  if (store.wantTerm && !store.openKey && !getBoard().form) {
    const n = store.S.cards.find((x) => key(x) === store.wantTerm && x.pty);
    if (n) {
      store.wantTerm = null;
      open(n);
      return;
    }
  }
  if (store.openKey) {
    const c = store.S.cards.find((x) => key(x) === store.openKey);
    // The textarea is hidden under the rich editor: focus anywhere in the notes counts.
    if (editingNotes()) return;
    if (!c) {
      if (was && was.kind === "idea") follow(was);
      return;
    }
    if (store.runDoc && c.kind === "run") openRun(c, true, true);
    else if (c.kind === "idea") taskBody(c);
  }
});
// A task's card goes when its run starts. Follow it to that run rather than keep
// offering "Run again": the newest run in its project whose request holds the task's
// text, the rule boardCards() retires it by. No such run: close the panel.
// ponytail: checks the five newest runs, one /run fetch each; a run that took the task
// further back than that closes the panel instead.
async function follow(task) {
  const k = key(task),
    norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim(),
    t = norm(task.text);
  for (const r of store.S.cards
    .filter((x) => x.kind === "run" && x.state === task.state)
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
const GONE = "The kaizen server is not running — start it with kaizen web (or the shortcut), then reload.";
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
