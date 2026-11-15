// What asks the run panel for something: open a card, a tab, an item of a run, a read again, close. Each is a write to the
// panel store; nothing here draws or awaits a draw. usePanelRun (use-panel-run.ts) answers by reading the run and publishing
// what the panel shows. Keys, the host bridge, the /state reaction, the workspace and search all call these.
import { cardKey as key, getServer } from "@lib/server";
import { isPhone, toast } from "@lib/core";
import { stopDictation } from "@lib/dictation";
import { deepOf, getRoute } from "@lib/router";
import { cardEl } from "@lib/board";
import { gitLeave } from "@lib/git";
import { termStop } from "./card-terminal.ts";
import { defaultTab, TABS, tipOf, titleOf } from "./panel-derive.ts";
import { getPanel, panelWaiters, setPanel, usePanel } from "./panel-store.ts";
import { setFlip } from "./run-view-store.ts";
import { openPreview, openWorkspace, projectNotes } from "./workspace.ts";

const bump = (f: "fetchAsk" | "drawAsk") => usePanel.setState((s) => ({ [f]: s[f] + 1 }) as any);

// Opens a card's panel. A run is worked on in its workspace, which docks this panel; so is everything on a phone. Tasks keep
// the panel on the Board and Tasks pages. An archived run has no workspace row: it stays here to be restored. `keepTab`: a link
// already chose the tab.
export function openPanel(c: any, keepTab?: boolean) {
  const view = getRoute().view,
    here = view === "board" || view === "tasks";
  if (view !== "run" && (isPhone() || !here || (c.kind === "run" && !c.archived))) {
    setPanel({ keepNext: !!keepTab });
    return void openWorkspace(c);
  }
  keepTab ||= getPanel().keepNext;
  stopDictation(true); // the panel body is about to be replaced
  gitLeave();
  usePanel.setState((s) => ({
    keepNext: false,
    openKey: key(c),
    card: c,
    openN: s.openN + 1,
    off: [],
    open: true,
    title: titleOf(c),
    titleTip: tipOf(c),
    // A task has no /run reply; a run keeps the last one on screen until its own read lands.
    ...(c.kind === "idea" ? { runDoc: null, ptabs: [] } : {}),
    ...(c.kind !== "idea" && !keepTab ? { wantTab: defaultTab(c) } : {}),
  }));
}
// A link from a note (?run= or ?idea=, with dir, tab, item) opens that card's panel; a finding or backlog item named is
// scrolled to and marked, found by its text since the rendered list does not carry the numbers.
export function deep() {
  const d = deepOf(location.search);
  if (!d) return;
  history.replaceState(null, "", location.pathname + "?all=1");
  const c = getServer().state.cards.find(
    (x) => x.state === d.dir && (d.run ? x.kind === "run" && x.id === d.run : x.kind === "idea" && x.text === d.idea),
  );
  if (!c) {
    toast(d.run ? "That run was not found" : "That task was not found");
    return;
  }
  const t = TABS.find((x) => x[1] === d.tab);
  setPanel({ ...(t ? { wantTab: t[1] } : {}), hit: d.item ? { type: d.item.type, n: d.item.n, k: key(c) } : null });
  openPanel(c, !!t);
}
// A run's panel on the tab of one of its items, that item scrolled to and marked.
export function openAt(c: any, type: string, n: number) {
  setPanel({ wantTab: type === "finding" ? "review" : "backlog", hit: { type, n, k: key(c) } });
  openPanel(c, true);
}
// `page`: a page change closes the board's own panel although the route already names the new page.
export function closePanel(page = false) {
  const view = getRoute().view;
  if (!page && view !== "board" && view !== "run" && view !== "tasks") return;
  const k = getPanel().openKey;
  stopDictation(true);
  termStop();
  gitLeave();
  setPanel({ openKey: null, card: null, runDoc: null, open: false }); // `hit` and `keepNext` stay: a link opened from the Board closes and reopens the panel in its workspace
  if (k) cardEl(k)?.focus({ preventScroll: true });
}
// The close button and the scrim: a phone's run sheet only hides (the card stays), every other panel closes.
export const dismissPanel = () => (getRoute().view === "run" ? setFlip(false) : closePanel());
// Draws the open card's panel again from the reply it has (an action changed the card, a tab was picked).
export const redrawPanel = () => bump("drawAsk");
// Reads the open run again; resolves once the panel has drawn the new reply (or the read failed or the card changed).
export const refetchPanel = () =>
  new Promise<void>((done) => {
    panelWaiters.add(done);
    bump("fetchAsk");
  });
// A tab of the open run: the run workspace shows Preview as a centre tab, not a panel tab.
export function pickPanelTab(k: string) {
  if (getRoute().view === "run" && k === "preview") return void openPreview();
  setPanel({ pn: false, wantTab: k });
  redrawPanel();
}
// The arrow keys: the next or previous tab of the open run.
export function stepPanelTab(by: number) {
  const { ptabs: ks, tab } = getPanel(),
    i = ks.indexOf(tab),
    t = ks[i < 0 ? (by > 0 ? 0 : ks.length - 1) : Math.max(0, Math.min(ks.length - 1, i + by))];
  if (t && t !== tab) {
    setPanel({ wantTab: t });
    redrawPanel();
  }
}
export const openProjectNotes = () => void projectNotes();
