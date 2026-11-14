import { startHomeWs, startIfEmpty } from "./home-window.ts";

// Search, the resource monitor and the phone's Agents list open a Home terminal through host.open.term (a Home one opens in
// the window, full screen on a phone), and the phone's New sheet and the Storage panel's Cleanup start one through
// host.open.homeStart (both answered by pages/board/host-bridge.ts). What is left here is the page load.
export function initHomeWs() {
  // A phone shows Home full screen, only when asked: it never opens by itself on a page load (startHomeWs).
  if (startHomeWs(location.search)) void startIfEmpty();
}
