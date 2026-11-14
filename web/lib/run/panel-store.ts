// The run panel's state (Zustand): which card is up, what it asked for (the tab, a link's item, a read), and what the body,
// the footer and the header draw, with the Fix findings form that sits in the review tab. The actions that ask (open, close, a
// tab, a refresh) are panel-actions.ts; usePanelRun (use-panel-run.ts, mounted by the panel) reads the card and its /run reply
// and publishes what is drawn. The ticks of the fix form live here and not in the form, so a redraw of the panel's body loses nothing.
import { create } from "zustand";
import type { Card } from "@lib/core";

export type Finding = { n: number; text: string; done?: boolean };
// What the panel's header shows under the title: the Plan > Build > Review > Done strip, a task's chips, a finished
// run's chips, or the run workspace's project name with the stage word and progress bar.
export type Phases = { names: string[]; at: number; status: string; tip: string };
export type Head =
  | { kind: "steps"; phases: Phases }
  | { kind: "task"; where: string }
  | { kind: "chips"; mark: string; label: string; awaiting?: string; parent?: string }
  | { kind: "meta"; id: string; proj: string; runner: string; word: string; w: number; status: string; tip: string };
// One document tab of the panel (Request, Explore, Plan, Backlog, Work, Review, Preview): its text, a building run's
// progress.md above the backlog, and the line a link asked to mark (`mark` changes with each request, so each marks once).
export type PanelDoc = {
  k: string;
  id: string;
  text: string | null;
  progress: string | null;
  needle: string | null;
  mark: number;
};
// What fills the panel's body (one at a time, drawn by pages/board/panel.tsx), and the in-card agent terminal's session.
export type PanelBody = "" | "doc" | "settings" | "notes" | "term" | "git";
export type Panel = {
  body: PanelBody;
  term: { key: string; onEnd: () => void } | null; // the in-card terminal on show
  terms: { key: string; onEnd: () => void }[]; // every one opened this visit: mounted once, hidden while another body shows
  head: Head | null;
  tabs: { k: string; label: string }[]; // the run's tabs that have something in them
  tab: string; // the one open
  wantTab: string; // the tab the next draw opens on (a link, a key or a pick asked for it; `tab` is what is drawn)
  ptabs: string[]; // the keys of the tabs the run has (the arrow keys walk them)
  runDoc: any; // the /run reply for the card whose panel is up
  footer: { card: Card; plan: string; sourceControl: boolean } | null;
  doc: PanelDoc | null; // the document tab open, null while another kind of tab shows
  fix: { card: Card; findings: Finding[] } | null; // the Fix findings form, in the review tab under its document
  off: string[]; // findings unticked, "run:number"
  sent: string[]; // findings already sent to an agent, "run:number" (kept over a reload of this tab)
  // The panel's own frame (pages/board/panel.tsx draws these as the classes the stylesheet keys on): shown, docked beside
  // the run workspace, wide (the in-card terminal), parked (no run to show), the project notes list over the body (pn),
  // read-only (ro, a run from History), and `instant`: one frame without the slide, for a panel that left as a page.
  open: boolean;
  docked: boolean;
  wide: boolean;
  parked: boolean;
  pn: boolean;
  ro: boolean;
  instant: boolean;
  title: string; // the header's text, and its tooltip (a run's id)
  titleTip: string;
  top: number; // the body scrolls back to its top whenever this changes
  openKey: string | null; // the card whose panel is up (the board marks it)
  card: Card | null; // that card as it was opened; the live one is in the server's cards (it can be gone from them)
  // Asks the panel's hook answers: a new open (reads the run again and draws it fresh), a read again, a redraw of what it has.
  openN: number;
  fetchAsk: number;
  drawAsk: number;
  keepNext: boolean; // a card waits for its workspace to mount this panel: the tab it asked for survives
  hit: { type: string; n: number; k: string } | null; // a link's finding or backlog item, to scroll to and mark once
  // The agent terminal a card or the sidebar asked for, selected once its tab exists; and the one a launch just opened.
  wantTerm: string | null;
  wantPty: { key: string; at: number } | null;
};
// Callers waiting for the panel to show a read they asked for (`refetchPanel`): the hook settles them after it draws.
export const panelWaiters = new Set<() => void>();
// The panel's body element, for what only an element can say: scrolling it, and whether a note is being typed in.
export const panelBody: { el: HTMLElement | null } = { el: null };
export const scrollPanel = (dy: number) => panelBody.el?.scrollBy({ top: dy });
export const editingNotes = () => !!panelBody.el?.querySelector(".notes")?.contains(document.activeElement);
const SK = "kz-sent";
export const usePanel = create<Panel>()(() => ({
  body: "",
  term: null,
  terms: [],
  head: null,
  tabs: [],
  tab: "",
  wantTab: "request",
  ptabs: [],
  runDoc: null,
  footer: null,
  doc: null,
  fix: null,
  off: [],
  open: false,
  docked: false,
  wide: false,
  parked: false,
  pn: false,
  ro: false,
  instant: false,
  title: "",
  titleTip: "",
  top: 0,
  openKey: null,
  card: null,
  openN: 0,
  fetchAsk: 0,
  drawAsk: 0,
  keepNext: false,
  hit: null,
  wantTerm: null,
  wantPty: null,
  sent: (() => {
    try {
      return JSON.parse(sessionStorage.getItem(SK) ?? "[]") || [];
    } catch {
      return [];
    }
  })(),
}));
export const getPanel = usePanel.getState;
export const setPanel = usePanel.setState;
export const markSent = (keys: string[]) => {
  const sent = [...new Set([...getPanel().sent, ...keys])];
  setPanel({ sent });
  try {
    sessionStorage.setItem(SK, JSON.stringify(sent));
  } catch {}
};
