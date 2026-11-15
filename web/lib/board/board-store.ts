// The Board page's state (Zustand). `snap` is what lib/board/snapshot.ts works out from the server's data and the filters
// below (project, status, search, archive, mode) and the card that is open. Everything else is the page's own: the open
// tab, sort order, pick mode, which children and columns are unfolded, and the form or popup that is open. None of it is
// lost by a redraw, because nothing here is redrawn by hand.
import { create } from "zustand";
import type { Card } from "@lib/core";
import { clearDrafts } from "@lib/shared";

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
  names: Record<string, string>; // view-transition names of the cards that just changed column (they slide there)
};
export type FormMode = "new" | "edit" | "reject" | "delete" | "move" | "run";
export type Popup =
  | { kind: "form"; mode: Exclude<FormMode, "new" | "run">; card: Card }
  | { kind: "run"; card: Card; onStart?: (p: RunPick) => void }
  | { kind: "new"; dir?: string | null; choose: boolean; text?: string }; // text: what the form opens with (Search's New task row)
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
  // What the header and the status strip filter by: a status ("waiting"...), the search box's text, the archive instead
  // of the board, and Workspaces or Runs (kept per browser; the search box's text per tab).
  filter: string | null;
  query: string;
  archive: boolean;
  mode: "ws" | "runs";
  // The cards that just started needing you (each flashes once) and the ones that moved column (each slides there).
  flash: string[];
  names: Record<string, string>;
};
const read = <T>(storage: () => Storage, k: string, fallback: T): T => {
  try {
    return JSON.parse(storage().getItem(k) ?? "null") ?? fallback;
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
  order: read(() => localStorage, "kz-order", {}),
  picking: false,
  picked: [],
  unfolded: [],
  kidsOpen: [],
  // A form that was open when the page reloaded comes back (new, edit and reject; the rest hold nothing typed).
  form: (() => {
    const f = read<[string, string] | null>(() => sessionStorage, "kz-form", null);
    return f ? { mode: f[0] as FormMode, key: f[1] ?? undefined } : null;
  })(),
  popup: null,
  filter: null,
  query: (() => {
    try {
      return sessionStorage.getItem("kz-d:bq") ?? "";
    } catch {
      return "";
    }
  })(),
  archive: false,
  mode: (() => {
    try {
      return localStorage.getItem("kz-board-mode") === "runs" ? "runs" : "ws";
    } catch {
      return "ws";
    }
  })() as "ws" | "runs",
  flash: [],
  names: {},
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
// A click on a status chip filters to that status, or back to all; the archive chip toggles the archive.
export const pickChip = (id: string) =>
  id === "__archive"
    ? setBoard((s) => ({ archive: !s.archive, filter: null }))
    : setBoard((s) => ({ filter: s.filter === id ? null : id }));
export const setQuery = (query: string) => {
  setBoard({ query });
  try {
    sessionStorage.setItem("kz-d:bq", query);
  } catch {}
};
export const setMode = (mode: "ws" | "runs") => {
  setBoard({ mode });
  try {
    localStorage.setItem("kz-board-mode", mode);
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
