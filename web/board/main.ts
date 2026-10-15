// The board page: bundled into web/board.js by `bun run build:web` (iife, so nothing
// leaks onto window). Each module is one part of the page; this file wires them up in
// the order the page needs.
// The page never touches the filesystem. Everything comes from /state and the run
// files behind /run/:id; every change goes through a POST and comes back as an SSE
// tick that reloads the board. See design.md for the visual rules.
import { initPanel } from "./panel.ts";
import { initViews } from "./views.ts";
import { initProjects } from "./projects.ts";
import { initUpdate } from "./update.ts";
import { initKeys } from "./keys.ts";
import { initLive } from "./live.ts";

initPanel();
initViews();
initProjects();
initUpdate();
initKeys();
initLive();
