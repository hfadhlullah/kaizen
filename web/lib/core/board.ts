// The board's card rules without any drawing: which cards a column lists and in what order, what a card's
// button says, its chips and marks, and its menu. The Board page (pages/board-page.tsx) draws what these return;
// lib/core/board.test.ts tests them alone.
import { MARKS, NAMES, ICON, WORD, need, d as DAY } from "./labels.ts";

// One entry of /state's `cards`, or an open backlog item drawn as a card. Only the fields the board reads.
export type Card = {
  kind: "run" | "idea" | "backlog";
  state: string; // the project's .kaizen folder
  where: string;
  column: number;
  status: string;
  archived?: boolean;
  id?: string;
  text?: string;
  title?: string;
  notes?: string;
  stage?: string;
  awaiting?: string | null;
  healed?: boolean;
  moved?: number;
  added?: number;
  parent?: string;
  branch?: string;
  tags?: string[];
  workers?: { id: string; status: string; bypass: boolean }[];
  workersMerge?: string;
  land?: { kind: string; why: string };
  signal?: string;
  blocked?: { question?: string };
  pty?: { alive?: boolean; asking?: boolean; key?: string };
  git?: string;
  open?: number;
  phase?: string;
  severity?: string;
  source?: string;
  n?: number;
  at?: string;
  starting?: boolean;
  task?: {
    dir: string;
    id: string;
    revision: number;
    result?: string;
    accept?: boolean;
    question?: { text: string; options: string[] };
  };
  accept?: string;
  _k?: string;
};

// Two tasks may carry the same text; load() numbers the repeats (`_k`) so a key names one card.
export const cardKey = (c: Card) =>
  c._k || (c.kind === "idea" ? "idea:" + c.state + ":" + c.text : "run:" + c.state + ":" + c.id);

export const FOLD = 6; // a column shows this many cards, then a "more" line
export const SEVS: [string, string, (s?: string) => boolean][] = [
  ["high", "High+", (s) => s === "critical" || s === "high"],
  ["medium", "Medium", (s) => s === "medium"],
  ["low", "Low", (s) => s === "low"],
  ["none", "No severity", (s) => !s],
];
export const HINT = [
  "Add a task to start a run",
  "Tasks you run are planned here",
  "Approved plans are built here",
  "Finished builds are checked here",
];

// Open backlog items as cards for the Tasks column. A key names the line by source and number, which is what Start
// and Reject send back.
export const backlogCards = (items: any[] | undefined): Card[] =>
  (items || []).map((b) => ({
    ...b,
    kind: "backlog",
    status: b.starting ? "starting" : "idea",
    title: b.text,
    column: 0,
    archived: false,
    _k: "backlog:" + b.state + ":" + b.source + "#" + b.n,
  }));

// Cards filed by a run sit inside it while it is on the board and not done; once the parent is done, archived or
// gone, they are back in their own columns.
export const kidsOf = (cards: Card[], p: Card) =>
  p.kind === "run" ? cards.filter((c) => c.parent === p.id && c.state === p.state) : [];
export const isNested = (cards: Card[], c: Card) =>
  !!c.parent &&
  cards.some((p) => p.kind === "run" && p.id === c.parent && p.state === c.state && !p.archived && p.column !== 4);

// What opening a waiting run does, in words: the card's button and its menu say the same. One already answered from
// this page says so until the agent moves the run on.
export const actionOf = (c: Card, answered: boolean) =>
  answered
    ? "Sent to agent"
    : c.status !== "waiting"
      ? "Open"
      : c.healed
        ? "Approve"
        : (
            {
              explore: "Review exploration",
              "approvals.plan": "Review plan",
              findings: "See findings",
              "approvals.review": "Review work",
            } as Record<string, string>
          )[c.awaiting ?? ""] || "Open";

