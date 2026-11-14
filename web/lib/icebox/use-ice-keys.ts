// The Icebox's keys, read by the board's key handler (pages/board/keys.ts) while the Icebox shows. True when the key was
// used. j and k walk the cursor, o opens, x checks, p promotes, d dismisses, h snoozes a week (the checked ones when
// any are), Escape steps back one thing; in swipe mode the arrows decide and z undoes. A text field, a menu or a
// dialog keeps its own keys.
import { iceKey, isLive, type IceItem } from "./icebox.ts";
import { armPromote, bulkDo, exitSwipe, iceAct, snoozeAll, swGo, swUndo } from "./icebox-actions.ts";
import { getIce, iceEls, setIce } from "./icebox-store.ts";
import { toggleOpen, toggleSel } from "./icebox-view.ts";
import { getRoute } from "@lib/router";
import { flyCard } from "./use-card-drag.ts";

// An open popup (menu, popover, picker, select, dialog, the drawer) keeps its own keys; Radix marks them data-state=open.
const OVERLAY =
  "[role=dialog][data-state=open],[role=alertdialog][data-state=open],[role=menu][data-state=open],[role=listbox][data-state=open]";
export function iceKeys(e: KeyboardEvent): boolean {
  if (getRoute().page !== "icebox" || e.altKey || e.ctrlKey || e.metaKey) return false;
  const t = e.target as Element | null,
    k = e.key;
  // A checkbox keeps the keys, for x then j.
  if (t?.matches?.("input:not([type=checkbox]),select,textarea,[contenteditable]") || document.querySelector(OVERLAY))
    return false;
  const s = getIce();
  if (s.swipe) {
    const f = {
      ArrowLeft: () => swGo("dismiss", (d) => flyCard(iceEls.swCard, d)),
      ArrowRight: () => swGo("promote", (d) => flyCard(iceEls.swCard, d)),
      ArrowDown: () => swGo("skip"),
      z: swUndo,
      Escape: exitSwipe,
    }[k as "z"];
    if (!f) return false;
    e.preventDefault();
    void f();
    return true;
  }
  if (k === "Escape") {
    if (s.open) setIce(s.armed ? { armed: null } : { open: null });
    else if (s.sel.length) setIce({ sel: [] });
    else return false;
    return true;
  }
  const at = s.order.findIndex((it) => iceKey(it) === s.cur),
    it: IceItem | undefined = s.order[at];
  if (!it) return false;
  if (k === "j" || k === "k") {
    e.preventDefault();
    const n = s.order[Math.max(0, Math.min(s.order.length - 1, at + (k === "j" ? 1 : -1)))]!;
    setIce({ cur: iceKey(n) });
    document.querySelector(`[data-key="${CSS.escape(iceKey(n))}"]`)?.scrollIntoView({ block: "nearest" });
    return true;
  }
  const keys = new Set(s.sel);
  if (k === "h") {
    const its = keys.size ? s.order.filter((x) => keys.has(iceKey(x)) && isLive(x)) : isLive(it) ? [it] : [];
    if (!its.length) return false;
    e.preventDefault();
    void snoozeAll(its, "1w");
    return true;
  }
  const closed = it.status === "promoted" || it.status === "done";
  const run =
    k === "o"
      ? () => toggleOpen(it)
      : k === "x"
        ? () => toggleSel(iceKey(it))
        : k === "p" && !s.busy && (keys.size || !closed)
          ? () => (keys.size ? void bulkDo("promote") : armPromote(it))
          : k === "d" && !s.busy && (keys.size || (!closed && it.status !== "dismissed"))
            ? () => (keys.size ? void bulkDo("dismiss") : void iceAct("dismiss", it, "Dismissed"))
            : null;
  if (!run) return false;
  e.preventDefault();
  run();
  return true;
}
