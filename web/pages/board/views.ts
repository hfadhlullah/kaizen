import { isPhone } from "@lib/core";
import { openPhone } from "@lib/phone";
import { getRoute, setRouterHooks, startRouter, type View } from "@lib/router";
import { closePanel, runStop, setPanel } from "@lib/run";
import { getSettings, openSettings, setSettings } from "@lib/settings";
import { openTerms, termsStop } from "@lib/terminal";
import { openHome } from "@lib/home";
import { useShell } from "@lib/shell";
import { showTask } from "@lib/task";

// ---- the engine's side of the router. Which view shows, its address and history, and the page it draws are lib/router's
// (the store, the App and the pages read it); this is what a view change still starts in the docked panel, the run
// workspace, Home and the Terminal page.
let handled: string = "board"; // the view the panel engines last settled on
// The board's own area, not the docked panel.
const AREA = ["board", "terminal", "home", "tasks", "task", "run", "chat", "device", "sources"];

setRouterHooks({
  // Settings opened from the menu starts on a clean search and goes Back to where it came from.
  before: (v) => {
    if (v !== "settings") return;
    setSettings({ startQ: "", startBack: getRoute().view !== "settings" });
  },
  prepare: (v) => {
    setSettings({ pageGen: getSettings().pageGen + 1 });
    if (v === "task") showTask();
  },
  // Leaving a workspace: its panel closes as the board's would; its terminals stay mounted, hidden (run-view-store `kept`).
  leave: (v) => {
    if (handled === "run" && v !== "run") {
      runStop();
      closePanel(true);
    }
  },
  enter: (v: View) => {
    const was = handled;
    handled = v;
    const ph = isPhone() && v === "home";
    if (v === "terminal") openTerms();
    else termsStop();
    if ((v === "home" && !ph) || v === "chat") openHome();
    openPhone(ph ? "home" : v === "device" ? "device" : null);
    // The Terminal page is the board's own area, not the docked panel: the panel closes as on the board.
    if (AREA.includes(v)) {
      if (AREA.includes(was)) {
        if (v !== "board" && (was === "board" || was === "tasks" || was === "sources")) closePanel(true);
        return;
      }
      // Undocked without the slide: it was a page, not a drawer leaving.
      setPanel({ open: false, docked: false, instant: true });
      closePanel(true);
      return;
    }
    setPanel({ docked: true });
    openSettings();
  },
});

export function initViews() {
  startRouter();
  // The menu's theme switch while Settings shows: its Theme row follows.
  useShell.subscribe((s, p) => s.look !== p.look && getRoute().view === "settings" && openSettings());
}
