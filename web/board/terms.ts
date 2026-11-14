import { allBoardCards, refreshBoardBadge } from "./badge.ts";
import { store } from "./store.ts";
import { load } from "./api.ts";
import { react } from "./views.ts";
import { hiddenCount, setTerminalActions, setTerminals, terminalSessions, useTerminals } from "@lib/terminal";

// ---- the Terminal page: every in-card agent session the board knows, Tasks to Done, tiled. The page is React
// (pages/terminal-page.tsx over components/terminal and lib/terminal); this module only feeds it the sessions and keeps
// the side menu's Terminal badge. One card per session; the newest card wins a shared key.
const sessions = () => terminalSessions(allBoardCards ?? store.S.cards, store.shells);
const push = () => setTerminals({ all: sessions() });

// The side menu's Terminal entry counts the tiles hidden on the page (the Hidden bar's chips), on every page.
export function termsBadge() {
  const n = hiddenCount(sessions(), useTerminals.getState().lay);
  const a = document.querySelector<HTMLElement>('.rail a[data-view="terminal"]');
  if (!a) return;
  if (n) a.dataset.n = String(n);
  else delete a.dataset.n;
  a.title = "Terminal: every agent kaizen runs" + (n ? ` (${n} hidden)` : "");
}

export function termsStop() {
  setTerminals({ showing: false });
}
export function openTerms() {
  if (!useTerminals.getState().showing) void refreshBoardBadge();
  setTerminals({ showing: true, all: sessions() });
}
export const termsShowing = () => useTerminals.getState().showing;
// /state ticks, the footer's /shells read and the all-project snapshot each change what the page lists.
export const termsChanged = () => {
  if (termsShowing()) push();
};

if (typeof window !== "undefined") {
  addEventListener("kz-shells", termsChanged);
  addEventListener("kz-all-cards", termsChanged);
  // Resume: the board opens the card on its new session; here the new tile shows it.
  setTerminalActions({
    reload: () => void load(true),
    resume: async (c) => {
      const ok = await react.resume(c);
      store.wantTerm = null;
      return ok;
    },
  });
  // The badge follows the saved layout (a tile hidden or shown on the page).
  useTerminals.subscribe((s, p) => s.lay !== p.lay && termsBadge());
}
