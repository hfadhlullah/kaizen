import { store } from "./store.ts";
import { load } from "./api.ts";
import { resumeRun } from "@lib/run";
import { getServer, onServer, refreshEvery } from "@lib/server";
import { setTerminalActions, setTerminals, terminalSessions, useTerminals } from "@lib/terminal";

// ---- the Terminal page: every in-card agent session the board knows, Tasks to Done, tiled. The page is React
// (pages/terminal-page.tsx over components/terminal and lib/terminal); this module only feeds it the sessions (the side
// menu's Terminal badge reads the same store, components/shell/rail.tsx). One card per session; the newest card wins a shared key.
const sessions = () => terminalSessions(getServer().every?.cards ?? store.S.cards, store.shells);
const push = () => setTerminals({ all: sessions() });

export function termsStop() {
  setTerminals({ showing: false });
}
export function openTerms() {
  if (!useTerminals.getState().showing) void refreshEvery();
  setTerminals({ showing: true, seen: true, all: sessions() });
}
// /state ticks, the footer's /shells read and the all-project snapshot each change what the page lists.
export const termsChanged = () => {
  if (useTerminals.getState().seen) push();
};

if (typeof window !== "undefined") {
  onServer((s) => s.shells, termsChanged);
  onServer((s) => s.every, termsChanged);
  // Resume: the board opens the card on its new session; here the new tile shows it.
  setTerminalActions({
    reload: () => void load(true),
    resume: async (c) => {
      const ok = await resumeRun(c);
      store.wantTerm = null;
      return ok;
    },
  });
}
