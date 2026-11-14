import { flushSync } from "react-dom";
import { store } from "./store.ts";
import { $, vt } from "./dom.ts";
import { close } from "./panel.ts";
import { openSettings } from "./settings.ts";
import { openTerms, termsStop } from "./terms.ts";
import { openHome } from "./home.ts";
import { initRunView, openWorkspace, runStop, showRunView } from "./run-view.ts";
import { isPhone, setStore } from "@lib/core";
import { openPhone } from "@lib/phone";
import { see, setView } from "@lib/shell";
import { navigateTask, showTask } from "@lib/task";

// ---- views: Home (the chat, at /), the board, Settings and the Icebox as pages in the docked panel, or the Terminal page; each with its own address
export let view = "board";
let boardBack = false;
// The board's own area, not the docked panel.
const AREA = ["board", "terminal", "home", "tasks", "task", "run", "chat", "device", "sources"];
export function go(v, push) {
  store.pageGen++;
  document.body.classList.remove("phone-menu-open");
  $("phone-menu")?.setAttribute("aria-expanded", "false");
  if (v === "icebox") v = "sources";
  // A workspace address shows in the run view, which resolves it to a card.
  if (v === "ws") v = "run";
  if (!["settings", "sources", "terminal", "board", "tasks", "task", "run", "chat", "device"].includes(v)) v = "home";
  // Phone keeps Runs and Tasks reachable; the desktop board and chat remain desktop views.
  if (isPhone() ? ["board", "sources"].includes(v) : v === "chat" || v === "device") v = "home";
  const was = view;
  view = v;
  // At once: a view transition reads the new title and the lit menu item as the callback returns.
  flushSync(() => setView(v, isPhone()));
  document.body.classList.toggle("paged", v !== "board");
  document.body.classList.toggle("ice", v === "sources");
  document.body.classList.toggle("setv", v === "settings");
  document.body.classList.toggle("termv", v === "terminal");
  const ph = isPhone() && v === "home";
  document.body.classList.toggle("homev", (v === "home" && !ph) || v === "chat");
  document.body.classList.toggle("phomev", ph || v === "device");
  document.body.classList.toggle("pdevv", v === "device");
  document.body.classList.toggle("taskv", v === "tasks");
  document.body.classList.toggle("taskpagev", v === "task");
  document.body.classList.toggle("runv", v === "run");
  // Leaving a workspace: its panel closes as the board's would, its terminals unmount.
  if (was === "run" && v !== "run") {
    runStop();
    view = "board";
    close();
    view = v;
  }
  // The workspace's address names its card: openWorkspace() pushes it.
  if (push && v !== was && v !== "run" && v !== "task")
    history.pushState(null, "", v === "home" ? location.pathname : "?view=" + (v === "sources" ? "icebox" : v));
  dispatchEvent(new Event("kz-view"));
  const p = $("panel");
  if (v === "terminal") openTerms();
  else termsStop();
  if ((v === "home" && !ph) || v === "chat") openHome();
  openPhone(ph ? "home" : v === "device" ? "device" : null);
  // The pages are drawn the first time they open (pages/board/pages.tsx) and tell the core store which one shows.
  if (v === "tasks") (see("tasks"), setStore({ view: "tasks" }));
  if (v === "task") (see("task"), showTask());
  if (v === "sources") (see("icebox"), setStore({ view: "icebox" }));
  // After the panel handling below, which closes the board's panel on the way in.
  if (v === "run") queueMicrotask(() => void showRunView(true));
  // The Terminal page is the board's own area, not the docked panel: the panel closes as on the board.
  if (AREA.includes(v)) {
    if (AREA.includes(was)) {
      if (v !== "board" && (was === "board" || was === "tasks" || was === "sources")) {
        view = "board";
        close();
        view = v;
      }
      return;
    }
    // Undocked without the slide: it was a page, not a drawer leaving.
    p.style.transition = "none";
    p.classList.remove("open", "docked");
    p.offsetWidth;
    p.style.transition = "";
    view = "board";
    close();
    view = v;
    return;
  }
  p.classList.add("docked");
  openSettings();
}

export function initViews() {
  $("phone-menu").onclick = () => {
    const on = document.body.classList.toggle("phone-menu-open");
    $("phone-menu").setAttribute("aria-expanded", String(on));
    $("phone-menu").setAttribute("aria-label", on ? "Hide navigation menu" : "Show navigation menu");
  };
  initRunView();
  document.querySelectorAll(".rail a[data-view]").forEach((a) => {
    if (a.dataset.view === "notes" || a.dataset.view === "video") return;
    a.onclick = (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      e.preventDefault();
      if (a.dataset.view === "settings") {
        store.setQ = "";
        store.setBack = view !== "settings";
      }
      // Board is a toggle: a second click goes back to where the first one came from.
      if (a.dataset.view === "board" && view === "board") {
        const back = boardBack;
        boardBack = false;
        return void (back ? history.back() : vt(() => go("home", true)));
      }
      const opening = a.dataset.view === "board";
      vt(() => {
        go(a.dataset.view, true);
        boardBack = opening;
      });
    };
  });
  // A view change hides the pages; another page can ask to open a task.
  addEventListener("kz-view", () => setStore({ view: "" }));
  addEventListener("kz-open-task", ((e: CustomEvent) => {
    e.preventDefault();
    navigateTask(e.detail);
  }) as EventListener);
  document.querySelector(".rail .home").onclick = (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    vt(() => go("home", true));
  };
  addEventListener("popstate", () => vt(() => go(new URLSearchParams(location.search).get("view"))));
  // The menu's theme switch while Settings shows: its Theme row follows.
  addEventListener("kz-theme", () => {
    if (view === "settings") openSettings();
  });
}
