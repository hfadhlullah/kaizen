// The workspace centre's logic without the DOM, so it is tested alone (ws-tabs.test.ts):
// which runs the panel's picker lists, which are History, how stage terminals are named, and
// how the old per-run tab layouts move to their workspace, and the sidebar card's agent chips and rows.
// A screen's layout is a tmux-style tree: a leaf is an item id; a split holds two or more
// children side by side ("cols") or stacked ("rows"), with their relative sizes.
import { html } from "./dom.ts";
import { age } from "./labels.ts";
export type Node = string | { dir: "cols" | "rows"; kids: Node[]; sizes: number[] };
export const leaves = (n: Node): string[] => (typeof n === "string" ? [n] : n.kids.flatMap(leaves));
// Drops ids no longer open; a split left with one child becomes that child.
export function prune(n: Node, keep: (id: string) => boolean): Node | null {
  if (typeof n === "string") return keep(n) ? n : null;
  const kids: Node[] = [],
    sizes: number[] = [];
  n.kids.forEach((k, i) => {
    const p = prune(k, keep);
    if (p) (kids.push(p), sizes.push(n.sizes[i] ?? 1));
  });
  if (!kids.length) return null;
  if (kids.length === 1) return kids[0];
  // Nothing dropped: the same node, so a drag holding it keeps writing to the live layout.
  return kids.length === n.kids.length && kids.every((k, i) => k === n.kids[i]) ? n : { dir: n.dir, kids, sizes };
}

// A workspace's key in the saved tab layouts (localStorage kz-runtabs).
export const wsKey = (dir: string, ws: string) => `ws:${dir}:${ws}`;
// A done, approved run whose commit or push is still to do (the card's git mark): it stays in the picker.
export const gitDue = (c) => c.kind === "run" && c.status === "done" && c.accept !== "needs" && !c.archived && c.git === "pending";
export const dueWord = (c) => (c.gitDue === "push" ? "push" : "commit");
// A run that is over: abandoned, or done and neither waiting on an approval nor on its commit. It is History.
export const finished = (c) => c.kind === "run" && (c.status === "abandoned" || (c.status === "done" && c.accept !== "needs" && !gitDue(c)));
const here = (c, dir: string, ws: string, wsOfCard) => c.state === dir && wsOfCard(c) === ws;
// The cards whose agent terminals get tabs in a workspace: runs not over, and ideas whose agent is open.
export const liveIn = (cards: any[], dir: string, ws: string, wsOfCard) =>
  cards.filter((c) => !c.archived && here(c, dir, ws, wsOfCard) && (c.kind === "idea" ? !!c.pty : c.kind === "run" && !finished(c)));
// History: the workspace's finished runs, newest first.
export const historyOf = (cards: any[], dir: string, ws: string, wsOfCard) =>
  cards.filter((c) => finished(c) && here(c, dir, ws, wsOfCard)).sort((a, b) => (b.moved ?? 0) - (a.moved ?? 0));

type Saved = { tabs: any[]; hidden: string[]; screens: { id: string; tree: Node; focus: string }[]; on: string | null };
// Moves each card's old saved layout (keyed by the card) to its workspace's key. A key no
// card on the board owns is left as it is. Returns whether anything moved.
export function migrate(all: Record<string, Saved>, cards: any[], keyOf: (c) => string, wsOfCard): boolean {
  let moved = false;
  for (const c of cards) {
    const old = keyOf(c),
      from = all[old];
    if (!from) continue;
    const to = (all[wsKey(c.state, wsOfCard(c))] ||= { tabs: [], hidden: [], screens: [], on: null });
    const placed = new Set(to.screens.flatMap((s) => leaves(s.tree)));
    for (const t of from.tabs ?? []) if (!to.tabs.some((x) => x.id === t.id)) to.tabs.push(t);
    for (const h of from.hidden ?? []) if (!to.hidden.includes(h)) to.hidden.push(h);
    // An item sits in one screen only: a leaf the workspace already shows is dropped here.
    for (const s of from.screens ?? []) {
      const tree = s.tree && prune(s.tree, (id) => !placed.has(id));
      if (!tree) continue;
      leaves(tree).forEach((id) => placed.add(id));
      to.screens.push({ ...s, tree, focus: leaves(tree).includes(s.focus) ? s.focus : leaves(tree)[0] });
    }
    to.on ??= from.on;
    delete all[old];
    moved = true;
  }
  return moved;
}

// A run that waits on the user (an approval, a question, a done run to accept).
export const awaiting = (c) => c.kind === "run" && (c.status === "waiting" || (c.status === "done" && c.accept === "needs") || gitDue(c) || !!(c.pty?.alive && c.pty.asking));
// The panel's picker: the workspace's runs not over (waiting on you first, then the newest), as the
// sidebar count shows them.
export const pickable = (cards: any[], dir: string, ws: string, wsOfCard) =>
  liveIn(cards, dir, ws, wsOfCard)
    .filter((c) => c.kind === "run")
    .sort((a, b) => +awaiting(b) - +awaiting(a) || (b.moved ?? 0) - (a.moved ?? 0));
