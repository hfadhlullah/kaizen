import { store } from "./store.ts";
import { open } from "./panel.ts";
import { key } from "./cards.ts";
import { projectChanged, setContextActions, setContextData } from "@lib/context";

// The Project context pane (files, notes, terminal sessions beside the board) is React (components/context over
// lib/context). This module tells it which project is picked and which cards hold a terminal, opens a card on its agent.
// The header's open button is drawn by the pane's own component.
const selectedDir = () => store.dir || store.S.dir || "";
const sessions = () => store.S.cards.filter((c) => c.pty && !c.archived);

export function initContext() {
  setContextActions({
    openSession: (card) => {
      store.wantTerm = key(card);
      open(card);
    },
  });
  setContextData({ dir: selectedDir(), sessions: sessions() });
  let lastDir = selectedDir();
  addEventListener("kz-state", () => {
    setContextData({ sessions: sessions() });
    const now = selectedDir();
    if (now !== lastDir) {
      lastDir = now;
      projectChanged(now);
    }
  });
}
