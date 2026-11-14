// The Board page's Workspaces mode: four columns of workspace cards (ws-board.ts places
// them) drawn into #board, and the Workspaces | Runs switch in the header.
import { store } from "./store.ts";
import { $ } from "./dom.ts";
import { react } from "./views.ts";
import { RANK, projName, railData, stateOf, subline, titleOf, wsHref, wsLabel, wsOfCard } from "./workspace.ts";
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
  if (!document.body.classList.contains("paged")) $("bq").placeholder = ws ? "Search workspaces (press /)" : "Filter cards (press /)";
}
// The switch is React (components/board/board-mode-switch.tsx), mounted once into the header's #hx; it is shown on the Board only.
let mounted = false;
function drawToggle() {
  const hx = $("hx");
  if (!hx) return;
  if (!mounted) (mounted = true), react.mountRunPart(hx, "mode");
  react.drawMode(
    document.body.classList.contains("paged")
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
  );
}
export function initWsBoard(render: () => void) {
  rerender = render;
  addEventListener("kz-view", () => (syncMode(), drawToggle()));
  addEventListener("kz-state", drawToggle);
  // A render publishes the cards, which raises kz-rail at once: that one is its own echo, not
  // news, and answering it rendered again forever. Fresh rail data (a fetch) still redraws.
  let drawing = false;
  addEventListener("kz-rail", () => {
    if (drawing || boardMode() !== "ws" || document.body.classList.contains("paged")) return;
    drawing = true;
    try {
      render();
    } finally {
      drawing = false;
    }
  });
  syncMode();
  drawToggle();
}

// What Workspaces mode shows, for the Board page: one list of workspace cards per column (ws-board.ts places them).
// `inScope(dir)` is the board's project scope (single project, or the Showing filter).
export function wsBoardData(inScope: (dir: string) => boolean): { ws: WsCard[][]; wsNames: string[] } {
  const now = store.S.now || Date.now(),
    { cards, projects } = railData(),
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
      line: cardLine(lead, lead ? stateOf(lead) : "", lead ? subline(lead, now) : ""),
    });
  }
  return { ws: cols, wsNames: WS_COLS };
}
