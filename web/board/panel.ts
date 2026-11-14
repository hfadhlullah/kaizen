import { store } from "./store.ts";
import { showTerm, termStop } from "./agent-term.ts";
import { load, post } from "./api.ts";
import { cardEl, key, render } from "./cards.ts";
import { stopDictation } from "@lib/dictation";
import { $ } from "./dom.ts";
import { gitLeave, gitPending, gitShown, gitTab } from "./git.ts";
import { ICON, WORD, need } from "@lib/core";
import { attach, brief, preview } from "./markdown.ts";
import { toast } from "./toast.ts";
import { curView } from "./views.ts";
import { isPhone } from "@lib/core";
import { openWorkspace } from "./run-view.ts";
import { hitNeedle, setPanel, type Head, type Panel, type PanelDoc } from "@lib/run";
import { setNotes, type NotesView } from "@lib/notes";
import { flushSync } from "react-dom";

// ---- detail panel
// What the React panel draws, one call each. flushSync where a view transition or the focus restore reads the DOM at once.
const drawFooter = (footer: Panel["footer"]) => flushSync(() => setPanel({ footer }));
const drawDoc = (doc: PanelDoc) => {
  flushSync(() => setPanel({ body: "doc", doc }));
  $("pbody").scrollTop = 0;
};
const drawNotes = (view: NotesView) => {
  flushSync(() => {
    setPanel({ body: "notes" });
    setNotes({ view });
  });
  $("pbody").scrollTop = 0;
};
// A run's tabs, its phases in board order. A card opens on its column's tab.
const TABS = [
  ["Request", "request"],
  ["Notes", "notes"],
  ["Explore", "explore"],
  ["Plan", "plan"],
  ["Backlog", "backlog"],
  ["Work", "impl"],
  ["Review", "review"],
  ["Source control", "git"],
  ["Preview", "preview"],
];
// keepTab: a link already chose the tab.
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// "2026-10-18-board-ui-revision" or "board-ui-revision" reads "Board UI revision".
const readable = (t) =>
  /\s/.test(t)
    ? t
    : cap(
        t
          .replace(/^\d{4}-\d{2}-\d{2}-/, "")
          .split(/[-_]/)
          .map((w) => (/^(ui|ux|api|cli|ai|ci|id|url|pr|tui|ios|pwa)$/i.test(w) ? w.toUpperCase() : w))
          .join(" "),
      );
