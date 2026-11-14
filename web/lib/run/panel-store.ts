// The run panel's React parts (Zustand): what the body, the footer and the header draw, and the Fix findings form that sits
// in the review tab. The old panel code (web/board/panel.ts openRun()) publishes them on every redraw. The ticks of the fix form live
// here and not in the form, so a redraw of the panel's body (which replaces the element the form stands in) loses nothing.
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
  term: { key: string; onEnd: () => void } | null;
  head: Head | null;
  tabs: { k: string; label: string }[]; // the run's tabs that have something in them
  tab: string; // the one open
  pickTab: (k: string) => void;
  footer: { card: Card; plan: string; sourceControl: boolean } | null;
  doc: PanelDoc | null; // the document tab open, null while another kind of tab shows
  fix: { card: Card; findings: Finding[] } | null; // the Fix findings form, in the review tab under its document
  off: string[]; // findings unticked, "run:number"
  sent: string[]; // findings already sent to an agent, "run:number" (kept over a reload of this tab)
};
const SK = "kz-sent";
export const usePanel = create<Panel>()(() => ({
  body: "",
  term: null,
  head: null,
  tabs: [],
  tab: "",
  pickTab: () => {},
  footer: null,
  doc: null,
  fix: null,
  off: [],
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
