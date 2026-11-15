// The run panel's reader, a hook of the panel (pages/board/panel.tsx). The panel store says which card is up and what it asked
// for (panel-actions.ts); this hook reads the card's /run reply, and derives what the panel shows from the card, the reply and the
// tab (panel-derive.ts): the header, the tabs, the document or notes or Source control body, the Fix form and the footer. A run
// is read again after each changed /state; a task is drawn again with its card. Nothing waits on a draw: an open is a write,
// and the panel follows.
import { useEffect, useLayoutEffect, useRef } from "react";
import { toast } from "@lib/core";
import { cardKey as key, getServer, useServer } from "@lib/server";
import { getRoute } from "@lib/router";
import { gitLeave, gitPendingIn, gitShownIn, gitTab } from "@lib/git";
import { setNotes } from "@lib/notes";
import { showTerm, termStop } from "./card-terminal.ts";
import { deriveRun, taskPanel } from "./panel-derive.ts";
import { editingNotes, getPanel, panelWaiters, setPanel, usePanel } from "./panel-store.ts";

let markN = 0; // each request to mark a line is a new number, so the document marks it once
const settle = () => {
  for (const f of [...panelWaiters]) f();
  panelWaiters.clear();
};
// The live copy of the open card; the one the open passed only while its own first draw has not happened.
const cardOf = (fresh: boolean) => getServer().state.cards.find((x: any) => key(x) === getPanel().openKey) ?? (fresh ? getPanel().card : null);

export function usePanelRun() {
  const k = usePanel((s) => s.openKey),
    openN = usePanel((s) => s.openN),
    fetchAsk = usePanel((s) => s.fetchAsk),
    drawAsk = usePanel((s) => s.drawAsk),
    runDoc = usePanel((s) => s.runDoc),
    state = useServer((s) => s.state);
  const asked = useRef(""), // the open and read the last read answered
    landed = useRef(""), // the open whose own read has landed
    drawn = useRef(""); // the open that has drawn
  const id = `${k}|${openN}`;

  // The read: for a new open, a read again, or a changed /state (not while notes are being typed: a redraw would wipe them).
  useEffect(() => {
    const c = cardOf(drawn.current !== id);
    if (!k || !c || c.kind !== "run") return void settle();
    const ask = `${id}|${fetchAsk}`,
      fresh = asked.current !== ask;
    asked.current = ask;
    if (!fresh && getPanel().runDoc?.id === c.id && editingNotes()) return;
    const ac = new AbortController();
    fetch(`/run/${encodeURIComponent(c.id)}?dir=${encodeURIComponent(c.state)}`, { signal: ac.signal })
      .then((r) => r.json())
      .then(
        (d) => {
          if (getPanel().openKey !== k) return;
          // A run that is gone answers {error} with no id: not a document. Whoever waits on this read is let go.
          if (!d || d.id !== c.id) {
            toast(d?.error || "Could not read this run");
            return settle();
          }
          landed.current = id;
          setPanel({ runDoc: d });
        },
        () => ac.signal.aborted || settle(),
      );
    // A newer open, a changed /state or closing aborts it, so a slow reply never draws another card as this run.
    return () => ac.abort();
  }, [k, openN, fetchAsk, state]);

  // The draw: a run when its reply lands (every /state change reads again) or a tab or redraw is asked for; a task whenever its card
  // changes. Layout effect: the panel never paints the previous card's header under the new title.
  const idea = k && cardOf(true)?.kind === "idea";
  useLayoutEffect(() => {
    const first = drawn.current !== id,
      c = cardOf(first);
    if (!k || !c) return;
    const p = getPanel();
    // A new open waits for its own read; a redraw of what is up leaves notes being typed alone.
    if (c.kind === "run" && first && landed.current !== id) return;
    if (!first && editingNotes()) return;
    if (c.kind === "run" && p.runDoc?.id !== c.id) return;
    drawn.current = id;
    if (p.wantTerm === key(c)) setPanel({ wantTerm: null });
    if (c.kind === "idea") {
      const t = taskPanel(c);
      setPanel({ head: t.head, tabs: [], tab: "", ptabs: [], footer: t.footer });
      // A task's panel: its terminal while the run it started is being born there, else its notes. In the run workspace the
      // agent is a centre tab; on the Tasks page a task shows its notes only.
      if (c.pty && getRoute().view !== "run" && getRoute().view !== "tasks") showTerm(c);
      else {
        termStop();
        setPanel((s) => ({ body: "notes", top: s.top + 1 }));
        setNotes({ view: { card: c, src: c.notes, ro: !!c.archived || c.status !== "idea" } });
      }
      return settle();
    }
    const d = deriveRun({
      card: c,
      runDoc: p.runDoc,
      wantTab: p.wantTab,
      view: getRoute().view,
      wide: getRoute().view === "run" || innerWidth > 640,
      git: { shown: gitShownIn(c, p.runDoc), pending: gitPendingIn(c, p.runDoc) },
      hit: p.hit,
      refresh: !first,
      key,
    });
    termStop();
    if (d.tab !== "git") gitLeave();
    setPanel((s) => ({
      wide: false,
      head: d.head,
      tabs: d.tabs,
      tab: d.tab,
      wantTab: d.tab,
      ptabs: d.tabs.map((t) => t.k),
      fix: d.fix,
      footer: d.footer,
      ...(d.kind === "doc" ? { body: "doc" as const, doc: { ...d.doc!, mark: d.needle && first ? ++markN : 0 }, top: s.top + 1 } : {}),
      ...(d.kind === "notes" ? { body: "notes" as const, top: s.top + 1 } : {}),
    }));
    if (d.kind === "notes") setNotes({ view: d.notes! });
    else if (d.kind === "git") gitTab(c);
    // Only the panel the link asked for: another card opened meanwhile drops the request.
    if (p.hit && first) {
      if (p.hit.k === key(c) && !d.needle) toast("That item is not in this run");
      setPanel({ hit: null });
    }
    settle();
  }, [k, openN, drawAsk, runDoc, idea ? state : null]);
}
