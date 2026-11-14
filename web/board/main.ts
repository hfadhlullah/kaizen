// The board page: bundled into web/dist/board.js by `bun run build:web` (iife, so nothing
// leaks onto window). Each module is one part of the page; this file wires them up in
// the order the page needs.
// The page never touches the filesystem. Everything comes from /state and the run
// files behind /run/:id; every change goes through a POST and comes back as an SSE
// tick that reloads the board. See design.md for the visual rules.
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { bootShell } from "@lib/shell";
import { initOnboarding } from "@lib/home";
import { App } from "../pages/board/App.tsx";
import { initPanel } from "./panel.ts";
import { initViews, go } from "./views.ts";
import { initHost } from "./host.ts";
import { initProjects, pick } from "./projects.ts";
import { initKeys } from "./keys.ts";
import { filterBox } from "./cards.ts";
import { initLive } from "./live.ts";
import { store } from "./store.ts";
import { initContext } from "./context.ts";
import { cardHref, initFooter, initRail, markCurrent, wsHref } from "./workspace.ts";
import { openWorkspace } from "./run-view.ts";
import { initHomeWs } from "./home-ws.ts";

// The page is the App: theme and menu state first (so nothing flashes the default), the host the pages call into, then the
// React tree into <div id="root">, drawn at once because the modules below find their elements by id.
bootShell();
initHost();
flushSync(() => createRoot(document.getElementById("root")!).render(createElement(App)));
initPanel();
initViews();
initProjects();
initKeys();
initLive();
initContext();
filterBox();
initRail();
initFooter();
initHomeWs();
// The rail's rows and + open a card or the new-task form here, on the board, when it has them.
// A row of another project than the one picked switches the board to that project first.
addEventListener("kz-open-card", (e: any) => {
  const { dir, id, text } = e.detail;
  const find = () =>
    store.S.cards.find(
      (x) => x.state === dir && (id ? x.kind === "run" && x.id === id : x.kind === "idea" && x.text === text),
    );
  const c = find();
  if (c) {
    e.preventDefault();
    return openWorkspace(c);
  }
  if (!dir || dir === store.dir) return;
  e.preventDefault();
  const href = cardHref({ state: dir, kind: id ? "run" : "idea", id, text });
  pick(dir)
    .then(() => {
      const c = find();
      if (c) openWorkspace(c);
      else location.href = href;
    })
    .catch(() => (location.href = href));
});
// A workspace row opens in place: the run view resolves it (showRunView).
addEventListener("kz-open-ws", (e: any) => {
  e.preventDefault();
  history.pushState(null, "", wsHref(e.detail.dir, e.detail.ws));
  markCurrent();
  go("ws");
});

void initOnboarding();
