// Kaizen Bot's page: bundled into bot/web/app.js by `bun run build:web` at the repo root
// (iife, so nothing leaks onto window). Each module is one part of the page; this file
// wires them up in the order the page needs.
import { initSidebar } from "./sidebar.ts";
import { initNeeds } from "./needs.ts";
import { initTo } from "./to.ts";
import { initAttachments } from "./attachments.ts";
import { initComposer } from "./composer.ts";
import { initLive } from "./live.ts";
import { initPanel } from "./panel.ts";
import { initRail } from "./rail.ts";
import { initStart } from "./start.ts";

initSidebar();
initNeeds();
initTo();
initAttachments();
initComposer();
initLive();
initPanel();
initRail();
initStart();
