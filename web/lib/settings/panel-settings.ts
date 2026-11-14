import { stopDictation } from "@lib/dictation";
import { getRoute } from "@lib/router";
import { getPanel, setPanel, termStop, work } from "@lib/run";
import { getSettings, loadSettings, pageId, setSettings } from "./index.ts";

// Settings fills the docked panel; the page itself is React (web/pages/settings-page.tsx), fed by lib/settings/settings-store.ts.
// Here is only what the panel needs: the other views' tabs, terminal and footer put away, and the page asked to load.
// Coming from another page or a card, the body goes at once (the page draws its skeleton), not when the fetch answers.
export async function openSettings() {
  if (getRoute().view !== "settings") return;
  const gen = ++work.pageGen;
  stopDictation(true);
  const fresh = !getPanel().open || getPanel().title !== "Settings";
  termStop();
  setPanel({ openKey: null });
  work.runDoc = null;
  // The header's tab strip and sub line are React hosts the panel keeps: emptied through the panel store, never cleared as DOM.
  setPanel({ open: true, title: "Settings", titleTip: "", head: null, tabs: [], footer: null, body: "settings" });
  // Coming from another page the page starts on All projects with a skeleton; the page and search the person left it on are kept.
  if (fresh)
    setSettings({
      typed: {}, // a key or secret typed and not saved is not kept when the page is left
      scope: "all",
      q: work.setQ,
      back: work.setBack,
      page: getSettings().page ?? pageId(new URLSearchParams(location.search).get("page") ?? ""),
    });
  void loadSettings(fresh, () => gen !== work.pageGen);
}
