// The floating Home workspace (web/components/home/home-window.tsx, state in lib/home/home-window.ts). What stays here is
// what only the old code can see: the board's list of live shells, and the events other modules send.
import { homeBridge, openHomeTerm, setHomeShells, startHomeFrom, startHomeWs, startIfEmpty } from "@lib/home";
import { store } from "./store.ts";
import { isHomeDir } from "./workspace.ts";

// Search, the resource monitor and the phone's Agents list open a terminal by kz-open-term: a Home one opens in the
// window (full screen on a phone). Registered at import, so ahead of the run view's listener (initRunView), which would
// open a workspace view that does not exist for it.
if (typeof window !== "undefined")
  addEventListener("kz-open-term", (e: any) => {
    if (!isHomeDir(e.detail?.dir)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openHomeTerm(String(e.detail.key ?? ""));
  });

export function initHomeWs() {
  homeBridge.shells = (list) => (store.shells = list as typeof store.shells);
  // The footer's poll fills store.shells; the window follows it.
  addEventListener("kz-shells", () => setHomeShells(store.shells as any));
  // The phone's New sheet starts an agent or a shell here ("Home - no project"); the Storage panel's Cleanup starts
  // Claude Code on /disk-cleanup (detail.prompt).
  addEventListener("kz-home-start", (e: any) => startHomeFrom(e.detail));
  // A phone shows Home full screen, only when asked: it never opens by itself on a page load (startHomeWs).
  if (startHomeWs(location.search)) void startIfEmpty();
}
