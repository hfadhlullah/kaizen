import { store } from "./store.ts";
import { termStop } from "./agent-term.ts";
import { stopDictation } from "./dictation.ts";
import { $ } from "./dom.ts";
import { react, view } from "./views.ts";

// Ctrl+F searches settings, as in Orca. Only while the page shows: elsewhere it stays the browser's.
addEventListener("keydown", (e) => {
  if (view !== "settings" || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return;
  e.preventDefault();
  $("sq")?.focus();
});
// Settings fills the docked panel; the page itself is React (web/pages/settings-page.tsx), fed by lib/settings/settings-store.ts.
// Here is only what the panel needs: the other views' tabs, terminal and footer put away, and the page asked to load.
// Coming from another page or a card, the body goes at once (the page draws its skeleton), not when the fetch answers.
export async function openSettings() {
  if (view !== "settings") return;
  const gen = ++store.pageGen;
  stopDictation(true);
  const fresh = !$("panel").classList.contains("open") || $("ptitle").textContent !== "Settings";
  termStop();
  store.openKey = null;
  store.runDoc = null;
  $("pterm").hidden = true;
  $("panel").classList.add("open");
  $("scrim").classList.add("on");
  $("ptitle").textContent = "Settings";
  // The header's tab strip and sub line are React hosts the panel keeps: emptied through the panel store, never cleared as DOM.
  $("psub").title = "";
  react.drawHead({ head: null, tabs: [] });
  react.drawFooter(null);
  react.drawSettings({ fresh, q: store.setQ, back: store.setBack, stale: () => gen !== store.pageGen });
}