type Cut = {
  cards: Card[]; // the cards of the board being shown (archived or not, project filter applied)
  backlog: Card[];
  ci: number;
  archive: boolean;
  filter: string | null;
  query: string;
  tab: "ideas" | "backlog";
  sev: string | null;
  order: Record<string, string>;
  all: Card[]; // every card, for nesting and the sort tiebreak
};
// The cards one column lists, in order: waiting runs first, then newest or oldest (runs by their last move, tasks
// by when they were added, inbox position as the tiebreak).
export function columnCards(x: Cut): Card[] {
  const q = x.query.trim().toLowerCase(),
    bl = x.ci === 0 && !x.archive && x.tab === "backlog",
    from = bl ? x.backlog : x.cards;
  const list = from.filter(
    (c) =>
      c.column === x.ci &&
      (!bl || !x.sev || SEVS.find((s) => s[0] === x.sev)![2](c.severity)) &&
      (!x.filter || c.status === x.filter) &&
      (x.archive || !isNested(x.all, c)) &&
      (!q || `${c.title || ""} ${c.text || ""} ${c.id || ""}`.toLowerCase().includes(q)),
  );
  if (x.ci < 4 && !bl) {
    const at = (c: Card) => (c.kind === "run" ? c.moved || 0 : c.added || 0),
      old = x.order[x.ci] === "old",
      pos = (c: Card) => x.all.indexOf(c),
      w = (c: Card) => (c.status === "waiting" ? 1 : 0);
    list.sort((a, b) => w(b) - w(a) || (old ? at(a) - at(b) || pos(a) - pos(b) : at(b) - at(a) || pos(b) - pos(a)));
  }
  return list;
}
// Done cards older than `days`, for Clear.
export const olderThan = (list: Card[], now: number, days: number) =>
  list.filter((c) => now - (c.moved || now) > days * DAY);

export type Chip = { text: string; title?: string; cls?: "link" | "warn" | "proj" | ""; dot?: boolean };
export type Mark = {
  icon?: string;
  sprite?: "i" | "c";
  text?: string;
  title: string;
  cls: "" | "accent" | "ok" | "warn" | "run" | "bad" | "ask";
};
const shortId = (s: string) => s.replace(/^\d{4}-\d\d-\d\d-/, "").replace(/-/g, " ");
// The footer of a card: words on the left (project, what it needs), icon-only marks on the right.
export function chipsAndMarks(c: Card, all: boolean): { chips: Chip[]; marks: Mark[] } {
  const chips: Chip[] = [],
    marks: Mark[] = [];
  if (all) chips.push({ text: c.where.split("/").filter(Boolean).pop() || c.where, title: c.where, cls: "proj" });
  for (const t of c.tags || []) {
    if ((MARKS as any)[t])
      marks.push({
        icon: t,
        sprite: "c",
        title:
          t === "full"
            ? "Full run: separate reviewer"
            : t === "lite"
              ? "Lite run: one session"
              : (NAMES as any)[t] || t,
        cls: t === "full" || t === "lite" ? "accent" : "",
      });
    else if (t === "yolo")
      marks.push({ text: "yolo", title: "Started in Yolo: the agent runs commands without asking", cls: "warn" });
    else chips.push({ text: (NAMES as any)[t] || t });
  }
  // Orchestration: only a run that has workers carries them, so any other card is unchanged.
  const wk = c.workers || [];
  if (wk.length)
    chips.push({
      text: `${wk.length} workers`,
      title: wk.map((x) => `${x.id} ${x.status}${x.bypass ? " (bypass)" : ""}`).join(", "),
    });
  if (c.land)
    marks.push({
      text: "! " + (c.land.kind === "conflict" ? "Conflict" : "Land failed"),
      title: c.land.why,
      cls: "bad",
    });
  if (c.signal === "blocked")
    marks.push({ icon: "ask", title: `Waiting on you: ${c.blocked?.question ?? ""}`, cls: "ask" });
  else if (c.signal === "stale")
    marks.push({ text: "stale", title: "The agent has gone quiet: no report and no terminal activity", cls: "warn" });
  else if (c.signal === "unverified")
    marks.push({ text: "unverified", title: "The agent ended without finishing this stage properly", cls: "warn" });
  if (c.pty && c.pty.alive && c.pty.asking)
    marks.push({
      icon: "ask",
      title: "The agent is asking you something: open it, terminal button at the top",
      cls: "ask",
    });
  else if (c.pty && c.pty.alive)
    marks.push({ icon: "term", title: "The agent is running in this run's workspace: open it", cls: "run" });
  // A gathered task's notes open with the stamp promote() writes; its chip names the source.
  const g = c.notes && /^\[[^\]]*\] (?:Gathered from|Promoted from the icebox:) (.+?)\. Outside text/.exec(c.notes);
  // A card filed by a run names that run; the parent itself shows nothing.
  if (c.parent) chips.push({ text: shortId(c.parent), title: `Filed by ${c.parent}`, cls: "link" });
  if (c.kind === "backlog") {
    if (c.severity)
      chips.push({
        text: c.severity,
        cls: c.severity === "critical" || c.severity === "high" ? "warn" : "",
        dot: true,
      });
    chips.push(
      c.source === "orphan"
        ? { text: "orphaned", title: "Kept from a pruned run" }
        : { text: shortId(c.source || ""), title: `Left by ${c.source}${c.at ? " · " + c.at : ""}`, cls: "link" },
    );
  }
  if (c.branch) chips.push({ text: "branch", title: `Built on its own branch, ${c.branch}` });
  if (g) chips.push({ text: "gathered", title: `From ${g[1]}` });
  else if (c.notes) chips.push({ text: "notes" });
  // Information only: the panel's button is where it is committed and pushed.
  if (c.git)
    marks.push({
      icon: "git",
      sprite: "c",
      title: c.git === "pushed" ? "Committed & pushed" : "Not committed & pushed yet",
      cls: c.git === "pushed" ? "ok" : "warn",
    });
  if (c.open)
    marks.push({ icon: "bug", title: `${c.open} open finding${c.open === 1 ? "" : "s"} to fix`, cls: "warn" });
  return { chips, marks };
}

