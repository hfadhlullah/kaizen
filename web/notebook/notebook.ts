// The notebook page. Bundled into web/dist/notebook.js by `bun run build:web`; the page never sees the filesystem, only
// /vault. This file only starts things: the kit (Search, popups, toasts, the Projects list), the React page
// (pages/notebook-page.tsx over components/notebook and lib/notebook) and the side menu's live parts. See design.md,
// "Notebook", for the look.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { startVault } from "@lib/notebook";
import { refreshBoardBadge } from "../board/badge.ts";
import { initRail } from "../board/workspace.ts";
import { NotebookPage } from "../pages/notebook-page.tsx";
import { mountKit } from "./kit.ts";

// embed=1: a run workspace's note tab shows the note alone, without the side menu and header, so it starts no side menu
// and mounts only the toasts and questions.
const embed = new URLSearchParams(location.search).has("embed");
if (embed) document.body.classList.add("embed");
mountKit(embed);
createRoot(document.getElementById("root")!).render(createElement(NotebookPage));
if (!embed) {
  initRail();
  void refreshBoardBadge();
}
// Every write under a state dir refreshes the page's notes, and the side menu's Board count.
void startVault({ onChanged: embed ? undefined : () => void refreshBoardBadge() });