// The run the panel shows: the one picked while it is still pickable or History, else the first
// waiting/newest, else none.
export const chosen = (live: any[], hist: any[], picked?: string | null, keyOf: (c) => string = (c) => c.id) =>
  [...live, ...hist].find((c) => keyOf(c) === picked) ?? live[0] ?? null;
// A run the picker lists that this visit has not seen yet: it was just created.
export const newRun = (live: any[], seen: Set<string>, keyOf: (c) => string = (c) => c.id) => live.find((c) => !seen.has(keyOf(c)));

// The terminal the board launched for each stage of a run: plan/impl/review sub-tab -> pty key.
// plan, impl and review are recorded when the board launches them (the idea's agent once its run
// exists, /decide, /fix). A plan that was not recorded falls back to the session no stage claims,
// and only until a later stage has been launched.
export function stageKeys(c): Record<string, string> {
  if (c?.kind !== "run") return {};
  const all: string[] = c?.pty?.all ?? [],
    st = c?.pty?.stages ?? {},
    out: Record<string, string> = {};
  for (const s of ["impl", "review"]) if (st[s] && all.includes(st[s])) out[s] = st[s];
  if (st.plan && all.includes(st.plan)) out.plan = st.plan;
  // Fallback for a terminal the board did not record (a run it did not start): the lone unclaimed agent
  // is named by the run's current stage (column 1 plan, 2 build, 3 review); at any other point it stays plain.
  const first = all.find((k) => !Object.values(st).includes(k)),
    now = { 1: "plan", 2: "impl", 3: "review" }[c.column as number];
  if (first && now && !Object.keys(st).length) out[now] = first;
  return out;
}

// A run's terminals as centre tabs: those a stage claimed are named "Plan · Claude", "Build · Claude",
// "Review · Claude"; the rest keep the agent's name, numbered when there are several.
export function stageTabs(c, agent: string): { key: string; title: string }[] {
  const word = { plan: "Plan", impl: "Build", review: "Review" },
    all: string[] = c?.pty ? c.pty.all ?? [c.pty.key] : [],
    by = new Map(Object.entries(stageKeys(c)).map(([s, k]) => [k, word[s]])),
    free = all.filter((k) => !by.has(k)),
    now = word[{ 1: "plan", 2: "impl", 3: "review" }[c?.column as number] ?? ""],
    last = all.at(-1);
  // One terminal can carry several stages: the newest staged one is named for where the run is now.
  if (now && last && by.has(last)) by.set(last, now);
  return all.map((key) => ({ key, title: by.has(key) ? `${by.get(key)} · ${agent}` : agent + (free.length > 1 ? " " + (free.indexOf(key) + 1) : "") }));
}

