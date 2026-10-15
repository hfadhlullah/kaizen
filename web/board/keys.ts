import { store } from "./store.ts";
import { load } from "./api.ts";
import { focusedKey, key, nav, render } from "./cards.ts";
import { $ } from "./dom.ts";
import { iceNav, srcOpen } from "./icebox.ts";
import { close, openRun } from "./panel.ts";
import { keep } from "./projects.ts";
import { go, view } from "./views.ts";

export function initKeys() {
  $("kbd").onclick = () => $("help").classList.add("on");
  $("help").onclick = () => $("help").classList.remove("on");
  document.addEventListener("click", () => {
    if (store.menuKey || store.clearMenu) {
      store.menuKey = null;
      store.clearMenu = false;
      render();
    }
  });
  document.onkeydown = (e) => {
    // The icebox reads its own keys first; a checkbox there keeps them, for x then j.
    if (
      view === "sources" &&
      iceNav &&
      srcOpen() &&
      !$("help").classList.contains("on") &&
      !e.target.matches("input:not([type=checkbox]),select,textarea,[contenteditable]") &&
      !e.target.closest("#src-sec") &&
      iceNav(e)
    )
      return;
    if (e.target.matches("input,select,textarea,[contenteditable]")) return;
    if (e.key === "?") {
      $("help").classList.toggle("on");
      return;
    }
    if (e.key === "/" && $("sq") && $("panel").classList.contains("open")) {
      e.preventDefault();
      $("sq").focus();
      return;
    }
    if (e.key === "Escape") {
      $("help").classList.remove("on");
      if (store.mode) {
        store.mode = null;
        render();
      } else close();
      return;
    }
    if (e.key === "n") {
      if (view !== "board") go("board", true);
      store.mode = "new";
      render();
    }
    if (e.key === "a") {
      store.all = !store.all;
      keep(store.all ? null : store.S.dir);
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
      store.openKey &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      store.S.cards.find((c) => key(c) === store.openKey && c.kind === "run");
    if (rc && $("ptabs").children.length) {
      e.preventDefault();
      if (mv[0]) {
        const ks = [...$("ptabs").children].map((b) => b.dataset.k).concat($("pterm").hidden ? [] : ["term"]),
          i = ks.indexOf(store.tab),
          t = ks[i < 0 ? (mv[0] > 0 ? 0 : ks.length - 1) : Math.max(0, Math.min(ks.length - 1, i + mv[0]))];
        if (t !== store.tab) {
          store.tab = t;
          openRun(rc, true);
        }
      } else $("pbody").scrollBy({ top: mv[1] * 40 });
      return;
    }
    if (
      mv &&
      !$("panel").classList.contains("open") &&
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
    const ok = store.openKey || focusedKey(),
      oc = ok && store.S.cards.find((c) => key(c) === ok);
    if (!oc) return;
    if (e.key === "e" && oc.kind === "idea") {
      close();
      store.mode = "edit";
      store.modeKey = key(oc);
      render();
    }
    if (e.key === "x" && !["done", "abandoned", "starting"].includes(oc.status)) {
      close();
      store.mode = "reject";
      store.modeKey = key(oc);
      render();
    }
    if (e.key === "r" && oc.kind === "idea") {
      close();
      store.mode = "run";
      store.modeKey = key(oc);
      render();
    }
  };
}
