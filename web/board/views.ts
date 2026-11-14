import { store } from "./store.ts";
import { $ } from "./dom.ts";
import { close } from "./panel.ts";
import { openSettings } from "./settings.ts";
import { openTerms, termsStop } from "./terms.ts";
import { openHome } from "./home.ts";
import { initRunView, runStop, showRunView } from "./run-view.ts";
import { isPhone } from "@lib/core";
import { openPhone } from "@lib/phone";
import { getRoute, setRouterHooks, startRouter, type View } from "@lib/router";
import { navigateTask, showTask } from "@lib/task";

// ---- the engine's side of the router. Which view shows, its address and history, and the page it draws are lib/router's
// (the store, the App and the pages read it); this is what a view change still starts in the docked panel, the run
// workspace, Home and the Terminal page.
let handled: string = "board"; // the view the panel engines last settled on
let shadow: string | null = null;
// The view the panel engine believes it is on: the route's, except while a page change closes the board's own panel.
export const curView = (): string => shadow ?? getRoute().view;
const asBoard = (fn: () => void) => {
  shadow = "board";
  try {
    fn();
  } finally {
    shadow = null;
  }
};
// The board's own area, not the docked panel.
const AREA = ["board", "terminal", "home", "tasks", "task", "run", "chat", "device", "sources"];

setRouterHooks({
  // Settings opened from the menu starts on a clean search and goes Back to where it came from.
  before: (v) => {
    if (v !== "settings") return;
    store.setQ = "";
    store.setBack = curView() !== "settings";
  },
  prepare: (v) => {
    store.pageGen++;
    if (v === "task") showTask();
  },
  // Leaving a workspace: its panel closes as the board's would, its terminals unmount.
  leave: (v) => {
    if (handled === "run" && v !== "run") {
      runStop();
      asBoard(close);
    }
  },
  enter: (v: View) => {
    const was = handled;
    handled = v;
    const ph = isPhone() && v === "home";
    const p = $("panel");
    if (v === "terminal") openTerms();
    else termsStop();
    if ((v === "home" && !ph) || v === "chat") openHome();
    openPhone(ph ? "home" : v === "device" ? "device" : null);
    // After the panel handling below, which closes the board's panel on the way in.
    if (v === "run") queueMicrotask(() => void showRunView(true));
    // The Terminal page is the board's own area, not the docked panel: the panel closes as on the board.
    if (AREA.includes(v)) {
      if (AREA.includes(was)) {
        if (v !== "board" && (was === "board" || was === "tasks" || was === "sources")) asBoard(close);
        return;
      }
      // Undocked without the slide: it was a page, not a drawer leaving.
      p.style.transition = "none";
      p.classList.remove("open", "docked");
      p.offsetWidth;
      p.style.transition = "";
      asBoard(close);
      return;
    }
    p.classList.add("docked");
    openSettings();
  },
});

export function initViews() {
  initRunView();
  startRouter();
  addEventListener("kz-open-task", ((e: CustomEvent) => {
    e.preventDefault();
    navigateTask(e.detail);
  }) as EventListener);
  // The menu's theme switch while Settings shows: its Theme row follows.
  addEventListener("kz-theme", () => {
    if (curView() === "settings") openSettings();
  });
}
