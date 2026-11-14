import { useEffect } from "react";
import { cardKey as key, getServer, load, setServer } from "@lib/server";
import { closeForm, focusFilter, focusedKey, formPopup, getBoard, nav, newTask, runPopup } from "@lib/board";
import { iceKeys } from "@lib/icebox";
import { keep } from "@lib/project";
import { getRoute } from "@lib/router";
import { close, getPanel, openRun, scrollPanel, work } from "@lib/run";
import { searchBox } from "@lib/settings";
import { setHelp, useHelp } from "@lib/shell";

// Radix closes a menu or dialog on Escape before this handler runs, so whether one was open is read when the key arrives
// (capture), not after: that Escape closes the layer, not the panel behind it.
let layerUp = false;
function onKey(e: any) {
  {
    // The icebox reads its own keys first; a checkbox there keeps them, for x then j.
    if (getRoute().view === "sources" && !useHelp.getState().on && iceKeys(e)) return;
    // A dialog or an open menu (they render into #kz-portal) handles its own keys; Escape there must not also close the panel.
    if (e.target.matches("input,select,textarea,[contenteditable]") || e.target.closest("dialog,#kz-portal") || layerUp) return;
    // The shortcuts overlay (?) is off for now, with its menu button; keys still work.
    if (e.key === "/" && searchBox.el && getPanel().open) {
      e.preventDefault();
      searchBox.el.focus();
      return;
    }
    if (e.key === "/" && (getRoute().view === "board" || getRoute().view === "tasks")) {
      e.preventDefault();
      focusFilter();
      return;
    }
    if (e.key === "Escape") {
      setHelp(false);
      // An inline form closes first (its own Escape handles a press inside it); a menu closes itself.
      if (getBoard().form) closeForm();
      else close();
      return;
    }
    // The Terminal page has no cards to move between; its keys are the terminals'.
    if (getRoute().view === "terminal" || getRoute().view === "task") return;
    if (e.key === "n" && !document.querySelector("dialog[open]")) {
      newTask();
    }
    if (e.key === "a") {
      setServer({ all: !getServer().all });
      keep(getServer().all ? null : getServer().state.dir);
      load();
    }
    const mv = {
      ArrowUp: [0, -1],
      k: [0, -1],
      ArrowDown: [0, 1],
      j: [0, 1],
      ArrowLeft: [-1, 0],
      h: [-1, 0],
      ArrowRight: [1, 0],
      l: [1, 0],
    }[e.key];
    // In a run's panel: left/right between its tabs, up/down scroll it. Other panels keep the browser's arrows.
    const rc =
      mv &&
      getPanel().openKey &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      getServer().state.cards.find((c) => key(c) === getPanel().openKey && c.kind === "run");
    if (rc && work.ptabs?.length) {
      e.preventDefault();
      if (mv[0]) {
        const ks: string[] = work.ptabs,
          i = ks.indexOf(work.tab),
          t = ks[i < 0 ? (mv[0] > 0 ? 0 : ks.length - 1) : Math.max(0, Math.min(ks.length - 1, i + mv[0]))];
        if (t !== work.tab) {
          work.tab = t;
          openRun(rc, true);
        }
      } else scrollPanel(mv[1] * 40);
      return;
    }
    if (
      mv &&
      !getPanel().open &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      (e.target === document.body || e.target.matches("#board .card"))
    ) {
      e.preventDefault();
      nav(...mv);
      return;
    }
    // The open card, else the focused one.
    const ok = getPanel().openKey || focusedKey(),
      oc = ok && getServer().state.cards.find((c) => key(c) === ok);
    if (!oc) return;
    if (e.key === "e" && oc.kind === "idea") {
      formPopup(oc, "edit");
    }
    if (e.key === "x" && !["done", "abandoned", "starting"].includes(oc.status)) {
      formPopup(oc, "reject");
    }
    if (e.key === "r" && oc.kind === "idea") {
      runPopup(oc);
    }
  }
}
// The keyboard on the board: the shortcuts the list (pages/board/help.tsx) names. Radix closes a menu or dialog on Escape
// before this handler runs, so whether one was open is read when the key arrives (capture), not after.
export function useKeys() {
  useEffect(() => {
    const layer = () => (layerUp = !!document.querySelector("#kz-portal [data-state=open]"));
    addEventListener("keydown", layer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", layer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
}