// A run at review or done: its localhost Preview may open the Browser.
export const reviewing = (c) => c.kind === "run" && (c.column === 3 || c.status === "done");
// The first localhost address in a run's ## Preview.
export const loopbackUrl = (pv?: string | null) => (pv ? /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?[^\s)`'"<>]*/.exec(pv)?.[0] : undefined);
// Runs that moved into review or done since the last tick (`was` = the keys reviewing then) and have not
// yet opened the Browser: once per run id (`seen`).
export const toOpen = (cards: any[], was: Set<string>, seen: string[], keyOf: (c) => string) => cards.filter((c) => reviewing(c) && !was.has(keyOf(c)) && !seen.includes(keyOf(c)));

// ---- the sidebar card's agents (/state `agents`, one entry per open agent terminal)
export type Agent = { key: string; dir: string; ws?: string; agent?: string; name: string; run?: string; asking: boolean; busy: boolean; last?: string; at?: number; born?: number };
export type Status = "asking" | "working" | "done";
// Output flickers: entering "working" is immediate, leaving it for "done" waits this long after the last busy tick.
export const SETTLE_MS = 3000;
const seenBusy = new Map<string, number>(); // pty key + start time -> when it was last seen busy
const id = (a: Agent) => a.key + "@" + (a.born ?? 0); // a restarted pty under the same key is a new agent
const ORDER: Record<Status, number> = { asking: 0, working: 1, done: 2 };
const WORD: Record<Status, string> = { asking: "Asking", working: "Working", done: "Done" };
const DOT: Record<Status, string> = { asking: "wait", working: "build", done: "done" }; // the .si icons
// asking comes first and is immediate both ways (the server already waits for the screen to settle).
export function agentStatus(a: Agent, now: number, seen = seenBusy): Status {
  if (a.asking) return "asking";
  if (a.busy) return (seen.set(id(a), now), "working");
  return now - (seen.get(id(a)) ?? -Infinity) < SETTLE_MS ? "working" : "done";
}
// Milliseconds until an agent now held at "working" may turn "done" (to redraw then); Infinity when none is.
export const settleIn = (as: Agent[], now: number, seen = seenBusy) =>
  Math.min(Infinity, ...as.filter((a) => !a.asking && !a.busy && seen.has(id(a))).map((a) => SETTLE_MS - (now - seen.get(id(a))!)).filter((x) => x > 0));
// Forgets agents that are gone, so the memory stays as small as the open agents.
export const forgetAgents = (as: Agent[], seen = seenBusy) => { const live = new Set(as.map(id)); for (const k of seen.keys()) if (!live.has(k)) seen.delete(k); };
export type ARow = { a: Agent; st: Status };
// The agents of one workspace (the card's `ws` resolved as the rows resolve it), asking first, then working, then done.
export const wsAgents = (as: Agent[], dir: string, ws: string, wsOf, now: number, seen = seenBusy): ARow[] =>
  as.filter((a) => a.dir === dir && wsOf({ state: a.dir, ws: a.ws }) === ws)
    .map((a) => ({ a, st: agentStatus(a, now, seen) }))
    .sort((x, y) => ORDER[x.st] - ORDER[y.st]);
// An expanded card's row text: the agent's latest output line, else the status and the agent.
export const lineOf = ({ a, st }: ARow) => a.last || `${WORD[st]} - ${a.name}`;
const ago = (t: number | undefined, now: number) => (!t ? "" : now - t < 60e3 ? "now" : age(t, now));
// Expanded cards, remembered per workspace (localStorage kz-wsopen): the map of dir\0ws to true.
export const openKey = (dir: string, ws: string) => dir + "\0" + ws;
export function toggleOpen(m: Record<string, true>, dir: string, ws: string) {
  const k = openKey(dir, ws);
  if (m[k]) delete m[k];
  else m[k] = true;
  return m;
}
const SPRITE = ["claude", "codex", "gemini"];
const mark = (a: Agent) => html`<svg aria-hidden="true"><use href="#i-${SPRITE.includes(a.agent ?? "") ? a.agent : "ai"}"/></svg>`;
const dot = (st: Status) => html`<i class="si ${DOT[st]}"></i>`;
const CHEV = html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// Line 3 of a workspace card. Every string goes through `html`, which escapes: the typed line and the agent's own
// output are untrusted text. data-term opens that agent's terminal; data-wopen only toggles the list.
export function agentsHtml(rows: ARow[], now: number, open: boolean, dir: string, ws: string) {
  if (!rows.length) return "";
  const at = html`data-dir="${dir}" data-ws="${ws}"`;
  if (rows.length === 1) {
    const r = rows[0];
    return html`<div class="wag"><button type="button" class="aone" data-term="${r.a.key}" ${at} title="${r.a.name}: open its terminal">${dot(r.st)}${mark(r.a)}<span class="atx">${WORD[r.st]} - ${r.a.name}</span><small>${ago(r.a.at, now)}</small></button></div>`;
  }
  const chev = html`<button type="button" class="wchev${open ? " on" : ""}" data-wopen ${at} aria-expanded="${String(open)}" aria-label="${String(rows.length)} agents: ${open ? "hide" : "show"} the list">${CHEV}</button>`;
  if (open)
    return html`<div class="wag"><span class="aht">${String(rows.length)} agents</span>${chev}</div><div class="alist">${rows.map((r) => html`<button type="button" class="arow" data-term="${r.a.key}" ${at} title="${lineOf(r)}">${dot(r.st)}${mark(r.a)}<span class="atx">${lineOf(r)}</span><small>${ago(r.a.at, now)}</small></button>`)}</div>`;
  const chips = (["asking", "working", "done"] as Status[]).map((st) => ({ st, rs: rows.filter((r) => r.st === st) })).filter((g) => g.rs.length);
  return html`<div class="wag"><span class="chips">${chips.map((g) => html`<span class="chip">${dot(g.st)}${g.rs.map((r) => html`<button type="button" class="amark" data-term="${r.a.key}" ${at} title="${r.a.name} - ${WORD[g.st]}: open its terminal" aria-label="${r.a.name} - ${WORD[g.st]}: open its terminal">${mark(r.a)}</button>`)}</span>`)}</span>${chev}</div>`;
}

/** A branch name from plain words; empty when nothing usable is left (the caller picks a name). */
export function branchSlug(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9/._-]+/g, "-").replace(/\.{2,}/g, ".").replace(/\/{2,}/g, "/").replace(/(^|\/)[-.]+/g, "$1").slice(0, 60).replace(/[-./]+(\/|$)/g, "$1").replace(/\/$/, "").replace(/\.lock(\/|$)/g, "-lock$1");
}
