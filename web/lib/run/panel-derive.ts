// What the run panel shows for a card, derived from the card, the /run reply and the tab asked for. No DOM, no store, no
// fetch (panel-derive.test.ts): use-panel-run.ts reads the stores, hands them in and publishes the answer.
import { ICON, WORD, brief, need, type Card } from "@lib/core";
import { attach, preview } from "@lib/markdown";
import { hitNeedle } from "./doc.ts";
import type { Finding, Head, PanelDoc } from "./panel-store.ts";

// A run's tabs, its phases in board order. A card opens on its column's tab.
export const TABS = [
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
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
// "2026-10-18-board-ui-revision" or "board-ui-revision" reads "Board UI revision".
export const readable = (t: string) =>
  /\s/.test(t)
    ? t
    : cap(
        t
          .replace(/^\d{4}-\d{2}-\d{2}-/, "")
          .split(/[-_]/)
          .map((w) => (/^(ui|ux|api|cli|ai|ci|id|url|pr|tui|ios|pwa)$/i.test(w) ? w.toUpperCase() : w))
          .join(" "),
      );
// The panel's header text for a card, and its tooltip (a run's id).
export const titleOf = (c: any) => (c.kind === "idea" ? brief(c.text).head : readable(c.title || c.text));
export const tipOf = (c: any) => (c.kind === "idea" ? "" : c.id || "");
// The tab a card opens on when nothing asked for one: its column's.
export const defaultTab = (c: any) =>
  c.stage === "explore" ? "explore" : c.status === "abandoned" ? "plan" : ({ 1: "plan", 2: "backlog", 3: "review", 4: "preview" } as Record<number, string>)[c.column] || "request";

// The header's Plan > Build > Review > Done bar: steps before the card's column are done, its own is ringed in the run's
// status colour (waiting amber, stalled red), the rest wait.
const STEPS = ["Plan", "Build", "Review", "Done"];
const state = (runDoc: any) => {
  try {
    return JSON.parse(runDoc?.state || "{}");
  } catch {
    return {};
  }
};
const names = (c: any, runDoc: any) => {
  const st = state(runDoc);
  return c.stage === "explore" || st.explore_status === "completed" || st.explore_status === "active" ? ["Explore", ...STEPS] : STEPS;
};
const tip = (c: any) => cap(WORD[c.status] || c.status) + (c.awaiting ? `: ${need(c.awaiting)}` : "");
export function stepsHead(c: any, runDoc: any): Head {
  const ns = names(c, runDoc),
    offset = ns.length - 4,
    at = c.status === "done" ? ns.length : c.stage === "explore" ? 0 : Math.max(0, (c.column || 0) - 1) + offset;
  return { kind: "steps", phases: { names: ns, at, status: c.status, tip: tip(c) } };
}
// The run workspace's header: the project beside the picker (runner, agent, mode in its tooltip), then the stage the run is
// in as one word and a bar that slides to it.
function metaHead(c: any, runDoc: any): Head {
  const st = state(runDoc),
    ns = names(c, runDoc),
    offset = ns.length - 4,
    at = c.status === "done" ? ns.length - 1 : c.stage === "explore" ? 0 : Math.min(3, Math.max(0, (c.column || 1) - 1)) + offset;
  return {
    kind: "meta",
    id: c.id,
    proj: String(c.where || "").split(/[\\/]/).filter(Boolean).pop() || "",
    runner: [st.runner, st.agent, st.mode].filter(Boolean).join(", "),
    word: ns[at] + (c.status === "waiting" ? ", needs you" : c.status === "stalled" ? ", stalled" : ""),
    w: c.status === "done" ? 100 : ((at + 0.5) / ns.length) * 100,
    status: c.status,
    tip: tip(c),
  };
}

// A task's panel: its header and decision footer; the body is its terminal or its notes (use-panel-run.ts).
export const taskPanel = (c: Card) => ({
  head: (c.status === "starting" && !c.archived ? stepsHead(c, null) : { kind: "task", where: c.where.split(/[\\/]/).pop() || c.where }) as Head,
  footer: { card: c, plan: "", sourceControl: false },
});

export type RunIn = {
  card: any;
  runDoc: any;
  wantTab: string;
  view: string; // the route's view: the run workspace shows Preview as a centre tab, so the panel never does
  wide: boolean; // the run view, or a window over 640 px
  git: { shown: boolean; pending: boolean };
  hit: { type: string; n: number; k: string } | null; // a link's item to scroll to and mark
  refresh: boolean; // a redraw of what is up: a link's item marks only on the draw an open asked for
  key: (c: any) => string;
};
export type RunDraw = {
  head: Head;
  tabs: { k: string; label: string }[];
  tab: string; // the tab drawn: the one asked for, or the latest one the run has
  kind: "doc" | "notes" | "git";
  doc: PanelDoc | null;
  notes: { card: any; src: string | undefined; ro: boolean; linked?: string[] } | null;
  fix: { card: any; findings: Finding[] } | null;
  footer: { card: any; plan: string; sourceControl: boolean };
  needle: string | null; // the line the link named, null when the run has no such item
};
export function deriveRun(i: RunIn): RunDraw {
  const { card: c, runDoc: d } = i;
  // The board's own status mark, then what it waits on: chips, not a dotted line.
  const head: Head =
    c.status === "abandoned"
      ? { kind: "chips", mark: ICON[c.status] || "idea", label: cap(WORD[c.status] || c.status), awaiting: c.awaiting ? cap(need(c.awaiting)) : undefined, parent: c.parent }
      : i.wide
        ? metaHead(c, d)
        : stepsHead(c, d);
  // Only tabs with something in them show.
  const tabs = TABS.filter(
    (t) =>
      t[1] === "request" ||
      t[1] === "notes" ||
      (t[1] === "git" ? i.git.shown : t[1] === "preview" ? preview(d.impl) : d[t[1]] || (t[1] === "backlog" && c.column === 2 && d.progress)),
  );
  let k = i.wantTab;
  if (i.view === "run" && k === "preview") k = "review";
  // A tab not written yet falls back to the latest one that is.
  if (!tabs.some((t) => t[1] === k)) k = [...tabs].reverse().find((t) => t[1] !== "notes" && t[1] !== "git" && !(i.view === "run" && t[1] === "preview"))![1];
  const doc = k === "preview" ? preview(d.impl) && attach(preview(d.impl), c) : d[k];
  const needle = i.hit && i.hit.k === i.key(c) ? hitNeedle(d, i.hit) : null;
  const fs: Finding[] = d.findings || [];
  const fix =
    k === "review" && !c.healed && !c.archived && fs.some((f) => !f.done) && (c.status === "done" || c.awaiting === "findings" || c.awaiting === "approvals.review")
      ? { card: c, findings: fs }
      : null;
  return {
    head,
    tabs: tabs.map((t) => ({ k: t[1], label: t[0] })),
    tab: k,
    kind: k === "notes" ? "notes" : k === "git" ? "git" : "doc",
    doc:
      k === "notes" || k === "git"
        ? null
        : { k, id: c.id, text: doc || null, progress: k === "backlog" && c.column === 2 ? d.progress || null : null, needle: needle && !i.refresh ? needle : null, mark: 0 },
    notes: k === "notes" ? { card: c, src: doc, ro: !!c.archived || c.status === "done" || c.status === "abandoned", linked: d.linkedFrom } : null,
    fix,
    footer: { card: c, plan: d.plan, sourceControl: k !== "git" && i.git.pending },
    needle,
  };
}
