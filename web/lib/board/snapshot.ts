// What the Board shows, worked out from what the server says (lib/server) and what filters it: the project filter, the status
// strip, the search box, the archive, Workspaces or Runs, the card that is open. `refreshBoard` is the one place it is
// computed; it runs when the poller's reaction asks (a new /state, with the card slide) and when any filter changes.
import { flushSync } from "react-dom";
import { COLS, isPhone } from "@lib/core";
import { attentionFor } from "@lib/rail";
import { cardKey, railDataNow, useServer, waitingCount, getServer } from "@lib/server";
import { cardState, RANK, projName, titleOf, wsHref, wsLabel, wsOfCard } from "@lib/rail";
import { shownSet, showable, useShown } from "@lib/project";
import { getRoute } from "@lib/router";
import { subline } from "@lib/phone";
import { getPanel, decided, usePanel } from "@lib/run";
import { getBoard, setBoard, useBoard, type WsCard } from "./board-store.ts";
import { WS_COLS, cardLine, columnOf, groupWs } from "./ws-board.ts";

export const key = cardKey;

// What Workspaces mode shows: one list of workspace cards per column (ws-board.ts places them). `inScope(dir)` is the
// board's project scope (a single project, or the Showing filter).
function wsBoardData(query: string, now: number, inScope: (dir: string) => boolean) {
  const { cards, projects } = railDataNow(),
    q = query.trim().toLowerCase();
  const cols: WsCard[][] = WS_COLS.map(() => []);
  for (const { dir, w, cs } of groupWs(cards, projects, wsOfCard)) {
    const name = projName(dir, projects);
    const { col, open, last } = columnOf(cs, dir, w.path, wsOfCard, cardState);
    // Neither the project filter nor search hides a workspace waiting on the user (In review).
    if (col !== 2 && !inScope(dir)) continue;
    if (q && col !== 2 && !`${wsLabel(w)} ${name} ${cs.map(titleOf).join(" ")}`.toLowerCase().includes(q)) continue;
    const lead = [...open].sort((x, y) => RANK[cardState(x)] - RANK[cardState(y)])[0] ?? last;
    // A task whose agent asks adds the waiting dot; its column never changes.
    const asks = cs.some((c) => c.kind === "idea" && cardState(c) === "wait");
    cols[col]!.push({
      dir,
      path: w.path,
      href: wsHref(dir, w.path),
      state: asks ? "wait" : lead ? cardState(lead) : "idle",
      label: wsLabel(w),
      main: !!w.main,
      project: name,
      line: cardLine(lead, lead ? cardState(lead) : "", lead ? subline(lead, now, attentionFor(lead)) : ""),
    });
  }
  return { ws: cols, wsNames: WS_COLS };
}

export function refreshBoard(sync = false) {
  const { state: S, all } = getServer(),
    { filter, query, archive, mode, flash, names } = getBoard(),
    shown = shownSet();
  // All projects: only the ones ticked in the filter, or every one when none is.
  const only = all && shown.size && showable(S).some((p) => shown.has(p.dir));
  const cs = S.cards.filter((c: any) => c.archived === archive && (!only || shown.has(c.state)));
  const wsm = mode === "ws";
  const set = () =>
    setBoard({
      snap: {
        cards: cs,
        allCards: S.cards,
        backlogItems: S.backlog || [],
        now: S.now,
        all,
        projects: S.projects,
        archive,
        filter,
        query,
        only: only ? [...shown] : null,
        mode: wsm ? "ws" : "runs",
        ...(wsm
          ? wsBoardData(
              query,
              S.now || Date.now(),
              (dir) => (!only || shown.has(dir)) && (all || !S.dir || dir === S.dir),
            )
          : { ws: [], wsNames: WS_COLS }),
        colNames: COLS,
        openKey: getPanel().openKey,
        flash,
        answered: [...decided],
        phone: isPhone(),
        names,
      },
    });
  // flushSync where a view transition and the focus restore read the DOM at once.
  sync ? flushSync(set) : set();
  // The tab says how many runs wait on you, or agents wait on input, so a background tab still tells you.
  const nw = waitingCount(S.cards);
  document.title = nw ? `(${nw}) kaizen` : "kaizen";
}

// The filters redraw the board by themselves; a new /state is the poller's reaction (lib/board/on-state.ts).
export function startBoard() {
  useBoard.subscribe((s, p) => {
    if (s.filter !== p.filter || s.query !== p.query || s.archive !== p.archive || s.mode !== p.mode) refreshBoard();
  });
  usePanel.subscribe((s, p) => s.openKey !== p.openKey && refreshBoard());
  useShown.subscribe((s, p) => s.shown !== p.shown && refreshBoard());
  // Fresh rail data (an all-projects read, or the sources) redraws Workspaces mode. A /state that carries the cards draws
  // them itself, so a snapshot that came with one is not news.
  useServer.subscribe((s, p) => {
    const fresh = (s.every !== p.every && s.state === p.state) || s.sources !== p.sources;
    if (fresh && getBoard().mode === "ws" && getRoute().view === "board") refreshBoard();
  });
  refreshBoard();
}
