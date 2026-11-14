// The Board page's state (Zustand). `snap` is what the old board code (web/board/cards.ts render()) knows and hands
// over on every redraw: the cards and the filters its status strip and header set. Everything else is the page's
// own: the open tab, sort order, pick mode, which children and columns are unfolded, and the form or popup that is
// open. None of it is lost by a redraw, because nothing here is redrawn by hand.
import { create } from "zustand";
import type { Card } from "./board.ts";
import { clearDrafts } from "./hooks/use-draft.ts";

export type WsCard = {
  dir: string;
  path: string;
  href: string;
  state: string; // the status dot: idle, wait, run, review ...
  label: string;
  main: boolean;
  project: string;
  line: string;
};
export type BoardSnap = {
  cards: Card[]; // the cards of the board shown (archived or not, project filter applied)
  allCards: Card[];
  backlogItems: any[]; // open backlog lines of finished runs (the Tasks column's Backlog tab)
  only: string[] | null; // the project dirs ticked in All projects' Showing filter, when any
  now: number;
  all: boolean; // All projects
  projects: { dir: string; label: string }[];
  archive: boolean;
  filter: string | null;
  query: string;
  mode: "ws" | "runs";
  ws: WsCard[][];
  wsNames: string[];
  colNames: string[];
  openKey: string | null;
  flash: string[];
  answered: string[]; // runs already answered from this page
  phone: boolean;
};
export type FormMode = "new" | "edit" | "reject" | "delete" | "move" | "run";
export type Popup =
  | { kind: "form"; mode: Exclude<FormMode, "new" | "run">; card: Card }
  | { kind: "run"; card: Card; onStart?: (p: RunPick) => void }
  | { kind: "new"; dir?: string | null; choose: boolean };
export type RunPick = { kind: string; agent?: string; account?: string; yolo: boolean; explore?: boolean };
export type Board = {
  snap: BoardSnap | null;
  tab: "ideas" | "backlog";
  sev: string | null;
  order: Record<string, string>;
  picking: boolean;
  picked: string[];
  unfolded: number[];
  kidsOpen: string[];
  form: { mode: FormMode; key?: string } | null;
  popup: Popup | null;
  // The header's Workspaces | Runs switch (ws-board-ui.ts publishes it; null on pages that are not the Board).
  modeSwitch: { mode: "ws" | "runs"; set: (m: "ws" | "runs") => void } | null;
};
const read = <T>(storage: Storage, k: string, fallback: T): T => {
  try {
    return JSON.parse(storage.getItem(k) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
};
export const useBoard = create<Board>()(() => ({
  snap: null,
  tab: (() => {
    try {
      return localStorage.getItem("kz-ideas-tab") === "backlog" ? "backlog" : "ideas";
    } catch {
      return "ideas";
    }
  })() as "ideas" | "backlog",
  sev: null,
  order: read(localStorage, "kz-order", {}),
  picking: false,
  picked: [],
  unfolded: [],
  kidsOpen: [],
  // A form that was open when the page reloaded comes back (new, edit and reject; the rest hold nothing typed).
  form: (() => {
    const f = read<[string, string] | null>(sessionStorage, "kz-form", null);
    return f ? { mode: f[0] as FormMode, key: f[1] ?? undefined } : null;
  })(),
  popup: null,
  modeSwitch: null,
}));
export const getBoard = useBoard.getState;
export const setBoard = useBoard.setState;
export const openForm = (f: Board["form"]) => {
  setBoard({ form: f });
  try {
    sessionStorage.setItem(
      "kz-form",
      JSON.stringify(f && ["new", "edit", "reject"].includes(f.mode) ? [f.mode, f.key ?? null] : null),
    );
  } catch {}
};
export const closeForm = () => (openForm(null), clearDrafts("f:"));
// New task from another page closes only the inline new-task form and keeps its draft, which the dialog picks up (an
// edit form and its draft stay too).
export const closeNewForm = () => getBoard().form?.mode === "new" && openForm(null);
export const closePopup = () => (setBoard({ popup: null }), clearDrafts("f:"));
export const setTab = (tab: Board["tab"]) => {
  setBoard({ tab });
  try {
    localStorage.setItem("kz-ideas-tab", tab);
  } catch {}
};
export const flipOrder = (ci: number) => {
  const order = { ...getBoard().order, [ci]: getBoard().order[ci] === "old" ? "new" : "old" };
  setBoard({ order });
  try {
    localStorage.setItem("kz-order", JSON.stringify(order));
  } catch {}
};
