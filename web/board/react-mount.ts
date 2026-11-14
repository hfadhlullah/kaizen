// The bridge between the old board and its React pages. The Tasks list and the task page are React roots
// mounted inside their old view containers (#tasksv, #taskpagev) the first time they open and kept after. The
// board's view switch (views.ts) calls openTasks()/openTaskPage() where it used to call the old drawing code.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { setHost, toast, setStore } from "../lib/core/index.ts";
import { iceKeys } from "../lib/icebox/index.ts";
import { navigateTask, showTask } from "../lib/task/index.ts";
import { closeForm as closeBoardForm, closeNewForm, getBoard, setBoard, type BoardSnap, type Popup } from "../lib/board/index.ts";
import { setPanel, type Panel, resumeRun, decided } from "../lib/run/index.ts";
import { UpdateCard } from "../components/settings/index.ts";
import {
  AddProjectDialog,
  WsMenu,
  HomeWsAdd,
  ProjectPicker,
  ShowingPicker,
} from "../components/project/index.ts";
import {
  FileViewer,
  FixHost,
  KeyHint,
  PaneHeader,
  ProjectNotes,
  RunEmpty,
  RunHistory,
  RunTabs,
  RunWait,
  PanelHead,
  PanelTabs,
  RunPicker,
  RunFooter,
} from "../components/run/index.ts";
import { SearchPalette } from "../components/search/index.ts";
import { OnboardingDialog } from "../components/home/index.ts";
import { PhoneSheets } from "../components/phone/index.ts";
import { AskHost } from "../components/shared/index.ts";
import { BoardPopups, BoardModeSwitch } from "../components/board/index.ts";
import { GitHost } from "../components/git/index.ts";
import { setGit } from "../lib/git/index.ts";
import { getSettings, loadSettings, setSettings, pageId } from "../lib/settings/index.ts";
import { SettingsPage } from "../pages/settings-page.tsx";
import { FONT_MAX, FONT_MIN, fontRead, fontSet } from "../term-font.ts";
import { BoardPage } from "../pages/board-page.tsx";
import { TaskPage } from "../pages/task-page.tsx";
import { HomePage } from "../pages/home-page.tsx";
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
import { pick as pickProject, setShown, showable } from "./projects.ts";
import { gitProjects, wsHref } from "./workspace.ts";
import { notifyOn, playSound, SOUNDS, soundPick } from "./toast.ts";
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
// Home: a root inside #home (display: contents, so #home's own flex row lays the list and the conversation out).
export function mountHome() {
  if (roots.has("home")) return;
  roots.add("home");
  const host = document.createElement("div");
  host.className = "kz-ui";
  host.style.display = "contents";
  $("home").append(host);
  createRoot(host).render(createElement(TooltipProvider, null, createElement(HomePage)));
}
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
// The run panel's footer: a root inside #pfoot (display: contents, so its flex row lays the strip out), drawn from what
// panel.ts openRun() publishes. The Fix findings form is drawn into a slot in the review tab by a portal.
export function drawFooter(footer: Panel["footer"]) {
  if (!roots.has("pfoot")) {
    roots.add("pfoot");
    const host = document.createElement("div");
    host.className = "kz-ui";
    host.style.display = "contents";
    $("pfoot").append(host);
    createRoot(host).render(createElement(TooltipProvider, null, createElement(RunFooter)));
  }
  flushSync(() => setPanel({ footer }));
}
export const drawFix = (fix: any) => setPanel({ fix });
export const drawGit = (snap: any) => setGit({ snap });
export const drawHead = (head: Partial<Panel>) => setPanel(head);
export const drawMode = (modeSwitch: any) => setBoard({ modeSwitch });
// Settings: one root inside the panel's body, made again when another page replaced the body. State and requests are in
// lib/settings/settings-store.ts; coming from another page the page starts on All projects with a skeleton, and the page and search
// the person left it on are kept.
let settingsRoot: { root: ReturnType<typeof createRoot>; host: HTMLElement } | null = null;
export function drawSettings(o: { fresh: boolean; q: string; back: boolean; stale: () => boolean }) {
  const body = $("pbody");
  if (!settingsRoot || settingsRoot.host.parentElement !== body) {
    settingsRoot?.root.unmount();
    const host = document.createElement("div");
    host.className = "kz-ui";
    host.style.cssText = "height:100%;display:contents";
    body.replaceChildren(host);
    settingsRoot = { root: createRoot(host), host };
    settingsRoot.root.render(createElement(TooltipProvider, null, createElement(SettingsPage)));
  }
  if (o.fresh)
    setSettings({
      typed: {}, // a key or secret typed and not saved is not kept when the page is left
      scope: "all",
      q: o.q,
      back: o.back,
      page: getSettings().page ?? pageId(new URLSearchParams(location.search).get("page") ?? ""),
    });
  void loadSettings(o.fresh, o.stale);
}
export const fixReset = () => setPanel({ off: [] });
export const answered = () => [...decided];
export const resumeCard = resumeRun;
export const formOpen = () => !!getBoard().form;
export const closeForm = closeBoardForm;
export { closeNewForm };
// The run workspace's chrome (run-view.ts publishes it through lib/run/run-view-store.ts). A root lives in an element the old
// code keeps (the tab bar, the empty note, the notes list) and never in a pane, so no live terminal is touched.
// `display: contents` leaves the old container's layout rules in charge of where each piece sits.
const bits = { hwsadd: HomeWsAdd, projects: ProjectPicker, showing: ShowingPicker, tabs: RunTabs, empty: RunEmpty, notes: ProjectNotes, header: PaneHeader, history: RunHistory, wait: RunWait, ptabs: PanelTabs, head: PanelHead, picker: RunPicker, mode: BoardModeSwitch };
export function mountRunPart(el: HTMLElement, part: keyof typeof bits, id = ""): () => void {
  const host = document.createElement("div");
  host.className = "kz-ui";
  host.style.display = "contents";
  el.append(host);
  const root = createRoot(host);
  root.render(createElement(TooltipProvider, null, createElement(bits[part] as any, { id })));
  // Unmounted on the next tick: a pane's × runs inside React's own event handler.
  return () => void queueMicrotask(() => (root.unmount(), host.remove()));
}
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
  createRoot(popups).render(createElement(TooltipProvider, null, createElement(BoardPopups), createElement(AskHost), createElement(PhoneSheets), createElement(OnboardingDialog), createElement(SearchPalette), createElement(FileViewer), createElement(WsMenu), createElement(AddProjectDialog), createElement(UpdateCard), createElement(FixHost), createElement(GitHost), createElement(KeyHint)));
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
    toggleShown: (d) => {
      store.shown.has(d) ? store.shown.delete(d) : store.shown.add(d);
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
    reopenPanel: (c) => void openRun(c, true),
    refetchRun: (c) => openRun(c, false),
    gitTab: (c) => {
      store.tab = "git";
      void openRun(c, true);
    },
    panelOpenFor: (c) => store.openKey === key(c),
    notify: askNotify,
    font: { min: FONT_MIN, max: FONT_MAX, read: fontRead, set: fontSet },
    notices: { on: notifyOn, sounds: SOUNDS, sound: soundPick, play: (n) => playSound(n) },
    currentDir: () => store.dir || store.S?.dir || "",
    gitProjects,
    runCards: () => store.S.cards.filter((c) => c.kind === "run"),
    wsHref,
    pickProject,
    openSettings: (q) => {
      store.setQ = q;
      go("settings", true);
    },
  });
  addEventListener("kz-view", () => setStore({ view: "" }));
  addEventListener("kz-open-task", ((e: CustomEvent) => {
    e.preventDefault();
    navigateTask(e.detail);
  }) as EventListener);
}
