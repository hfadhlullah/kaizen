// How the Icebox page moves around: what a click on a row, a card, a chip or a bulk bar changes in the page's own
// state (open item, cursor, checked items, filters). No requests are made here (those are icebox-actions.ts).
import { host } from "../core/index.ts";
import { iceKey, sameName, type Board, type IceItem } from "./icebox.ts";
import { patchCap, setIce } from "./icebox-store.ts";

const focusTitle = (k: string) =>
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`[data-key="${CSS.escape(k)}"] [data-title]`)?.focus(),
  );
export const setView = (view: "cards" | "sort") => {
  setIce({ view });
  try {
    localStorage.setItem("kz-ice-view", view);
  } catch {}
};
export const toggleSel = (k: string) =>
  setIce((s) => ({ sel: s.sel.includes(k) ? s.sel.filter((x) => x !== k) : [...s.sel, k] }));
export const selectPage = (order: IceItem[], all: boolean) =>
  setIce((s) => {
    const keys = order.map(iceKey);
    return { sel: all ? [...new Set([...s.sel, ...keys])] : s.sel.filter((k) => !keys.includes(k)) };
  });
// A row opens on its title or anywhere not a control; open shows what was gathered and the promote form.
export function toggleOpen(it: IceItem) {
  const k = iceKey(it);
  setIce((s) => ({ cur: k, open: s.open === k ? null : k, armed: null, view: "sort" }));
  focusTitle(k);
}
// A card opens in the Sort list (for this visit; the saved view stays), where notes, reply and promote are.
export function openCard(it: IceItem) {
  const k = iceKey(it);
  setIce({ cur: k, open: k, armed: null, view: "sort" });
  focusTitle(k);
}
// A board chip filters, and the capture box follows it: its board and, in All projects, that board's project.
export function pickBoard(name: string, boards: Board[], single: boolean) {
  setIce({ board: name });
  const b = name && boards.find((x) => sameName(x.name, name));
  if (b) patchCap({ board: b.name, boardDir: b.dir, ...(single ? {} : { dir: b.dir }) });
}
export const toggleKind = (kind: string) =>
  setIce((s) => ({ kinds: s.kinds.includes(kind) ? s.kinds.filter((k) => k !== kind) : [...s.kinds, kind] }));
// "Clear filters": category, source, collection, kinds, and the board's "Showing" picker in All projects.
export function clearFilters(single: boolean) {
  setIce({ cat: "", src: "", board: "", kinds: [] });
  if (!single) host.clearShown();
}
