import { store } from "./store.ts";
import { open } from "./panel.ts";
import { key } from "./cards.ts";
import { projectChanged, setContextActions, setContextData, setOpen, useContext } from "@lib/context";

// The Project context pane (files, notes, terminal sessions beside the board) is React (components/context over
// lib/context). This module tells it which project is picked and which cards hold a terminal, opens a card on its agent,
// and wires the header's button that opens and closes it.
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
  const opener = document.getElementById("ctx-open")!;
  opener.onclick = () => {
    const next = !useContext.getState().open;
    setOpen(next);
    // As a dialog the focus goes in, to the tab in use.
    if (next && !matchMedia("(min-width:1201px)").matches)
      requestAnimationFrame(() => document.querySelector<HTMLElement>("#context nav button.on")?.focus());
  };
  opener.setAttribute("aria-expanded", "false");
  useContext.subscribe((s, p) => s.open !== p.open && opener.setAttribute("aria-expanded", String(s.open)));
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
