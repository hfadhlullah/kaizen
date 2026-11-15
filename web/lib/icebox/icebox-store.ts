// The Icebox page's state (Zustand). What outlives leaving the page (filters, the view, what is half typed in the
// capture box, the checked items, the open item) lives here, as it did in module variables before; what only one
// component cares about (an open menu, a hover) stays in that component.
import { create } from "zustand";
import type { IceData, IceItem } from "./icebox.ts";

export type Swipe = {
  n: number;
  pro: number;
  dis: number;
  t0: number;
  last: IceItem | null;
  skip: Map<string, number>;
  busy: boolean;
  pop: boolean;
  days?: number;
};
export type Capture = {
  text: string;
  files: File[];
  board: string;
  boardDir: string | null;
  dir: string | null;
  busy: boolean;
};
// The reply being written to a gathered post (its item key, the text, whether it is still coming or going), and the
// task ChatGPT drafted for the open promote form. The person's own typing always wins.
export type Reply = { k: string; text: string; wait?: boolean; note?: string; busy?: boolean; again?: boolean };
export type TaskDraft = { k: string; wait: boolean; title: string; details: string; note?: string; kept?: boolean };
export type Form = { k: string; title: string; details: string };
export type Ask =
  | { kind: "collection"; where: string; done: (a: { name: string; client: boolean } | null) => void }
  | {
      kind: "confirm";
      title: string;
      description: string;
      label: string;
      danger: boolean;
      done: (ok: boolean) => void;
    };

export type SourceDraft = { url: string; q: string; plat: string; label: string; cat: string; to: string };
export type IceState = {
  data: IceData | null;
  loaded: boolean;
  view: "cards" | "sort";
  board: string;
  kinds: string[];
  cat: string;
  src: string;
  sel: string[]; // checked items, "<dir> <id>"
  cur: string | null; // the item the cursor is on
  open: string | null; // the item whose row is open
  armed: string | null; // the item whose promote form is showing
  form: Form | null;
  task: TaskDraft | null;
  reply: Reply | null;
  styles: Record<string, string>; // reply style by project
  cap: Capture;
  srcShow: boolean; // the sources drawer
  srcAdd: boolean; // its add form
  srcKind: "link" | "social";
  draft: SourceDraft; // the add-source form, kept while the drawer is shut
  swipe: Swipe | null;
  busy: boolean; // a bulk action is posting
  order: IceItem[]; // what the page shows now, in order: what j and k walk and bulk actions act on
  deck: IceItem[]; // the swipe stack
  ask: Ask | null; // the dialog being asked
  tick: number; // bumped when the board's project filter changes
};
const saved = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
export const useIce = create<IceState>()(() => ({
  data: null,
  loaded: false,
  view: saved("kz-ice-view") === "sort" ? "sort" : "cards",
  board: "",
  kinds: [],
  cat: "",
  src: "",
  sel: [],
  cur: null,
  open: null,
  armed: null,
  form: null,
  task: null,
  reply: null,
  styles: {},
  cap: { text: "", files: [], board: "", boardDir: null, dir: null, busy: false },
  srcShow: false,
  srcAdd: false,
  srcKind: "link",
  draft: { url: "", q: "", plat: "x", label: "", cat: "", to: "" },
  swipe: null,
  busy: false,
  order: [],
  deck: [],
  ask: null,
  tick: 0,
}));
export const getIce = useIce.getState;
// Two elements the page reaches from outside their component, set as refs by the component that draws them: the swipe card the
// arrows and buttons fly away, and the Sources button the drawer gives focus back to.
export const iceEls: { swCard: HTMLElement | null; srcTog: HTMLElement | null } = { swCard: null, srcTog: null };
export const setIce = useIce.setState;
export const patchCap = (p: Partial<Capture>) => setIce((s) => ({ cap: { ...s.cap, ...p } }));
export const patchDraft = (p: Partial<SourceDraft>) => setIce((s) => ({ draft: { ...s.draft, ...p } }));
