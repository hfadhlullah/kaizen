import { store } from "./store.ts";
import { api } from "./api.ts";
import { setupMic } from "./dictation.ts";
import { listen } from "./live.ts";
import { openNeeds } from "./needs.ts";
import { loadBoard } from "./panel.ts";
import { loadBots, shown } from "./sidebar.ts";
import { select } from "./thread.ts";
import { openTo } from "./to.ts";

export function initStart() {
  // ---- start ----
  setupMic();
  (async () => {
    store.info = await api("/info");
    await Promise.all([loadBots(), loadBoard()]);
    listen();
    const last = shown().find((b) => String(b.id) === location.hash.slice(1)) || shown()[0];
    if (location.hash === "#needs") openNeeds();
    else if (last) select(last.id);
    else openTo();
  })();
}
