import { useMemo } from "react";
import { useServer } from "@lib/server";
import { hiddenCount } from "./layout.ts";
import { terminalSessions } from "./sessions.ts";
import { useTerminals } from "./terminal-store.ts";

// The side menu's Terminal entry counts the tiles hidden on the Terminal page, on every page: the sessions the server lists
// (every project's cards, else this page's) against the saved layout. The Notebook never loads a /state, so it shows none.
export function useHiddenTerminals() {
  const lay = useTerminals((s) => s.lay),
    cards = useServer((s) => s.every?.cards ?? s.state.cards),
    shells = useServer((s) => s.shells),
    loaded = useServer((s) => s.loaded);
  return useMemo(() => (loaded ? hiddenCount(terminalSessions(cards, shells), lay) : 0), [loaded, cards, shells, lay]);
}
