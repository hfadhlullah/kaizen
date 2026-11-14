// The Board page's Workspaces mode: four columns of workspace cards (ws-board.ts places
// them) drawn into #board, and the Workspaces | Runs switch in the header.
import { store } from "./store.ts";
import { $ } from "./dom.ts";
import { setBoard } from "@lib/board";
import { RANK, projName, stateOf, titleOf, wsHref, wsLabel, wsOfCard } from "./workspace.ts";
import { getRoute, useRoute } from "@lib/router";
import { attentionFor } from "@lib/rail";
import { onState, railDataNow, useServer } from "@lib/server";
import { subline } from "@lib/phone";
import type { WsCard } from "@lib/board";
import { WS_COLS, cardLine, columnOf, groupWs } from "./ws-board.ts";

const KEY = "kz-board-mode";
export const boardMode = (): "ws" | "runs" => {
  try {
    return localStorage.getItem(KEY) === "runs" ? "runs" : "ws";
  } catch {
    return "ws";
  }
};
let rerender = () => {};
// The body class and the search box's hint follow the mode (not on other pages, which own them).
export function syncMode() {
  const ws = boardMode() === "ws";
  document.body.classList.toggle("wsb", ws);
  if (getRoute().view === "board") $("bq").placeholder = ws ? "Search workspaces (press /)" : "Filter cards (press /)";
}
// The switch is React (components/board/board-mode-switch.tsx), in the header's #hx; it is shown on the Board only.
function drawToggle() {
  setBoard({
    modeSwitch: getRoute().view !== "board"
      ? null
      : {
          mode: boardMode(),
          set: (m) => {
            try {
              localStorage.setItem(KEY, m);
            } catch {}
            syncMode();
            drawToggle();
            rerender();
          },
        },
  });
}
export function initWsBoard(render: () => void) {
  rerender = render;
  useRoute.subscribe((r, p) => r.view !== p.view && (syncMode(), drawToggle()));
  onState(drawToggle);
  // Fresh rail data (an all-projects read, or the sources) redraws Workspaces mode. A /state that carries the cards
  // draws them itself, so a snapshot that came with one is not news.
  useServer.subscribe((s, p) => {
    const fresh = (s.every !== p.every && s.state === p.state) || s.sources !== p.sources;
    if (fresh && boardMode() === "ws" && getRoute().view === "board") render();
  });
  syncMode();
  drawToggle();
}

// What Workspaces mode shows, for the Board page: one list of workspace cards per column (ws-board.ts places them).
// `inScope(dir)` is the board's project scope (single project, or the Showing filter).
export function wsBoardData(inScope: (dir: string) => boolean): { ws: WsCard[][]; wsNames: string[] } {
  const now = store.S.now || Date.now(),
    { cards, projects } = railDataNow(),
    q = ($("bq").value || "").trim().toLowerCase();
  const cols: WsCard[][] = WS_COLS.map(() => []);
  for (const { dir, w, cs } of groupWs(cards, projects, wsOfCard)) {
    const name = projName(dir, projects);
    const { col, open, last } = columnOf(cs, dir, w.path, wsOfCard, stateOf);
    // Neither the project filter nor search hides a workspace waiting on the user (In review).
    if (col !== 2 && !inScope(dir)) continue;
    if (q && col !== 2 && !`${wsLabel(w)} ${name} ${cs.map(titleOf).join(" ")}`.toLowerCase().includes(q)) continue;
    const lead = [...open].sort((x, y) => RANK[stateOf(x)] - RANK[stateOf(y)])[0] ?? last;
    // A task whose agent asks adds the waiting dot; its column never changes.
    const asks = cs.some((c) => c.kind === "idea" && stateOf(c) === "wait");
    cols[col].push({
      dir,
      path: w.path,
      href: wsHref(dir, w.path),
      state: asks ? "wait" : lead ? stateOf(lead) : "idle",
      label: wsLabel(w),
      main: !!w.main,
      project: name,
      line: cardLine(lead, lead ? stateOf(lead) : "", lead ? subline(lead, now, attentionFor(lead)) : ""),
    });
  }
  return { ws: cols, wsNames: WS_COLS };
}
