// The run workspace's chrome as React state (Zustand): the tab bar, the + and split menus, pane headers, the empty,
// History and "running in another terminal" bodies, the key hint and the project notes list. The old code
// (web/board/run-view.ts) owns the terminals, frames and layout tree; it publishes this snapshot on every draw and
// answers the callbacks below. Nothing here touches a pane element, so a redraw never moves a live terminal.
import { create } from "zustand";

export type RvItem = { id: string; kind: string; title: string; agent?: string };
export type RvScreen = { id: string; title: string; first: RvItem; ids: string[]; focus: string };
export type RvAgent = { name: string; cmd: string; yolo?: boolean; bypassDefault?: boolean };
export type RvHistory = { k: string; title: string; state: string; line: string };
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
  history: RvHistory[];
  empty: boolean;
  menu: RvMenu | null; // which add menu is open
  hint: boolean; // the Ctrl+Space key hint
  notes: RvNotes;
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
};
export const useRunView = create<RunView>()(() => ({
  message: null,
  screens: [],
  on: null,
  split: false,
  agents: [],
  defAgent: "",
  pty: true,
  titles: {},
  history: [],
  empty: false,
  menu: null,
  hint: false,
  notes: null,
}));
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
  },
};
export const setRunActions = (a: RunActions) => (run.act = a);