// Set while a card waits for its workspace to mount this panel: the tab it asked for survives.
let keepNext = false;
export function open(c, keepTab) {
  // A run is worked on in its workspace, which docks this panel; so is everything on a phone.
  // Tasks keep the panel on the Board and Tasks pages. An archived run has no workspace row: it stays here to be restored.
  const here = curView() === "board" || curView() === "tasks";
  if (curView() !== "run" && (isPhone() || !here || (c.kind === "run" && !c.archived))) {
    keepNext = !!keepTab;
    return void openWorkspace(c);
  }
  keepTab ||= keepNext;
  keepNext = false;
  stopDictation(true); // the panel body is about to be replaced
  setPanel({ off: [] });
  gitLeave();
  store.openKey = key(c);
  $("panel").classList.add("open");
  $("scrim").classList.add("on");
  // A run is titled as its card is, its slug made readable; the id stays in the tooltip.
  $("ptitle").textContent = c.kind === "idea" ? brief(c.text).head : readable(c.title || c.text);
  $("ptitle").title = c.kind === "idea" ? "" : c.id || "";
  render();
  $("pterm").hidden = true;
  if (c.kind === "idea") {
    store.runDoc = null;
    store.ptabs = [];
    setPanel({
      head: c.status === "starting" && !c.archived ? steps(c) : { kind: "task", where: c.where.split(/[\\/]/).pop() || c.where },
      tabs: [],
      tab: "",
    });
    taskBody(c);
    // The footer (Run, Edit, Reject, Archive, Delete, Restore) is the shared decision strip.
    drawFooter({ card: c, plan: "", sourceControl: false });
    return;
  }
  if (!keepTab)
    store.lastTab = store.tab =
      c.stage === "explore" ? "explore" : c.status === "abandoned" ? "plan" : { 1: "plan", 2: "backlog", 3: "review", 4: "preview" }[c.column] || "request";
  return openRun(c, false);
}
// The header's Plan → Build → Review → Done bar: steps before the card's column are done,
// its own is ringed in the run's status colour (waiting amber, stalled red), the rest wait.
const STEPS = ["Plan", "Build", "Review", "Done"];
function runSteps(c) {
  let st: any = {};
  try { st = JSON.parse(store.runDoc?.state || "{}"); } catch {}
  return c.stage === "explore" || st.explore_status === "completed" || st.explore_status === "active" ? ["Explore", ...STEPS] : STEPS;
}
function steps(c): Head {
  const names = runSteps(c),
    offset = names.length - 4,
    at = c.status === "done" ? names.length : c.stage === "explore" ? 0 : Math.max(0, (c.column || 0) - 1) + offset;
  return { kind: "steps", phases: { names, at, status: c.status, tip: tip(c) } };
}
const tip = (c) => cap(WORD[c.status] || c.status) + (c.awaiting ? `: ${need(c.awaiting)}` : "");
// The run workspace's header: the project beside the picker (runner, agent, mode in its tooltip), then the stage the
// run is in as one word and a bar that slides to it (components/run/panel-head.tsx draws both).
function meta(c): Head {
  let st: any = {};
  try {
    st = JSON.parse(store.runDoc?.state || "{}");
  } catch {}
  const names = runSteps(c),
    offset = names.length - 4;
  const at = c.status === "done" ? names.length - 1 : c.stage === "explore" ? 0 : Math.min(3, Math.max(0, (c.column || 1) - 1)) + offset;
  return {
    kind: "meta",
    id: c.id,
    proj: String(c.where || "").split(/[\\/]/).filter(Boolean).pop() || "",
    runner: [st.runner, st.agent, st.mode].filter(Boolean).join(", "),
    word: names[at] + (c.status === "waiting" ? ", needs you" : c.status === "stalled" ? ", stalled" : ""),
    w: c.status === "done" ? 100 : ((at + 0.5) / names.length) * 100,
    status: c.status,
    tip: tip(c),
  };
}
// A task's panel: its terminal while the run it started is being born there, else its notes.
export function taskBody(c) {
  // In the run workspace the agent is a centre tab; on the Tasks page a task shows its notes only.
  if (c.pty && curView() !== "run" && curView() !== "tasks") showTerm(c);
  else {
    termStop();
    drawNotes({ card: c, src: c.notes, ro: c.archived || c.status !== "idea" });
  }
}
// The Fix findings form: under the review tab's document (components/run/doc-body.tsx draws it from this).
// Nothing for an archived run, one with no open finding, or one that is not waiting on or past its review.
function drawFix(c) {
  const fs = store.runDoc.findings || [];
  if (c.archived || !fs.some((f) => !f.done) || !(c.status === "done" || c.awaiting === "findings" || c.awaiting === "approvals.review"))
    return setPanel({ fix: null });
  setPanel({ fix: { card: c, findings: fs } });
}
export async function openRun(c, refresh, again) {
  if (!refresh || !store.runDoc || store.runDoc.id !== c.id || again) {
    const d = await fetch(`/run/${encodeURIComponent(c.id)}?dir=${encodeURIComponent(c.state)}`).then((r) => r.json());
    // Another card opened while this was fetched: its doc would redraw that card as this run.
    if (store.openKey !== key(c)) return;
    store.runDoc = d;
  }
  if (store.openKey !== key(c)) return;
  // The fetch above may have finished after a newer /state: draw the card as it is now
  // (a resumed agent's terminal, not the one that ended).
  c = store.S.cards.find((x) => key(x) === store.openKey) || c;
  // A refresh while notes are being typed would wipe the textarea.
  // The textarea is hidden under the rich editor: focus anywhere in the notes counts.
  if (refresh && $("pbody").querySelector(".notes")?.contains(document.activeElement)) return;
  // The board's own status mark, then what it waits on: chips, not a dotted line.
  const head: Head =
    c.status === "abandoned"
      ? { kind: "chips", mark: ICON[c.status] || "idea", label: cap(WORD[c.status] || c.status), awaiting: c.awaiting ? cap(need(c.awaiting)) : undefined, parent: c.parent }
      : curView() === "run" || innerWidth > 640
        ? meta(c)
        : steps(c);
  // Only tabs with something in them show. A card whose agent runs in the board gets its
  // terminal behind the header's terminal button, chosen once right after a launch from here.
  const tabs = TABS.filter(
    (t) =>
      t[1] === "request" ||
      t[1] === "notes" ||
      (t[1] === "git"
        ? gitShown(c)
        : t[1] === "preview"
          ? preview(store.runDoc.impl)
          : store.runDoc[t[1]] || (t[1] === "backlog" && c.column === 2 && store.runDoc.progress)),
  );
  if (store.wantTerm === key(c)) store.wantTerm = null;
  // The agent is a centre tab of the run workspace only: the panel never shows a terminal.
  if (store.tab === "term") store.tab = store.lastTab;
  // In the run workspace Preview is a centre tab, so the panel never shows it.
  if (curView() === "run" && store.tab === "preview") store.tab = "review";
  // A tab not written yet falls back to the latest one that is.
  if (store.tab !== "term" && !tabs.some((t) => t[1] === store.tab))
    store.tab = [...tabs].reverse().find((t) => t[1] !== "notes" && t[1] !== "git" && !(curView() === "run" && t[1] === "preview"))[1];
  if (store.tab !== "term") store.lastTab = store.tab;
  $("panel").classList.toggle("wide", store.tab === "term");
  const pt = $("pterm");
  pt.hidden = true;
  pt.classList.toggle("on", store.tab === "term");
  pt.setAttribute("aria-pressed", store.tab === "term");
  pt.title = pt.ariaLabel = store.tab === "term" ? "Close terminal" : "Terminal";
  pt.onclick = () => {
    store.tab = store.tab === "term" ? store.lastTab : "term";
    openRun(c, true);
  };
  store.ptabs = tabs.map((t) => t[1]).concat(pt.hidden ? [] : ["term"]);
  setPanel({
    head,
    tabs: tabs.map((t) => ({ k: t[1], label: t[0] })),
    tab: store.tab,
    pickTab: (k) => {
      // In the run workspace Preview is a centre tab, not a panel tab.
      if (curView() === "run" && k === "preview") return void dispatchEvent(new Event("kz-run-preview"));
      $("panel").classList.remove("pn");
      store.tab = k;
      openRun(c, true);
    },
  });
  const k = store.tab,
    doc = k === "preview" ? preview(store.runDoc.impl) && attach(preview(store.runDoc.impl), c) : store.runDoc[k];
  // A link to a finding or backlog item names a line of the document, found by its text (the lines carry no numbers).
  const needle = hit && hit.k === key(c) ? hitNeedle(store.runDoc, hit) : null;
  if (k !== "term") termStop();
  if (k !== "git") gitLeave();
  if (k === "term") showTerm(c);
  else if (k === "notes") {
    const ro = c.archived || c.status === "done" || c.status === "abandoned";
    drawNotes({ card: c, src: doc, ro, linked: store.runDoc.linkedFrom });
  } else if (k === "git") gitTab(c);
  else
    drawDoc({
      k,
      id: c.id,
      text: doc || null,
      progress: k === "backlog" && c.column === 2 ? store.runDoc.progress || null : null,
      needle: needle && !refresh ? needle : null,
      mark: needle && !refresh ? ++markN : 0,
    });
  if (k === "review" && !c.healed) drawFix(c);
  else setPanel({ fix: null });
  // Only the panel the link asked for: another card opened meanwhile drops the request.
  if (hit && !refresh) {
    if (hit.k === key(c) && !needle) toast("That item is not in this run");
    hit = null;
  }
  // The footer is the shared decision strip; a form open in it keeps its text through every refresh.
  drawFooter({ card: c, plan: store.runDoc.plan, sourceControl: k !== "git" && gitPending(c) });
}
// A link from a note (?run= or ?idea=, with dir, tab, item) opens that card's panel;
// a finding or backlog item named is scrolled to and marked. Found by its text, since
// the rendered list does not carry the numbers.
let hit = null;
let markN = 0; // each request to mark a line is a new number, so the document marks it once
export function deep() {
  const p = new URLSearchParams(location.search),
    d = p.get("dir"),
    id = p.get("run"),
    task = p.get("idea");
  // A workspace address (?view=run&idea=) is the run view's own, not a note's deep link.
  if ((!id && task === null) || p.get("view") === "run") return;
  history.replaceState(null, "", location.pathname + "?all=1");
  const c = store.S.cards.find(
    (x) => x.state === d && (id ? x.kind === "run" && x.id === id : x.kind === "idea" && x.text === task),
  );
  if (!c) {
    toast(id ? "That run was not found" : "That task was not found");
    return;
  }
  const m = /^(finding|backlog)-(\d+)$/.exec(p.get("item") || "");
  // An item's tab is its own when the link does not name one.
  const n = p.get("tab") || (m ? (m[1] === "finding" ? "review" : "backlog") : ""),
    t = TABS.find((x) => x[1] === (n === "work" ? "impl" : n));
  if (t) store.tab = t[1];
  hit = m ? { type: m[1], n: +m[2], k: key(c) } : null;
  open(c, !!t);
}
// A run's panel on the tab of one of its items, that item scrolled to and marked.
export function openAt(c, type, n) {
  store.tab = type === "finding" ? "review" : "backlog";
  hit = { type, n, k: key(c) };
  open(c, true);
}
export function close() {
  if (curView() !== "board" && curView() !== "run" && curView() !== "tasks") return;
  const k = store.openKey;
  stopDictation(true);
  termStop();
  gitLeave();
  store.openKey = null;
  store.runDoc = null;
  $("panel").classList.remove("open");
  $("scrim").classList.remove("on");
  render();
  if (k) cardEl(k)?.focus({ preventScroll: true });
}

export function initPanel() {
  // Answering an approval from the panel opens your agent on the run, told the decision and,
  // for a revise, the comment. Answered approvals are remembered outside the footer, which
  // every refresh rebuilds, so a second press cannot open a second agent. Keyed by when the
  // run last moved: the same approval reached again after a revise is a new question.
  // The footer's More menu is a <details>: close it on a click anywhere else.
  document.addEventListener("click", (e) => {
    for (const d of document.querySelectorAll(".more[open]")) if (!d.contains(e.target)) d.open = false;
  });
  // The panel's header parts and body are React (pages/board/panel.tsx over lib/run/panel-store.ts).
  $("pclose").onclick = close;
  $("scrim").onclick = close;
}