export type MenuItem = { id: string; label: string; icon: string; danger?: boolean; before?: boolean };
// The card menu: Open / Run / Archive and the rest, by what the card is.
export function menuItems(c: Card, o: { archive: boolean; answered: boolean; otherProjects: boolean }): MenuItem[] {
  const it = (id: string, label: string, icon: string, danger?: boolean, before?: boolean): MenuItem => ({
    id,
    label,
    icon,
    danger,
    before,
  });
  if (o.archive)
    return [
      it("restore", "Restore", "restore"),
      it("open", "Open", "open"),
      ...(c.kind === "idea" ? [it("delete", "Delete", "trash", true, true)] : []),
    ];
  if (c.kind === "backlog")
    return [
      it("run", c.status === "starting" ? "Run again" : "Run", "play"),
      it("open", "Open its run", "open"),
      it("reject", "Reject", "x", true, true),
    ];
  if (c.kind === "idea" && c.status === "idea")
    return [
      it("run", "Run", "play"),
      it("edit", "Edit", "pen"),
      ...(o.otherProjects ? [it("move", "Move to project", "ext")] : []),
      it("archive", "Archive", "archive"),
      it("reject", "Reject", "x", false, true),
      it("delete", "Delete", "trash", true),
    ];
  if (c.kind === "idea")
    return [
      it("open", "Open", "open"),
      it("run", "Run again", "play"),
      it("archive", "Archive", "archive"),
      it("delete", "Remove", "trash", true, true),
    ];
  return [
    it("open", actionOf(c, o.answered), "open"),
    it("archive", "Archive", "archive"),
    ...(c.column === 1 && c.status !== "abandoned" ? [it("toidea", "Back to task", "restore")] : []),
  ];
}

// The status mark a card shows, and what it says.
export const statusIcon = (c: Card) => (ICON as Record<string, string>)[c.status] || "idea";
export const statusTip = (c: Card) => (c.status === "waiting" ? need(c.awaiting) || "needs you" : c.status || "idea");
export const wordOf = (status: string) => (WORD as Record<string, string>)[status] || status;
// A card's second line: a run is its readable id.
export const runWords = (c: Card) => (c.kind === "run" ? (c.text ?? "").replace(/-/g, " ") : "");
export { shortId };
