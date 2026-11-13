// The bridge between the old board and its React pages. The Tasks list and the task page are React roots
// mounted inside their old view containers (#tasksv, #taskpagev) the first time they open and kept after. The
// board's view switch (views.ts) calls openTasks()/openTaskPage() where it used to call the old drawing code.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { setHost } from "../lib/host.ts";
import { toast } from "../lib/toast.ts";
import { iceKeys } from "../lib/hooks/use-ice-keys.ts";
import { showTask } from "../lib/hooks/use-task.ts";
import { closeForm as closeBoardForm, getBoard, setBoard, type BoardSnap, type Popup } from "../lib/board-store.ts";
import { setStore } from "../lib/store.ts";
import { BoardPopups } from "../components/board-popups.tsx";
import { BoardPage } from "../pages/board-page.tsx";
import { TaskPage } from "../pages/task-page.tsx";
import { IceboxPage } from "../pages/icebox-page.tsx";
import { TasksPage } from "../pages/tasks-page.tsx";
import { Toaster } from "../ui/sonner.tsx";
import { TooltipProvider } from "../ui/tooltip.tsx";
import { attentionTasks, setTaskAttention } from "./badge.ts";
import { dirHeader, load } from "./api.ts";
import { key, newTask, runPopup, via } from "./cards.ts";
import { open as openPanel, openAt, close as closePanel, openRun } from "./panel.ts";
import { openWorkspace } from "./run-view.ts";
import { mic, stopDictation } from "./dictation.ts";
import { askNotify, setToaster } from "./toast.ts";
import { $, dataUrls, motion } from "./dom.ts";
import { setShown, showable } from "./projects.ts";
import { playSound, soundPick } from "./toast.ts";
import { store } from "./store.ts";

// A root for a page lives in a div of its own inside the old container: the container keeps its layout rules
// (padding, flex, show/hide by body class), the div is the one place Tailwind's reset applies.
const roots = new Set<string>();
function mount(container: string, page: Parameters<typeof createElement>[0]) {
  if (roots.has(container)) return;
  roots.add(container);
  const host = document.createElement("div");
  host.className = "kz-ui";
  host.style.cssText = "flex:1;min-height:0;display:flex;flex-direction:column";
  $(container).append(host);
  createRoot(host).render(createElement(TooltipProvider, null, createElement(page)));
}
export function openTasks() {
  mount("tasksv", TasksPage);
  setStore({ view: "tasks" });
}
export function openIcebox() {
  mount("icev", IceboxPage);
  setStore({ view: "icebox" });
}
export { iceKeys };
// The Board: one root inside #board (display: contents, so the old grid lays the page's columns out), drawn from the
// snapshot cards.ts hands over on every redraw. flushSync: a view transition and the focus restore read the DOM at once.
export function drawBoard(snap: BoardSnap) {
  if (!roots.has("board")) {
    roots.add("board");
    const host = document.createElement("div");
    host.className = "kz-ui";
    host.style.display = "contents";
    $("board").append(host);
    createRoot(host).render(createElement(TooltipProvider, null, createElement(BoardPage)));
  }
  flushSync(() => setBoard({ snap }));
}
export const openPopup = (p: Popup) => setBoard({ popup: p });
export const formOpen = () => !!getBoard().form;
export const closeForm = closeBoardForm;
export function openTaskPage() {
  mount("taskpagev", TaskPage);
  showTask();
}
// Once, at start: the toaster every page and old module shares, what the pages need from the old code, and
// the board's own signals (a view change hides the pages, another page can ask to open a task).
export function initReact(go: (view: string, push?: boolean) => void) {
  const portal = $("kz-portal"),
    toaster = document.createElement("div");
  portal.append(toaster);
  createRoot(toaster).render(createElement(Toaster));
  const popups = document.createElement("div");
  portal.append(popups);
  createRoot(popups).render(createElement(TooltipProvider, null, createElement(BoardPopups)));
  setToaster(toast);
  setHost({
    go,
    newTask: () => newTask(),
    runPopup,
    setTaskAttention,
    attentionTasks: () => attentionTasks,
    scopeDir: () => (!store.all ? (store.S.dir ?? "") : ""),
    dirHeader,
    projects: () => store.S.projects,
    showable,
    shown: () => store.shown,
    clearShown: () => {
      store.shown.clear();
      setShown();
    },
    reload: () => void load(),
    mic: (fields) => mic(fields),
    stopDictation: () => stopDictation(true),
    dataUrls,
    pop: () => soundPick() !== "off" && playSound("pop"),
    motion,
    agentLine: via,
    openCard: (c, tab, item) => (item != null ? openAt(c, tab === "backlog" ? "backlog" : "finding", item) : openPanel(c)),
    openWorkspace,
    loadBoard: () => load(),
    launched: (c, pty) => {
      if (!pty) return;
      store.wantTerm = key(c);
      store.wantPty = { key: pty, at: Date.now() };
    },
    closePanel,
    reopenPanel: (c) => {
      $("pfoot").innerHTML = "";
      void openRun(c, true);
    },
    panelOpenFor: (c) => store.openKey === key(c),
    notify: askNotify,
    openSettings: (q) => {
      store.setQ = q;
      go("settings", true);
    },
  });
  addEventListener("kz-view", () => setStore({ view: "" }));
  addEventListener("kz-open-task", ((e: CustomEvent) => {
    e.preventDefault();
    import("../lib/hooks/use-task.ts").then((m) => m.navigateTask(e.detail));
  }) as EventListener);
}
