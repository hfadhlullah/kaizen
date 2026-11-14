import { flushSync } from "react-dom";
import { notifier, notifyUser, vt } from "@lib/core";
import { askingNow, changes, cardKey as key, getServer, newlyAsking, setEngine, type Seen } from "@lib/server";
import { close, editingNotes, getPanel, open, openRun, taskBody, work } from "@lib/run";
import { termsChanged } from "@lib/terminal";
import { getBoard, setBoard } from "./board-store.ts";
import { refreshBoard } from "./snapshot.ts";

// The server reads are lib/server's (one poller, one store); what is left here is what the board does with a new /state:
// the notifications, the cards' redraw and slide, and the open card's panel.
// When a run's notice is worth a notification (one rule for both UIs: lib/core/notifier.ts).
const due = notifier();

// In-card agents waiting on input, by session key. null until the first /state: what is
// already asking when the page loads is not news, only what starts asking after.
let asked: Set<string> | null = null;

// Each card's column and whether it needed you, as of the last /state: a card that changed
// column slides to the new one, one that starts needing you flashes. null: the first load is not news.
let before: Seen | null = null;

export const initOnState = () => setEngine(async (next, prev) => {
  const was = getPanel().openKey && prev.cards.find((x) => key(x) === getPanel().openKey);
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
  before = seen;
  // The old and new element of a moved card share a view-transition-name, so the browser slides one into the other:
  // the names go on the cards as they are, then the new state is drawn inside the transition.
  const names = Object.fromEntries(moved.map((k, i) => [k, "kzm" + i]));
  setBoard({ flash: [...flash] });
  if (moved.length) {
    flushSync(() => setBoard({ names }));
    await vt(() => refreshBoard(true));
    setBoard({ names: {}, flash: [] });
  } else {
    refreshBoard();
    setBoard({ flash: [] });
  }
  termsChanged();
  // Run on a task closed the panel: open the card on its agent once the board knows the session.
  if (work.wantTerm && !getPanel().openKey && !getBoard().form) {
    const n = getServer().state.cards.find((x) => key(x) === work.wantTerm && x.pty);
    if (n) {
      work.wantTerm = null;
      open(n);
      return;
    }
  }
  if (getPanel().openKey) {
    const c = getServer().state.cards.find((x) => key(x) === getPanel().openKey);
    // The textarea is hidden under the rich editor: focus anywhere in the notes counts.
    if (editingNotes()) return;
    if (!c) {
      if (was && was.kind === "idea") follow(was);
      return;
    }
    if (work.runDoc && c.kind === "run") openRun(c, true, true);
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
  for (const r of getServer().state.cards
    .filter((x) => x.kind === "run" && x.state === task.state)
    .sort((a, b) => (b.moved ?? 0) - (a.moved ?? 0))
    .slice(0, 5)) {
    const d = await fetch(`/run/${encodeURIComponent(r.id)}?dir=${encodeURIComponent(r.state)}`)
      .then((x) => x.json())
      .catch(() => null);
    if (getPanel().openKey !== k) return;
    if (norm(d?.request || "").includes(t)) {
      open(r);
      return;
    }
  }
  if (getPanel().openKey === k) close();
}
