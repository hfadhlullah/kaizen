// The board's router as state (Zustand): the view the address names (?view=, no router library), what the side menu lights and the
// header titles, the pages opened so far, the address's query and the run it names. `navigate` is the only way a view changes:
// it sets the store (the App draws the page and sets the <body> classes from it), pushes the address, and calls the engine
// hooks for what still lives in web/board (the docked panel, the run workspace, Settings).
import { flushSync } from "react-dom";
import { create } from "zustand";
import { isPhone, vt } from "@lib/core";
import {
  bodyClasses,
  litItem,
  pageOf,
  pageSeen,
  resolveView,
  runOf,
  urlFor,
  startView,
  viewTitle,
  type Page,
  type RunRoute,
  type View,
} from "./route-rules.ts";

export type Route = {
  view: View;
  lit: string; // the side menu item marked as the current page
  title: string; // the header's title
  mark: boolean; // the header shows the wordmark instead of the title (a phone's Home)
  page: Page; // the React page the Tasks, task and Icebox hooks work for
  seen: string[]; // pages drawn the first time they open and kept after
  search: string; // location.search at the last change: the row it names is lit
  run: RunRoute | null; // the workspace or run the address names
  menu: boolean; // the phone's navigation menu is open
  visit: number; // counts `navigate` calls: a view opened again (a card or workspace opened in place) is a new visit
};
const about = (v: View, phone: boolean) => ({
  view: v,
  lit: litItem(v, phone),
  title: viewTitle(v, phone),
  mark: v === "home" && phone,
  page: pageOf(v),
});
const seeing = (seen: string[], v: View, phone: boolean) => {
  const p = pageSeen(v, phone);
  return p && !seen.includes(p) ? [...seen, p] : seen;
};
// The first paint already shows the page the address names.
const first = (): Route => {
  const search = typeof location === "undefined" ? "" : location.search,
    phone = typeof matchMedia === "undefined" ? false : isPhone(),
    v = startView(search, phone, typeof document !== "undefined" && document.documentElement.hasAttribute("data-kit"));
  return { ...about(v, phone), seen: seeing([], v, phone), search, run: runOf(search), menu: false, visit: 0 };
};
export const useRoute = create<Route>()(first);
export const getRoute = useRoute.getState;

// The engine's side of a view change: `prepare` before the store changes (the task page learns which task), `leave` before
// the address is pushed (a workspace's terminals unmount, the panel closes), `enter` after it (the page's own start-up);
// `before` is a menu click that wants something set first.
type Hooks = {
  before?(v: View): void;
  prepare?(v: View): void;
  leave?(v: View, was: View): void;
  enter?(v: View, was: View): void;
};
let hooks: Hooks = {};
export const setRouterHooks = (h: Hooks) => (hooks = h);

// The address changed without a view change (a card or a workspace opened in place): the row it names lights.
// The header's title for a view whose name is not the view's own (a workspace is titled by its run or branch).
export const setTitle = (title: string) => useRoute.setState({ title });
export const touchRoute = () => useRoute.setState({ search: location.search, run: runOf(location.search) });
export function navigate(to: string | null | undefined, push = false) {
  const phone = isPhone(),
    v = resolveView(to, phone),
    was = getRoute().view;
  hooks.prepare?.(v);
  // At once: a view transition reads the new title and the lit menu item as the callback returns.
  flushSync(() => useRoute.setState((r) => ({ ...about(v, phone), seen: seeing(r.seen, v, phone), menu: false, visit: r.visit + 1 })));
  hooks.leave?.(v, was);
  // The workspace's address names its card (the run view pushes it); a task pushes its own.
  if (push && v !== was && v !== "run" && v !== "task") history.pushState(null, "", urlFor(v, location.pathname));
  touchRoute();
  hooks.enter?.(v, was);
}
// Home's chat holds a stream the person is reading: true while its page shows.
export const homeShows = () => bodyClasses(getRoute().view, isPhone()).homev;
export const toggleMenu = () => useRoute.setState((r) => ({ menu: !r.menu }));
// The menu's links and the browser's back and forward: one place. A second click on the Board goes back to where the first
// one came from.
let boardBack = false;
// A menu entry's click (the side menu's anchors, and the Search palette's pages): the page opens with a history entry; the Board
// entry is a toggle, a second press goes back to where it came from.
export function menuGo(name: string) {
  hooks.before?.(resolveView(name, isPhone()));
  if (name === "board" && getRoute().view === "board") {
    const back = boardBack;
    boardBack = false;
    return void (back ? history.back() : vt(() => navigate("home", true)));
  }
  vt(() => {
    navigate(name, true);
    boardBack = name === "board";
  });
}
export function startRouter() {
  addEventListener("popstate", () => vt(() => navigate(new URLSearchParams(location.search).get("view"))));
  document.addEventListener("click", (e) => {
    const a = (e.target as Element).closest?.<HTMLAnchorElement>(".rail a[data-view], .rail a.home");
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    const name = a.classList.contains("home") ? "home" : a.dataset.view!;
    if (name === "notes" || name === "video") return;
    e.preventDefault();
    menuGo(name);
  });
}
