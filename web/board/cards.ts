// The Board page's render path. The cards, columns, card menu and forms are React (web/pages/board-page.tsx); this
// module is what is left of the old drawing: it works out what the board shows (project filter, status strip,
// archive) and hands the Board page a snapshot, and it keeps the header and footer chrome (status strip, project
// button, tab title). Forms and popups other modules open (`formPopup`, `runPopup`, `newTask`) are opened through
// the page's store.
import { store } from "./store.ts";
import { $, html, ico } from "./dom.ts";
import { draft } from "./drafts.ts";
import { COLS, ICON, WORD } from "./labels.ts";
import { isPhone } from "@lib/core";
import { showable } from "./projects.ts";
import { setProjectBar } from "@lib/project";
import { setStripActions } from "@lib/board";
import { termsBadge } from "./terms.ts";
import { boardBadge, waitingCount } from "./badge.ts";
import { WS_COLS } from "./ws-board.ts";
import { boardMode, initWsBoard, syncMode, wsBoardData } from "./ws-board-ui.ts";
import { react } from "./views.ts";

let filter = null;
let query = ""; // the header filter box, matched against a card's title and request
let archive = false; // showing the archive instead of the board
// A click on a status chip (components/board/status-strip.tsx) filters to that status, or back to all; the archive chip toggles the archive.
setStripActions({
  pick: (id) => {
    if (id === "__archive") {
      archive = !archive;
      filter = null;
    } else filter = filter === id ? null : id;
    render();
  },
});

// Two tasks may carry the same text; load() numbers the repeats so a key names one card.
export const key = (c) =>
  c._k || (c.kind === "idea" ? "idea:" + c.state + ":" + c.text : "run:" + c.state + ":" + c.id);
// The tool a launch opened, and why when it is not the one asked for.
export const via = (a) => a.name + (a.note ? ". " + a.note : "");

// Edit, Abandon or Reject over the page it was asked from: a workspace never leaves for the Board.
export const formPopup = (c, mode) => react.popup({ kind: "form", mode, card: c });
// The run form as a popup over any page: Start in the new-task form and on Tasks.
export const runPopup = (c, onStart?: (p: { kind: string; agent?: string; account?: string; yolo: boolean; explore?: boolean }) => void) =>
  react.popup({ kind: "run", card: c, onStart });
// New task from the top bar, the empty board or n: the form in a dialog. Opened from another page (Tasks, a
// workspace, the side menu): always the project picker, preset to that page's project or empty so one is chosen.
// The Board keeps its own rule.
export function newTask(from?: { dir: string | null }) {
  const taskDir = from && "dir" in from ? from.dir : !store.all ? store.S.dir : null;
  if (!dispatchEvent(new CustomEvent("kz-new-task", { cancelable: true, detail: { dir: taskDir } }))) return;
  // The header button passes its click event: only an explicit { dir } is another page's call.
  const pick = from && "dir" in from ? from : null;
  react.closeNewForm();
  react.popup({ kind: "new", dir: pick?.dir ?? null, choose: !!pick });
}

export function render() {
  // All projects: only the ones ticked in the filter, or every one when none is.
  const only = store.all && store.shown.size && showable().some((p) => store.shown.has(p.dir));
  syncMode();
  const cs = store.S.cards.filter((c) => c.archived === archive && (!only || store.shown.has(c.state))),
    b = $("board");
  b.removeAttribute("aria-busy");
  // The loading skeleton goes with the first real draw.
  b.querySelectorAll(":scope > section[aria-hidden]").forEach((s) => s.remove());
  // The header's pickers: the choices ([label, folder, from the projects folder]), the project the board is on, and what shows.
  store.PL = [
    ["All projects", "all"],
    ...store.S.projects.map((p) => [p.label, p.dir]),
    ...store.S.fresh.map((p) => [p.label, p.dir, 1]),
    ["New project…", "__new"],
    ["Find projects on this PC…", "__find"],
    ["Clone from GitHub…", "__clone"],
  ];
  $("showc").hidden = !store.all;
  setProjectBar({
    rows: store.PL.map((p) => ({ label: p[0], value: p[1], fresh: !!p[2] })),
    dir: store.all || !store.S.dir ? "" : store.S.dir,
    showable: showable(),
    shown: [...store.shown],
  });
  // The page draws the cards: Runs mode, or the workspaces of Workspaces mode.
  const wsm = boardMode() === "ws";
  react.drawBoard({
    cards: cs,
    allCards: store.S.cards,
    backlogItems: store.S.backlog || [],
    now: store.S.now,
    all: store.all,
    projects: store.S.projects,
    archive,
    filter,
    query,
    only: only ? [...store.shown] : null,
    mode: wsm ? "ws" : "runs",
    ...(wsm
      ? wsBoardData((dir) => (!only || store.shown.has(dir)) && (store.all || !store.S.dir || dir === store.S.dir))
      : { ws: [], wsNames: WS_COLS }),
    colNames: COLS,
    openKey: store.openKey,
    flash: [...store.flash],
    answered: react.answered(),
    phone: isPhone(),
  });
  // The tab says how many runs wait on you, or agents wait on input, so a background tab still tells you.
  const nw = waitingCount(store.S.cards);
  document.title = nw ? `(${nw}) kaizen` : "kaizen";
  if (store.all) boardBadge(store.S.cards, [...store.S.projects, ...(store.S.rail ?? [])], store.S.agents);
  termsBadge();
}
// The header filter box lives outside #board, so a redraw keeps what is typed; draft() keeps it over a reload.
export function filterBox() {
  const el = $("bq");
  draft(el, "bq");
  query = el.value;
  el.addEventListener("input", () => {
    query = el.value;
    render();
  });
  initWsBoard(render);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      el.value = "";
      el.dispatchEvent(new Event("input"));
      el.blur();
    }
  });
}
export const focusedKey = () => document.activeElement?.closest?.("#board .card")?.dataset.k;
export const cardEl = (k) => k && $("board").querySelector('.card[data-k="' + CSS.escape(k) + '"]');
// Arrows and hjkl, as on the terminal board: up/down within a column, left/right to the
// nearest column with cards, at the same row or its last card.
export function nav(dx, dy) {
  const cols = [...$("board").querySelectorAll("section")]
    .map((s) => [...s.querySelectorAll(".card")])
    .filter((l) => l.length);
  if (!cols.length) return;
  const cur = document.activeElement.closest(".card");
  let ci = cols.findIndex((l) => l.includes(cur)),
    ri = 0;
  if (ci < 0) ci = 0;
  else {
    ri = cols[ci].indexOf(cur);
    if (dy) ri = Math.max(0, Math.min(cols[ci].length - 1, ri + dy));
    else {
      ci = Math.max(0, Math.min(cols.length - 1, ci + dx));
      ri = Math.min(ri, cols[ci].length - 1);
    }
  }
  const t = cols[ci][ri];
  t.focus({ preventScroll: true });
  t.scrollIntoView({ block: "nearest", inline: "nearest" });
}
