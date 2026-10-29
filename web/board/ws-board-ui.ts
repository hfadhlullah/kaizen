// The Board page's Workspaces mode: four columns of workspace cards (ws-board.ts places
// them) drawn into #board, and the Workspaces | Runs switch in the header.
import { store } from "./store.ts";
import { $, html } from "./dom.ts";
import { RANK, logo, projName, railData, stateOf, subline, titleOf, wsHref, wsLabel, wsOfCard } from "./workspace.ts";
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
function drawToggle() {
  const hx = $("hx");
  if (document.body.classList.contains("paged") || !hx) return;
  const m = boardMode();
  hx.innerHTML = String(
    html`<span class="bar" id="bmode" role="group" aria-label="Board mode"><button data-m="ws" class="${m === "ws" ? "on" : ""}" aria-pressed="${m === "ws"}">Workspaces</button><button data-m="runs" class="${m === "runs" ? "on" : ""}" aria-pressed="${m === "runs"}">Runs</button></span>`,
  );
  hx.querySelectorAll<HTMLElement>("[data-m]").forEach(
    (b) =>
      (b.onclick = () => {
        try {
          localStorage.setItem(KEY, b.dataset.m!);
        } catch {}
        syncMode();
        drawToggle();
        rerender();
      }),
  );
}
export function initWsBoard(render: () => void) {
  rerender = render;
  addEventListener("kz-view", () => (syncMode(), drawToggle()));
  addEventListener("kz-state", drawToggle);
  addEventListener("kz-rail", () => boardMode() === "ws" && !document.body.classList.contains("paged") && render());
  $("board").addEventListener("click", (e: MouseEvent) => {
    const a = (e.target as Element).closest?.("a.wcard") as HTMLAnchorElement;
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    if (!dispatchEvent(new CustomEvent("kz-open-ws", { cancelable: true, detail: { dir: a.dataset.dir, ws: a.dataset.ws } }))) e.preventDefault();
  });
  syncMode();
  drawToggle();
}

// `inScope(dir)` is the board's project scope (single project, or the Showing filter).
export function drawWsBoard(inScope: (dir: string) => boolean) {
  const b = $("board"),
    now = store.S.now || Date.now(),
    { cards, projects } = railData(),
    q = ($("bq").value || "").trim().toLowerCase();
  syncMode();
  b.removeAttribute("aria-busy");
  const cols: string[][] = WS_COLS.map(() => []);
  for (const { dir, w, cs } of groupWs(cards, projects, wsOfCard)) {
    const name = projName(dir, projects);
    const { col, open, last } = columnOf(cs, dir, w.path, wsOfCard, stateOf);
    // Neither the project filter nor search hides a workspace waiting on the user (In review).
    if (col !== 2 && !inScope(dir)) continue;
    if (q && col !== 2 && !`${wsLabel(w)} ${name} ${cs.map(titleOf).join(" ")}`.toLowerCase().includes(q)) continue;
    const lead = [...open].sort((x, y) => RANK[stateOf(x)] - RANK[stateOf(y)])[0] ?? last;
    // An idea whose agent asks adds the waiting dot; its column never changes.
    const asks = cs.some((c) => c.kind === "idea" && stateOf(c) === "wait");
    const st = asks ? "wait" : lead ? stateOf(lead) : "idle";
    cols[col].push(
      String(
        html`<a class="wcard" href="${wsHref(dir, w.path)}" data-dir="${dir}" data-ws="${w.path}"><span class="si ${st}"></span><span class="wmain"><b>${wsLabel(w)}${w.main ? html`<i class="wtag">primary</i>` : ""}</b><small>${logo(dir, name, projects)}${name}</small><code>${cardLine(lead, lead ? stateOf(lead) : "", lead ? subline(lead, now) : "")}</code></span></a>`,
      ),
    );
  }
  b.innerHTML = cols
    .map((l, i) => `<section><h2>${WS_COLS[i]} <i>${l.length || ""}</i></h2><div class="wlist">${l.join("") || '<p class="wempty">Empty</p>'}</div></section>`)
    .join("");
}
