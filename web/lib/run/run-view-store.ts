// The run workspace as React state (Zustand): the tab bar, the + and split menus, the panes (terminals, Browser, notes,
// History, "running in another terminal"), the key hint and the project notes list. The workspace engine
// (lib/run/workspace.ts) knows which items the workspace has (from the board's cards and /shells); it publishes this
// snapshot on every draw and answers the callbacks below. The layout (which item is in which pane, and how big) is the
// layout store's; a pane is a component keyed by its item, so a redraw never moves a live terminal.
import { create } from "zustand";
import { isPhone } from "@lib/core";
import type { Kept } from "./kept.ts";
import type { PreviewTarget } from "./preview.ts";

export type RvItem = { id: string; kind: string; title: string; agent?: string };
// One open item of the workspace: a terminal (agent, shell), the Browser (local), the Preview, a note, History, or the
// tab that says a run's agent is open elsewhere (wait). `key` is a terminal's session key, `note` a note's name.
export type RvPane = { id: string; kind: string; title: string; key?: string; note?: string; agent?: string };
export type RvScreen = { id: string; title: string; first: RvItem; ids: string[]; focus: string };
export type RvAgent = { name: string; cmd: string; yolo?: boolean; bypassDefault?: boolean };
export type RvHistory = { k: string; title: string; state: string; line: string };
// One row of the run picker at the top of the panel: a run, its state dot and what it waits on.
export type RvRun = { k: string; title: string; state: string; line: string };
export type RvPicker = { cur: RvRun; live: RvRun[]; hist: RvRun[]; other: boolean };
export type RvMenu = "tab" | "cols" | "rows";
export type RvNotes = { names?: string[]; loading?: boolean; failed?: boolean } | null;
export type RunView = {
  message: string | null; // "That run was not found.": replaces the tab strip
  screens: RvScreen[];
  on: string | null;
  split: boolean; // a screen is shown, so it can be split
  agents: RvAgent[];
  defAgent: string;
  pty: boolean; // the server can start terminals
  titles: Record<string, string>; // pane id -> its title
  items: RvPane[]; // every item the workspace has open
  wsk: string | null; // the workspace shown (its layout's key); null: none shown (the terminals of workspaces visited stay mounted in `kept`)
  ws: { dir: string; ws: string } | null;
  history: RvHistory[];
  empty: boolean;
  menu: RvMenu | null; // which add menu is open
  hint: boolean; // the Ctrl+Space key hint
  notes: RvNotes;
  picker: RvPicker | null; // the panel's run picker (null: no run to show)
  // The panes of every workspace visited, by workspace key (terminals, the Browser frame, notes iframes, History, Preview):
  // mounted once and kept, hidden while that workspace is not shown, so leaving a workspace or the run view keeps a frame's
  // page, scroll and typed text and never reconnects a terminal. Capped (lib/run/kept.ts): the shown workspace and the most
  // recently visited ones; an evicted one is made again on return.
  kept: Kept;
  recent: string[]; // the workspaces shown, least recently first
  flip: boolean; // the run panel is folded away (a phone's sheet is down); the <body> carries `rflip` while this is set
  awaiting: boolean; // a run of this workspace waits on you: the panel button shows a dot while the panel is folded
  focus: { id: string | null; n: number }; // a pane the keyboard asked to focus (n changes with every ask)
};
export type RunActions = {
  select(sid: string): void;
  close(sid: string): void; // a tab's ×: everything in it closes
  closeItem(id: string): void; // a pane's ×
  openNew(n: string, mode: RvMenu, yolo?: boolean): void;
  runApp(): void;
  move(id: string, to: string | null): void;
  drag(id: string | null): void; // a header or tab is being dragged (null: ended)
  dragging(): string | null;
  drop(to: string | null): void; // dropped on a tab, or on + (null: a tab of its own)
  openHere(runKey: string): void;
  pick(runKey: string): void;
  openNote(name: string): void;
  termEnded(): void; // a terminal's session ended: the board reads /state again
  currentRun(): { dir: string; id: string } | null; // the run the panel shows (the annotator sends notes to it)
  previewTarget(): PreviewTarget | null; // what the Preview tab reads: the workspace, its newest run and that run's 03-impl.md
};
// Whether the run panel is folded away is kept per browser (a computer's choice; a phone's sheet always starts down), so a
// reload shows it the way it was left.
const FLIP = "kz-rflip";
function storedFlip() {
  try {
    return !isPhone() && localStorage.getItem(FLIP) === "1";
  } catch {
    return false;
  }
}
function keepFlip(flip: boolean) {
  if (isPhone()) return;
  try {
    flip ? localStorage.setItem(FLIP, "1") : localStorage.removeItem(FLIP);
  } catch {}
}
export const useRunView = create<RunView>()(() => ({
  message: null,
  screens: [],
  on: null,
  split: false,
  agents: [],
  defAgent: "",
  pty: true,
  titles: {},
  items: [],
  wsk: null,
  ws: null,
  history: [],
  empty: false,
  menu: null,
  hint: false,
  notes: null,
  picker: null,
  kept: {},
  recent: [],
  flip: storedFlip(),
  awaiting: false,
  focus: { id: null, n: 0 },
}));
export const setFlip = (flip: boolean) => {
  useRunView.setState({ flip });
  keepFlip(flip);
};
export const focusPane = (id?: string) => useRunView.setState((s) => ({ focus: { id: id ?? null, n: s.focus.n + 1 } }));
export const setRunView = useRunView.setState;
const noop = () => {};
export const run: { act: RunActions } = {
  act: {
    select: noop,
    close: noop,
    closeItem: noop,
    openNew: noop,
    runApp: noop,
    move: noop,
    drag: noop,
    dragging: () => null,
    drop: noop,
    openHere: noop,
    pick: noop,
    openNote: noop,
    termEnded: noop,
    currentRun: () => null,
    previewTarget: () => null,
  },
};
export const setRunActions = (a: RunActions) => (run.act = a);
