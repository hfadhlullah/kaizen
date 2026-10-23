// The board page: bundled into web/board.js by `bun run build:web` (iife, so nothing
// leaks onto window). Each module is one part of the page; this file wires them up in
// the order the page needs.
// The page never touches the filesystem. Everything comes from /state and the run
// files behind /run/:id; every change goes through a POST and comes back as an SSE
// tick that reloads the board. See design.md for the visual rules.
import { initPanel } from "./panel.ts";
import { initViews } from "./views.ts";
import { initProjects } from "./projects.ts";
import { initUpdate } from "./update.ts";
import { initKeys } from "./keys.ts";
import { filterBox, statusSheet } from "./cards.ts";
import { initLive } from "./live.ts";
import { store } from "./store.ts";
import { initViewer } from "./viewer.ts";

initPanel();
initViews();
initProjects();
initUpdate();
initKeys();
initLive();
initViewer();
filterBox();
statusSheet();

// One popup at a time: a press anywhere first shuts every open popup it is not inside,
// before any handler runs (several stop propagation), so the one it opens is the only one
// left. Combos hide theirs, a <details> menu closes, a card's or column's menu goes away.
document.addEventListener(
  "pointerdown",
  (e) => {
    const t = e.target as Node;
    for (const p of document.querySelectorAll<HTMLElement>(".menu-pop:not([hidden])")) {
      const own = p.closest(".combo,details") || p.parentElement;
      if (!own || own.contains(t)) continue;
      if (own instanceof HTMLDetailsElement) own.open = false;
      else if (own.classList.contains("combo")) {
        p.hidden = true;
        own.querySelector("[aria-expanded]")?.setAttribute("aria-expanded", "false");
      } else {
        // Drawn by render() from store: drop it now without a redraw, which would swallow this click.
        p.remove();
        own.classList.remove("menu");
        store.menuKey = null;
        store.clearMenu = false;
        store.sevMenu = false;
      }
    }
  },
  true,
);
