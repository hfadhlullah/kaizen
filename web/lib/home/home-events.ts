import { isHomeDir } from "@lib/rail";
import { openHomeTerm, startHomeFrom, startHomeWs, startIfEmpty } from "./home-window.ts";

// Search, the resource monitor and the phone's Agents list open a terminal by kz-open-term: a Home one opens in the
// window (full screen on a phone). Started ahead of the run view's listener (initRunView), which would open a workspace
// view that does not exist for it.
export function initHomeWs() {
  addEventListener("kz-open-term", (e: any) => {
    if (!isHomeDir(e.detail?.dir)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openHomeTerm(String(e.detail.key ?? ""));
  });
  // The phone's New sheet starts an agent or a shell here ("Home - no project"); the Storage panel's Cleanup starts
  // Claude Code on /disk-cleanup (detail.prompt).
  addEventListener("kz-home-start", (e: any) => startHomeFrom(e.detail));
  // A phone shows Home full screen, only when asked: it never opens by itself on a page load (startHomeWs).
  if (startHomeWs(location.search)) void startIfEmpty();
}
