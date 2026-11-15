// The board page: bundled into web/dist/board.js by `bun run build:web` (iife, so nothing leaks onto window). The page is
// the App; this file starts what the App draws from, in the order the page needs.
// The page never touches the filesystem. Everything comes from /state and the run files behind /run/:id; every change goes
// through a POST and comes back as an SSE tick that reloads the board. See design.md for the visual rules.
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { bootShell } from "@lib/shell";
import { initOnState, startBoard } from "@lib/board";
import { startFooter } from "@lib/footer";
import { App } from "./App.tsx";
import { initHost } from "./host-bridge.ts";
import { initLive } from "./live.ts";
import { initViews } from "./views.ts";
import { initContext } from "@lib/context";
import { initHomeEngine, initHomeWs } from "@lib/home";
import { initTerms } from "@lib/terminal";

// Theme and menu state first (so nothing flashes the default), the host the pages call into, then the React tree into
// <div id="root">, drawn at once because the engines below start from what it drew.
bootShell();
initHost();
flushSync(() => createRoot(document.getElementById("root")!).render(createElement(App)));
initOnState();
initTerms();
initHomeEngine();
initHomeWs();
initViews();
startBoard();
initLive();
initContext();
startFooter();
