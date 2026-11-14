import { store } from "./store.ts";
import { termStop } from "./agent-term.ts";
import { stopDictation } from "@lib/dictation";
import { $ } from "./dom.ts";
import { curView } from "./views.ts";
import { setPanel } from "@lib/run";
import { getSettings, loadSettings, pageId, setSettings } from "@lib/settings";

// Ctrl+F searches settings, as in Orca. Only while the page shows: elsewhere it stays the browser's.
addEventListener("keydown", (e) => {
  if (curView() !== "settings" || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return;
  e.preventDefault();
  $("sq")?.focus();
});
// Settings fills the docked panel; the page itself is React (web/pages/settings-page.tsx), fed by lib/settings/settings-store.ts.
// Here is only what the panel needs: the other views' tabs, terminal and footer put away, and the page asked to load.
// Coming from another page or a card, the body goes at once (the page draws its skeleton), not when the fetch answers.
export async function openSettings() {
  if (curView() !== "settings") return;
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
  setPanel({ head: null, tabs: [], footer: null, body: "settings" });
  // Coming from another page the page starts on All projects with a skeleton; the page and search the person left it on are kept.
  if (fresh)
    setSettings({
      typed: {}, // a key or secret typed and not saved is not kept when the page is left
      scope: "all",
      q: store.setQ,
      back: store.setBack,
      page: getSettings().page ?? pageId(new URLSearchParams(location.search).get("page") ?? ""),
    });
  void loadSettings(fresh, () => gen !== store.pageGen);
}
