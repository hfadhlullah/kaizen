// The bridge between the old board and its React pages. The Tasks list and the task page are React roots
// mounted inside their old view containers (#tasksv, #taskpagev) the first time they open and kept after. The
// board's view switch (views.ts) calls openTasks()/openTaskPage() where it used to call the old drawing code.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { setHost } from "../lib/host.ts";
import { toast } from "../lib/toast.ts";
import { iceKeys } from "../lib/hooks/use-ice-keys.ts";
import { showTask } from "../lib/hooks/use-task.ts";
import { setStore } from "../lib/store.ts";
import { TaskPage } from "../pages/task-page.tsx";
import { IceboxPage } from "../pages/icebox-page.tsx";
import { TasksPage } from "../pages/tasks-page.tsx";
import { Toaster } from "../ui/sonner.tsx";
import { TooltipProvider } from "../ui/tooltip.tsx";
import { attentionTasks, setTaskAttention } from "./badge.ts";
import { dirHeader, load } from "./api.ts";
import { newTask, runPopup, via } from "./cards.ts";
import { mic, stopDictation } from "./dictation.ts";
import { setToaster } from "./toast.ts";
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
    mic: (field) => mic([field]),
    stopDictation: () => stopDictation(true),
    dataUrls,
    pop: () => soundPick() !== "off" && playSound("pop"),
    motion,
    agentLine: via,
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
