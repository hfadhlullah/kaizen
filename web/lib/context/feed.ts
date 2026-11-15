import { openPanel, setPanel } from "@lib/run";
import { cardKey as key, getServer, onState } from "@lib/server";
import { projectChanged, setContextActions, setContextData } from "./index.ts";

// The Project context pane (files, notes, terminal sessions beside the board) is React (components/context over
// lib/context). This module tells it which project is picked and which cards hold a terminal, opens a card on its agent.
// The header's open button is drawn by the pane's own component.
const selectedDir = () => getServer().dir || getServer().state.dir || "";
const sessions = () => getServer().state.cards.filter((c) => c.pty && !c.archived);

export function initContext() {
  setContextActions({
    openSession: (card) => {
      setPanel({ wantTerm: key(card) });
      openPanel(card);
    },
  });
  setContextData({ dir: selectedDir(), sessions: sessions() });
  let lastDir = selectedDir();
  onState(() => {
    setContextData({ sessions: sessions() });
    const now = selectedDir();
    if (now !== lastDir) {
      lastDir = now;
      projectChanged(now);
    }
  });
}
