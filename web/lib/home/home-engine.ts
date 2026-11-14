import { homeShows } from "@lib/router";
import { onState } from "@lib/server";
import { syncHere, takeHandoff } from "./home-store.ts";

// ---- Home: a chat with kaizen's main agent (cli/chat.ts). The page is React (pages/home-page.tsx, state and requests in
// lib/home/home-store.ts) and so are the header's chat buttons (pages/board/header.tsx); this file keeps Home following the
// board's project and the popup's handoff.

// Back from the popup (`kaizen chat`): the server brings this window back and hands over the chat the popup was on; Home
// opens it. A browser window coming back from a hidden Hyprland workspace fires no focus event, so Home asks every 1.5 s.
// ponytail: polling; push it through the board's state stream if this ever costs anything.
export function initHomeEngine() {
  setInterval(() => homeShows() && void takeHandoff(), 1500);
  // A project picked above: a new chat's greeting names it.
  onState(() => homeShows() && syncHere());
}
