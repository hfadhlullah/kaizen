// The notebook page. Bundled into web/dist/notebook.js by `bun run build:web`; the page never sees the filesystem, only
// /vault. This file only starts things: the theme and menu state, the kit stores the shared code reaches through
// `window.kzKit`, the App (pages/notebook/App.tsx over components/notebook and lib/notebook) and the side menu's live
// parts. See design.md, "Notebook", for the look.
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { startVault } from "@lib/notebook";
import { bootShell } from "@lib/shell";
import { refreshBoardBadge } from "../board/badge.ts";
import { initRail } from "../board/workspace.ts";
import { App } from "../pages/notebook/App.tsx";
import { registerKit } from "./kit.ts";

// embed=1: a run workspace's note tab shows the note alone, without the side menu and header, so it starts no side menu.
const embed = new URLSearchParams(location.search).has("embed");
if (embed) document.body.classList.add("embed");
bootShell();
if (!embed) registerKit();
// At once: the side menu's code below finds its elements by id.
flushSync(() => createRoot(document.getElementById("root")!).render(createElement(App, { embed })));
if (!embed) {
  initRail();
  void refreshBoardBadge();
}
// Every write under a state dir refreshes the page's notes, and the side menu's Board count.
void startVault({ onChanged: embed ? undefined : () => void refreshBoardBadge() });
