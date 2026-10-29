// The workspace centre (?view=ws&dir=&ws=; a run's or idea's old address resolves to its
// workspace and selects its tab): a tab bar over one folder. Each live run there is a tab
// holding the run panel (panel.ts draws it into #panel, moved in here) under Plan · Build ·
// Review; beside them the agents, shells started with POST /shell {ws}, the project's
// localhost, the Preview, project notes and History (finished runs, read-only). A workspace
// with no tab opens the default agent in its folder. Terminal tabs are kzTerm mounts on /pty
// that live as long as their tab, so a tab switch or a /state tick never reconnects them.
// Split right or down shows a second tab beside the first, sized with the Terminal page's handles.
import { pick } from "./projects.ts";
import { store } from "./store.ts";
import { toast } from "./toast.ts";
import { $, html, ico, raw } from "./dom.ts";
import { key } from "./cards.ts";
import { open, openRun } from "./panel.ts";
import { termLoad } from "./agent-term.ts";
import { load, post } from "./api.ts";
import { attach, md, preview } from "./markdown.ts";
import { layout } from "./terms.ts";
import { cardHref, markCurrent, railData, stateOf, titleOf, wsOfCard } from "./workspace.ts";
import { type Node, awaiting, finished, hiddenRuns, historyOf, leaves, liveIn, migrate, prune, stageKeys, wsKey } from "./ws-tabs.ts";
import { age } from "./labels.ts";
import { go } from "./views.ts";

// "run" holds a card's panel (ck = the card's key; ro = a finished run, read-only).
type Tab = { id: string; kind: "agent" | "shell" | "local" | "preview" | "note" | "wait" | "run" | "history"; title: string; key?: string; note?: string; agent?: string; ck?: string; ro?: boolean };
// Per workspace: the extra items opened (localhost, preview, notes, History, a finished run),
// tabs closed, and the screens. A screen is one tab of the bar: one or more items side by
// side or stacked.
type Screen = { id: string; tree: Node; focus: string };
// tmux: the focused pane splits in two, the new item right of or under it.
function splitAt(n: Node, at: string, add: string, dir: "cols" | "rows", before = false): Node {
  if (typeof n === "string") return n === at ? { dir, kids: before ? [add, n] : [n, add], sizes: [1, 1] } : n;
  return { ...n, kids: n.kids.map((k) => splitAt(k, at, add, dir, before)) };
}
type Saved = { tabs: Tab[]; hidden: string[]; screens: Screen[]; on: string | null };
const ALL: Record<string, Saved> = (() => {
  try {
    return JSON.parse(localStorage.getItem("kz-runtabs") || "{}");
  } catch {
    return {};
  }
})();
const save = () => {
  try {
    localStorage.setItem("kz-runtabs", JSON.stringify(ALL));
  } catch {}
};
// The workspace shown, and the card whose panel is up (the focused run tab's).
let ctx: { dir: string; ws: string; k: string } | null = null;
let card: any = null;
let shells: any[] = [];
let noPty = false;
// Every agent installed for this project (from /agents), each offered as a bare session.
let agents: { name: string; cmd: string }[] = [];
let defAgent = "";
// The agents with their own mark in the sprite; the rest show the generic one.
const MARKS = ["claude", "codex", "gemini"];
// Tab id -> its pane, and for a terminal the function that unmounts it.
const panes = new Map<string, { el: HTMLElement; off: (() => void) | null }>();
const byKey = (k: string) => store.S.cards.find((x) => key(x) === k);
const saved = (): Saved => {
  const s = (ALL[ctx!.k] ||= { tabs: [], hidden: [], screens: [], on: null });
  if (!Array.isArray(s.screens) || s.screens.some((sc: any) => !sc.tree)) (s.screens = []), delete (s as any).split; // older saves
  return s;
};
// Where the next item goes: a new screen (null), or beside/below the items of a screen.
let target: { screen: string; dir: "cols" | "rows" } | null = null;
// Every item sits in exactly one screen; a new one goes to `target` or its own screen.
function screens(): Screen[] {
  const s = saved(),
    ids = tabs().map((t) => t.id);
  s.screens = s.screens.flatMap((sc) => {
    const tree = prune(sc.tree, (id) => ids.includes(id));
    return tree ? [{ ...sc, tree, focus: leaves(tree).includes(sc.focus) ? sc.focus : leaves(tree)[0] }] : [];
  });
  for (const id of ids)
    if (!s.screens.some((sc) => leaves(sc.tree).includes(id))) {
      const into = target && s.screens.find((sc) => sc.id === target!.screen);
      if (into) (into.tree = splitAt(into.tree, into.focus, id, target!.dir)), (into.focus = id), (s.on = into.id);
      else s.screens.push({ id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), tree: id, focus: id });
      target = null;
    }
  if (!s.screens.some((sc) => sc.id === s.on)) s.on = s.screens[0]?.id ?? null;
  return s.screens;
}
const loopback = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

const AGENTS = ["claude", "codex", "gemini", "agy", "opencode", "cursor"];
const wsCards = () => (ctx ? liveIn(store.S.cards, ctx.dir, ctx.ws, wsOfCard) : []);
const subLabel = (c) => (c.kind === "run" ? titleOf(c) : "Idea: " + titleOf(c));

function tabs(): Tab[] {
  const s = saved(),
    out: Tab[] = [];
  const named = (a?: string) => agents.find((x) => x.cmd === a)?.name ?? "Agent";
  const live = wsCards(),
    liveKeys = new Set(live.map(key));
  // Each live run is a tab, then its agent sessions on this board.
  for (const c of live) {
    const k = key(c),
      emb = Object.values(stageKeys(c)), // shown inside the run's tab, on its stage
      keys: string[] = (c.pty ? c.pty.all ?? [c.pty.key] : []).filter((x) => !emb.includes(x)),
      runAgent = AGENTS.find((a) => c.tags?.includes(a)) ?? undefined;
    out.push({ id: "rn:" + k, kind: "run", title: subLabel(c), ck: k });
    keys.forEach((pk, i) => out.push({ id: "agent:" + pk, kind: "agent", agent: runAgent, title: named(runAgent) + (keys.length > 1 ? " " + (i + 1) : ""), key: pk }));
    for (const sh of shells.filter((x) => x.run === k)) out.push({ id: "sh:" + sh.key, kind: sh.agent ? "agent" : "shell", agent: sh.agent || undefined, title: sh.title, key: sh.key });
    // The run's own session is running in another terminal: a tab that says so.
    if (elsewhere.has(k)) out.push({ id: "wait:" + k, kind: "wait", agent: "claude", title: named("claude") });
  }
  // The workspace's own shells and agents, and those of its finished runs.
  const owned = new Set(store.S.cards.filter((c) => c.state === ctx!.dir && wsOfCard(c) === ctx!.ws).map(key));
  for (const sh of shells.filter((x) => x.run === ctx!.k || (owned.has(x.run) && !liveKeys.has(x.run))))
    out.push({ id: "sh:" + sh.key, kind: sh.agent ? "agent" : "shell", agent: sh.agent || undefined, title: sh.title, key: sh.key });
  // Opened by hand: a finished run (read-only), History, localhost, Preview, notes. A run's tab whose card left the board goes.
  const mine = s.tabs.flatMap((t) => {
    if (t.kind !== "run") return [t];
    const c = byKey(t.ck!);
    return c ? [{ ...t, title: subLabel(c), ro: finished(c) }] : [];
  });
  const all = [...out.filter((t) => !s.hidden.includes(t.id)), ...mine];
  return all.filter((t, i) => all.findIndex((x) => x.id === t.id) === i);
}
// An agent's tab shows the agent's own mark when the sprite has one.
const icon = (t: Tab) => {
  if (t.kind === "run") {
    const c = byKey(t.ck!);
    return c ? raw(`<span class="si ${stateOf(c)}"></span>`) : ico("ai");
  }
  return t.agent && MARKS.includes(t.agent) ? raw(`<svg><use href="#i-${t.agent}"/></svg>`) : ico({ agent: "ai", shell: "term", local: "link", preview: "eye", note: "note", wait: "ai", history: "note" }[t.kind]);
};
const elsewhere = new Set<string>();

let switched: string | null = null; // the project a deep link last switched the board to
const none = (t: string) => void ($("rtabs").innerHTML = String(html`<span class="rnone">${t}</span>`));
// Called by go("run") and on every /state: draws the tab strip and keeps the panes.
export async function showRunView(nav = false) {
  const p = new URLSearchParams(location.search),
    dir = p.get("dir"),
    id = p.get("id"),
    idea = p.get("idea");
  let ws = p.get("ws"),
    want: any = null; // the card the address names, whose tab is selected
  // A project this board is not showing: a deep link names its project, switched to once, as a rail click does.
  const away = async () => {
    if (store.all || !dir || dir === store.dir || dir === switched) return false;
    switched = dir;
    await pick(dir).catch(() => {});
    return true;
  };
  if (p.get("view") === "ws" && ws) {
    if (await away()) return showRunView(nav);
  } else {
    const find = (cs) => cs.find((x) => x.state === dir && (id ? x.kind === "run" && x.id === id : x.kind === "idea" && x.text === idea));
    const c = find(store.S.cards);
    // A launched idea becomes a run: its agent session moves to the run's card, and the view follows.
    const pk = idea && (c ?? card)?.kind === "idea" && (c ?? card)?.pty?.key;
    const run = pk && store.S.cards.find((x) => x.kind === "run" && x.state === dir && (x.pty?.key === pk || x.pty?.all?.includes(pk)));
    if (run) {
      history.replaceState(null, "", cardHref(run));
      markCurrent();
      return showRunView(nav);
    }
    if (!c) {
      if (await away()) return showRunView(nav);
      if (!store.all && find(railData().cards)) location.href = "/?all=1&" + p.toString();
      else (stopPanes(), (ctx = card = null), none(`That ${id ? "run" : "idea"} is not on this board.`));
      return;
    }
    want = c;
    ws = wsOfCard(c);
  }
  if (!dir || !ws) return void (stopPanes(), (ctx = card = null), none("That workspace is not on this board."));
  const k = wsKey(dir, ws);
  const fresh = ctx?.k !== k;
  // Each workspace has its own centre: switching unmounts this one's panes (its shells keep running on the server).
  if (fresh) (stopPanes(), (card = null), (ctx = { dir, ws, k }));
  // The header titles a phone's workspace: the run, else the branch.
  const w = railData().projects?.find((x) => x.dir === dir)?.workspaces?.find((x) => x.path === ws);
  document.querySelector(".hdr h1")!.textContent = want ? titleOf(want) : w?.branch || ws.split(/[\\/]/).pop() || "Workspace";
  // Layouts saved per run before workspaces move to their workspace; keys no card owns stay.
  if (migrate(ALL, store.S.cards, key, wsOfCard)) save();
  try {
    const r = await fetch("/shells?dir=" + encodeURIComponent(dir));
    shells = r.ok ? await r.json() : [];
  } catch {}
  if (fresh) {
    try {
      const d = await (await fetch("/agents?dir=" + encodeURIComponent(dir))).json();
      agents = d.agents ?? [];
      defAgent = d.default ?? "";
    } catch {}
  }
  if (ctx?.k !== k) return;
  if (want && nav) {
    // Every navigation (a notification, a Board card, a link) selects the card's tab, even for an address already open: a finished run opens read-only, a hidden one comes back.
    const tid = "rn:" + key(want),
      s = saved();
    s.hidden = s.hidden.filter((h) => h !== tid);
    if (!tabs().some((t) => t.id === tid)) s.tabs.push({ id: tid, kind: "run", title: subLabel(want), ck: key(want) });
    s.on = screens().find((sc) => leaves(sc.tree).includes(tid))?.id ?? s.on;
    save();
  }
  // A workspace with nothing open starts the default agent in its folder: no run is made;
  // the agent's kaizen skill makes one when you ask for work. A live run whose own Claude
  // session is not open anywhere on the board is resumed here, once per visit, beside its tab.
  if (!noPty) {
    if (!tabs().length && !autoShell.has(k)) return void (autoShell.add(k), newPty(defAgent || undefined));
    if (want && want.kind === "run" && !finished(want) && !want.pty && !shells.some((x) => x.run === key(want)) && !autoShell.has(key(want))) {
      autoShell.add(key(want));
      void openAgent(want, false, false);
    }
  }
  draw();
}
const autoShell = new Set<string>();

function draw() {
  const s = saved(),
    ts = tabs(),
    scs = screens(),
    cur = scs.find((sc) => sc.id === s.on);
  const item = (id: string) => ts.find((t) => t.id === id)!;
  const PTY = !noPty;
  const mark = (a) => (MARKS.includes(a.cmd) ? raw(`<svg><use href="#i-${a.cmd}"/></svg>`) : ico("ai"));
  const dflt = agents.find((a) => a.cmd === defAgent);
  // A tab holding a run that waits on you has no ×.
  const stuck = (ids: string[]) => ids.some((id) => item(id).kind === "run" && awaiting(byKey(item(id).ck!)));
  const back = hiddenRuns(wsCards(), s.hidden, key);
  const menu = html`<div class="menu-pop">${PTY && dflt ? html`<button data-n="agent:${dflt.cmd}">${mark(dflt)}<span>New agent here<small>${dflt.name} in this folder</small></span></button>` : ""}${PTY ? html`<button data-n="shell">${ico("term")}<span>Shell<small>a terminal in this folder</small></span></button>` : ""}<button data-n="local">${ico("link")}<span>Localhost<small>the project's dev server</small></span></button><button data-n="preview">${ico("eye")}<span>Preview<small>the run's Preview</small></span></button><button data-n="history">${ico("note")}<span>History<small>finished runs in this workspace</small></span></button>${back.length ? html`<b class="mh">Reopen</b>${back.map((c) => html`<button data-n="reopen:${key(c)}">${ico("arrow")}<span>${subLabel(c)}<small>a run whose tab was closed</small></span></button>`)}` : ""}${PTY ? agents.filter((a) => a !== dflt).map((a) => html`<button data-n="agent:${a.cmd}">${mark(a)}<span>${a.name} session<small>the agent alone, no run</small></span></button>`) : ""}</div>`;
  $("rtabs").innerHTML = String(
    html`${scs.map((sc) => {
      const ids = leaves(sc.tree),
        first = item(ids[0]),
        title = ids.map((id) => item(id).title).join(" + ");
      return html`<button class="rtab${sc.id === s.on ? " on" : ""}" data-t="${sc.id}" draggable="true" title="${title}">${icon(first)}<span>${title}</span>${stuck(ids) ? "" : html`<i data-xs="${sc.id}" role="button" aria-label="Close ${title}" title="Close tab">×</i>`}</button>`;
    })}<details class="radd" data-mode="tab"><summary class="rbtn" title="New tab" aria-label="New tab">${ico("plus")}</summary>${menu}</details><span class="sp"></span>${cur ? html`<details class="radd rsplit" data-mode="cols"><summary class="rbtn" title="Split right: add to this tab" aria-label="Split right">${ico("lcols")}</summary>${menu}</details><details class="radd rsplit" data-mode="rows"><summary class="rbtn" title="Split down: add to this tab" aria-label="Split down">${ico("lrows")}</summary>${menu}</details>` : ""}<button class="rbtn" id="rside" title="Show or hide the run panel" aria-label="Show or hide the run panel" aria-pressed="${String(document.body.classList.contains("rflip"))}">${ico("open")}</button>`,
  );
  $("rtabs").querySelector(".rtab.on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  // Panes: made once per item, kept (hidden) while it is open, so terminals never reconnect.
  const box = $("rpanes");
  for (const [id, p] of panes)
    if (!ts.some((t) => t.id === id)) {
      p.off?.();
      stageTerm.get(id)?.off?.();
      stageTerm.delete(id);
      parkPanel(p.el);
      p.el.remove();
      panes.delete(id);
    }
  for (const t of ts) if (!panes.has(t.id)) makePane(t);
  const shown = cur ? leaves(cur.tree) : [];
  for (const [id, p] of panes) {
    p.el.hidden = !shown.includes(id);
    p.el.classList.toggle("split", shown.length > 1);
    p.el.classList.toggle("focus", shown.length > 1 && id === cur?.focus);
    p.el.classList.toggle("ro", !!item(id)?.ro);
    p.el.querySelector(".ph span")!.textContent = item(id)?.title ?? "";
    if (item(id)?.kind === "history") fillHistory(p.el);
  }
  // The tree is rebuilt only when it changes: moving a pane in the DOM reloads its frame.
  const sig = cur ? cur.id + JSON.stringify(cur.tree) : "";
  if (sig !== shownSig) {
    shownSig = sig;
    for (const [, p] of panes) if (p.el.parentElement !== box) box.append(p.el);
    box.querySelector(".rtree")?.remove();
    if (cur) box.prepend(build(cur.tree, cur));
  }
  // One empty note at most: every draw used to append another.
  box.querySelector(".rempty")?.remove();
  if (!scs.length) box.insertAdjacentHTML("beforeend", String(html`<div class="empty rempty"><b>No tabs open</b><p>Open an agent, a shell, the project's localhost or the Preview with +.</p></div>`));
  mountPanel(ts, cur);
  wire();
}

// The run panel (#panel) is one element: it moves into the focused run tab, under that tab's
// Plan · Build · Review, and is filled by open() as it is anywhere else.
const appHome = () => document.querySelector(".app")!;
function parkPanel(inside: HTMLElement) {
  if (!inside.contains($("panel"))) return;
  appHome().append($("panel"));
  $("panel").classList.add("parked"); // no run tab to show: hidden, not docked
}
function mountPanel(ts: Tab[], cur?: Screen) {
  const t = ts.find((x) => x.id === cur?.focus);
  const c = t?.kind === "run" && byKey(t.ck!);
  if (!t || !c) return void $("panel").classList.toggle("parked", !$("panel").closest(".rslot")); // docked nowhere: hidden
  const slot = panes.get(t.id)!.el.querySelector<HTMLElement>(".rslot")!;
  const moved = $("panel").parentElement !== slot;
  if (moved) (slot.append($("panel")), $("panel").classList.remove("parked"));
  card = c;
  if (moved || store.openKey !== key(c)) void Promise.resolve(open(c)).then(() => subs(t));
  subs(t);
}
// The sub-tabs: the one the panel shows is lit, one whose file is not written yet is dimmed.
const SUBS = [["Plan", "plan"], ["Build", "impl"], ["Review", "review"]];
// The terminal the board launched for the shown stage sits beside the stage's file; a stage
// without one shows the file alone. One live xterm per pty: the key has no tab of its own.
const stageTerm = new Map<string, { key: string; off: null | (() => void) }>();
function stageTermFor(t: Tab) {
  const c = byKey(t.ck!),
    el = panes.get(t.id)?.el.querySelector<HTMLElement>(".rstage");
  if (!c || !el) return;
  const k = stageKeys(c)[store.tab] ?? "",
    cur = stageTerm.get(t.id);
  if (cur?.key === k) return;
  cur?.off?.();
  stageTerm.delete(t.id);
  el.hidden = !k;
  el.replaceChildren();
  if (!k) return;
  const term = document.createElement("div");
  term.className = "term";
  el.append(term);
  const rec = { key: k, off: null as null | (() => void) };
  stageTerm.set(t.id, rec);
  termLoad()
    .then((m) => {
      if (stageTerm.get(t.id) === rec) rec.off = m(term, k, () => load(true));
    })
    .catch(() => (term.textContent = "The terminal could not load."));
}
function subs(t: Tab) {
  const el = panes.get(t.id)?.el;
  const doc = store.runDoc && store.runDoc.id === byKey(t.ck!)?.id ? store.runDoc : null;
  el?.querySelectorAll<HTMLButtonElement>("[data-sub]").forEach((b) => {
    b.classList.toggle("on", store.tab === b.dataset.sub);
    b.disabled = !doc?.[b.dataset.sub!];
  });
  stageTermFor(t);
}
// History: the workspace's finished runs, newest first; one opens read-only.
function fillHistory(el: HTMLElement) {
  const list = historyOf(store.S.cards, ctx!.dir, ctx!.ws, wsOfCard),
    now = Date.now();
  const box = el.querySelector(".rhist")!;
  box.innerHTML = String(
    list.length
      ? html`${list.map((c) => html`<button class="rrow" data-hist="${key(c)}"><span class="si ${stateOf(c)}"></span><b>${titleOf(c)}</b><small>${c.status} · ${age(c.moved ?? now, now)} ago</small></button>`)}`
      : html`<p class="rnone">No finished runs in this workspace yet.</p>`,
  );
}

let shownSig = "";
// Moves an item out of its tab into another one (split beside a pane there, or next to its
// focused pane), or into a tab of its own (to = null). Terminals keep running; frames reload.
function moveItem(id: string, to: string | null, at?: { pane: string; dir: "cols" | "rows"; before: boolean }) {
  const s = saved();
  if (at?.pane === id) return;
  // Dropped on the tab it is already in, with no pane edge to split at: nothing to do.
  if (!at && to && s.screens.find((sc) => sc.id === to && leaves(sc.tree).includes(id))) return;
  for (const sc of s.screens) {
    sc.tree = prune(sc.tree, (x) => x !== id) ?? "";
    if (sc.tree !== "" && !leaves(sc.tree).includes(sc.focus)) sc.focus = leaves(sc.tree)[0];
  }
  s.screens = s.screens.filter((sc) => sc.tree !== "");
  const dest = to && s.screens.find((sc) => sc.id === to);
  if (dest) {
    dest.tree = splitAt(dest.tree, at?.pane ?? dest.focus, id, at?.dir ?? "cols", at?.before ?? false);
    dest.focus = id;
    s.on = dest.id;
  } else {
    const sid = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    s.screens.push({ id: sid, tree: id, focus: id });
    s.on = sid;
  }
  save();
  draw();
}
let dragging: string | null = null;
// One node of the layout tree as DOM: a pane, or a flex row/column of its children with a
// draggable gutter between each pair (sizes saved on the node).
function build(n: Node, sc: Screen): HTMLElement {
  if (typeof n === "string") return panes.get(n)!.el;
  const el = document.createElement("div");
  el.className = "rtree " + n.dir;
  n.kids.forEach((k, i) => {
    if (i) {
      const g = document.createElement("div");
      g.className = "rgut";
      g.onpointerdown = (e) => {
        e.preventDefault();
        const a = el.children[2 * i - 2] as HTMLElement,
          b = el.children[2 * i] as HTMLElement,
          horiz = n.dir === "cols",
          ra = a.getBoundingClientRect(),
          rb = b.getBoundingClientRect(),
          total = horiz ? ra.width + rb.width : ra.height + rb.height,
          sum = n.sizes[i - 1] + n.sizes[i],
          start = horiz ? ra.left : ra.top;
        g.setPointerCapture(e.pointerId);
        g.onpointermove = (m) => {
          const f = Math.min(0.9, Math.max(0.1, ((horiz ? m.clientX : m.clientY) - start) / total));
          n.sizes[i - 1] = sum * f;
          n.sizes[i] = sum * (1 - f);
          a.style.flexGrow = String(n.sizes[i - 1]);
          b.style.flexGrow = String(n.sizes[i]);
        };
        g.onpointerup = () => {
          g.onpointermove = g.onpointerup = null;
          shownSig = sc.id + JSON.stringify(sc.tree);
          save();
        };
      };
      el.append(g);
    }
    const c = build(k, sc);
    c.style.flex = `${n.sizes[i] ?? 1} 1 0`;
    el.append(c);
  });
  return el;
}

function makePane(t: Tab) {
  const el = document.createElement("section");
  el.className = "rpane";
  el.dataset.t = t.id;
  // The header is the handle: drag it onto a tab, onto + (a new tab) or onto a pane's edge;
  // ⋯ does the same from a menu. × closes the item.
  el.innerHTML = String(html`<header class="ph" draggable="true"><span>${t.title}</span><details class="pmove"><summary title="Move to another tab" aria-label="Move ${t.title}">⋯</summary><div class="menu-pop"></div></details><button data-x="${t.id}" title="Close" aria-label="Close ${t.title}">×</button></header>`);
  const p = { el, off: null as null | (() => void) };
  panes.set(t.id, p);
  $("rpanes").append(el);
  if (t.kind === "run") {
    const isRun = byKey(t.ck!)?.kind === "run";
    el.insertAdjacentHTML("beforeend", String(html`${isRun ? html`<nav class="rsub" aria-label="Run stages">${SUBS.map(([n, k]) => html`<button type="button" data-sub="${k}">${n}</button>`)}<span class="rro">Read-only</span></nav>` : ""}<div class="rwrap"><div class="rslot"></div><div class="rstage" hidden></div></div>`));
  } else if (t.kind === "history") {
    el.insertAdjacentHTML("beforeend", String(html`<div class="rhist md"></div>`));
    fillHistory(el);
  } else if (t.kind === "agent" || t.kind === "shell") {
    const term = document.createElement("div");
    term.className = "term";
    el.append(term);
    termLoad()
      .then((m) => {
        if (panes.get(t.id) === p) p.off = m(term, t.key, () => load(true));
      })
      .catch(() => (term.textContent = "The terminal could not load."));
  } else if (t.kind === "wait")
    el.insertAdjacentHTML(
      "beforeend",
      String(html`<div class="empty rwait"><b>This run's agent is running in another terminal</b><p>One conversation cannot run in two places. Close it there, then open it here.</p><button type="button" class="rwin" data-b="recheck" data-k="${t.id.slice(5)}">${ico("refresh")}<span>Open here</span></button></div>`),
    );
  else if (t.kind === "local") browser(el);
  else if (t.kind === "note") el.insertAdjacentHTML("beforeend", String(html`<iframe class="rframe" title="${t.title}" src="/notebook?dir=${encodeURIComponent(ctx!.dir)}&note=${encodeURIComponent(t.note!)}&embed=1"></iframe>`));
  else void previewPane(el);
}

// The localhost tab: a URL bar over an iframe. The URL is kept per project.
function browser(el: HTMLElement) {
  const k = "kz-browse:" + ctx!.dir;
  let url = "http://localhost:3000";
  try {
    url = localStorage.getItem(k) || url;
  } catch {}
  const back: string[] = [],
    fwd: string[] = [];
  el.insertAdjacentHTML(
    "beforeend",
    String(html`<form class="urlbar"><button type="button" data-b="back" title="Back" aria-label="Back">‹</button><button type="button" data-b="fwd" title="Forward" aria-label="Forward">›</button><button type="button" data-b="reload" title="Reload" aria-label="Reload">${ico("refresh")}</button><input class="sel" aria-label="Address" spellcheck="false" value="${url}">${winBtn(url)}</form>`),
  );
  const f = el.querySelector("form")!,
    inp = f.querySelector("input")!,
    ext = f.querySelector<HTMLAnchorElement>("a.rwin");
  // On a phone over the tailnet, localhost is the phone itself: framing it shows nothing useful.
  const local = (u) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(u);
  const frame = document.createElement("iframe");
  frame.className = "rframe";
  frame.title = "localhost";
  const note = document.createElement("p");
  note.className = "rnote";
  const far = "This page is on the computer running the board; from this device localhost is the device itself. Use Open in browser on that computer.";
  el.append(frame, note);
  const go = (u, push = true) => {
    if (push && url !== u) back.push(url), (fwd.length = 0);
    url = u;
    inp.value = u;
    if (ext) ext.href = u;
    try {
      localStorage.setItem(k, u);
    } catch {}
    const hide = !loopback && local(u);
    frame.hidden = hide;
    note.hidden = !hide;
    note.textContent = far;
    if (hide) return;
    frame.src = u;
    // Most public sites refuse to be framed (X-Frame-Options / frame-ancestors), and the
    // browser only shows its own error page. The board asks the site first and says so.
    void fetch("/frameable?url=" + encodeURIComponent(u))
      .then((r) => r.json())
      .then((j) => {
        if (url !== u || j.frameable !== false) return;
        frame.hidden = true;
        frame.removeAttribute("src");
        note.hidden = false;
        note.textContent = `${new URL(u).host} does not allow being shown inside another page. `;
        note.insertAdjacentHTML("beforeend", String(winBtn(u)));
      })
      .catch(() => {});
  };
  f.onsubmit = (e) => {
    e.preventDefault();
    let u = inp.value.trim();
    if (!/^https?:\/\//.test(u)) u = "http://" + u;
    go(u);
  };
  el.onclick = (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-b]")?.dataset.b;
    if (b === "win") void openWindow(url);
    else if (b === "reload") go(url, false);
    else if (b === "back" && back.length) fwd.push(url), go(back.pop()!, false);
    else if (b === "fwd" && fwd.length) back.push(url), go(fwd.pop()!, false);
  };
  go(url, false);
}

// A Chromium app window on the board's computer (POST /open-url): for dev servers that
// refuse to be framed. Only offered when the page itself is on that computer.
// One labelled button: on the board's computer a Chromium app window, elsewhere a new tab.
const winBtn = (u: string) =>
  loopback
    ? html`<button type="button" class="rwin" data-b="win" title="Open in a browser window">${ico("popout")}<span>Open in browser</span></button>`
    : html`<a class="rwin" target="_blank" rel="noopener" href="${u}">${ico("popout")}<span>Open in browser</span></a>`;
async function openWindow(u: string) {
  const r = await fetch("/open-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: u }) }).catch(() => null);
  if (!r?.ok) toast("Could not open a browser window" + (r ? ": " + ((await r.json().catch(() => ({}))) as any).error : ""));
}

// The run's Preview: its screenshots (each opens the image viewer on click), with an Open
// app link when it names a localhost address. The address is framed only when the Preview
// has no images: the dev server a run used is often gone, and a dead frame hides the proof.
async function previewPane(el: HTMLElement) {
  let doc = store.runDoc && store.runDoc.id === card?.id ? store.runDoc : null;
  if (!doc && card?.kind === "run")
    try {
      doc = await (await fetch(`/run/${encodeURIComponent(card.id)}?dir=${encodeURIComponent(card.state)}`)).json();
    } catch {}
  const pv = doc && preview(doc.impl);
  const url = pv && /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?[^\s)`'"<>]*/.exec(pv)?.[0];
  const shots = pv && /!\[[^\]]*\]\(/.test(pv);
  if (url && loopback && !shots) return void el.insertAdjacentHTML("beforeend", String(html`<iframe class="rframe" title="Preview" src="${url}"></iframe>`));
  const bar = url ? html`<div class="urlbar"><span class="sel">${url}</span>${winBtn(url)}</div>` : "";
  el.insertAdjacentHTML("beforeend", String(html`${bar}<div class="rprev md">${pv ? raw(md(attach(pv, card))) : html`<p class="rnone">This run has no Preview yet.</p>`}</div>`));
  el.querySelector<HTMLElement>(".urlbar [data-b=win]")?.addEventListener("click", () => void openWindow(url!));
  // The screenshots as a grid, each captioned by its file name, after the Preview's text.
  const box = el.querySelector(".rprev")!,
    imgs = [...box.querySelectorAll("img")];
  if (imgs.length) {
    const grid = document.createElement("div");
    grid.className = "shots";
    for (const im of imgs) {
      const p = im.parentElement!;
      const fig = document.createElement("figure");
      const cap = document.createElement("figcaption");
      cap.textContent = im.alt || decodeURIComponent((im.getAttribute("src") || "").split("/").pop() || "");
      fig.append(im.closest("a") ?? im, cap);
      grid.append(fig);
      if (p !== box && !p.textContent!.trim() && !p.querySelector("img")) p.remove();
    }
    box.append(grid);
  }
}

function addTab(t: Tab) {
  const s = saved();
  if (!s.tabs.some((x) => x.id === t.id)) s.tabs.push(t);
  // Already open somewhere: moving it into the target screen means taking it out of its old one.
  else if (target) for (const sc of s.screens) sc.tree = prune(sc.tree, (id) => id !== t.id) ?? sc.tree;
  show(t.id);
}
// After an item is added: run screens() (which places it) and show the screen holding it.
function show(id: string) {
  const s = saved();
  s.on = screens().find((sc) => leaves(sc.tree).includes(id))?.id ?? s.on;
  save();
  draw();
}
export const openNoteTab = (name: string) => addTab({ id: "note:" + name, kind: "note", title: name.slice(name.lastIndexOf("/") + 1), note: name });
const openPreview = () => addTab({ id: "preview", kind: "preview", title: "Preview" });

// The run's recorded session, resumed in a board terminal tied to it. While it still runs in
// another terminal the server says so (409 live) and a tab explains; with no session, a shell.
async function openAgent(c, again = false, focus = true) {
  const k = key(c);
  const r = await fetch("/shell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir: c.state, ws: ctx!.ws, run: k, resume: true }) }).catch(() => null);
  if (r?.ok) {
    elsewhere.delete(k);
    const sh = await r.json();
    shells.push(sh);
    return focus ? show("sh:" + sh.key) : draw();
  }
  const j: any = r ? await r.json().catch(() => ({})) : {};
  if (r?.status === 409 && j.live) {
    elsewhere.add(k);
    if (again) toast("Still running in another terminal");
    return draw();
  }
  elsewhere.delete(k);
  if (again) toast(j.error || "Could not resume the session");
  else draw();
}

async function newPty(agent?: string) {
  const r = await fetch("/shell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir: ctx!.dir, ws: ctx!.ws, run: ctx!.k, ...(agent ? { agent } : {}) }) });
  if (r.status === 501) {
    noPty = true;
    return draw();
  }
  if (!r.ok) {
    // 429 (too many terminals), 403, anything else: say why, and keep the tab bar drawn.
    let why = "";
    try {
      why = (await r.json()).error;
    } catch {}
    toast(why ? "No new terminal: " + why : "No new terminal (" + r.status + ")");
    return draw();
  }
  const sh = await r.json();
  shells.push(sh);
  show("sh:" + sh.key);
}

async function closeTab(id: string) {
  const s = saved();
  if (id.startsWith("rn:") && awaiting(byKey(id.slice(3)))) return; // a run waiting on you stays open
  if (id.startsWith("sh:")) {
    await post("/pty/exit", { key: id.slice(3) });
    shells = shells.filter((x) => "sh:" + x.key !== id);
  } else if (id.startsWith("agent:")) s.hidden.push(id);
  else if (id.startsWith("wait:")) elsewhere.delete(id.slice(5));
  else {
    // A run's tab: a live one is hidden (it comes back when its address is opened), a finished one goes.
    if (id.startsWith("rn:")) (parkPanel(panes.get(id)!.el), s.hidden.push(id));
    s.tabs = s.tabs.filter((t) => t.id !== id);
  }
  save();
  draw();
}
// A tab's ×: everything in it closes (shells end, the agent is only hidden).
async function closeScreen(sid: string) {
  const sc = saved().screens.find((x) => x.id === sid);
  for (const id of sc ? leaves(sc.tree) : []) await closeTab(id);
}

// A pane's ⋯ menu, filled when it opens: every other tab, and a tab of its own.
function onMoveMenu(e: Event) {
  const d = e.target as HTMLDetailsElement;
  if (!d.classList?.contains("pmove") || !d.open) return;
  const s = saved(),
    id = d.closest<HTMLElement>(".rpane")!.dataset.t!,
    ts = tabs(),
    name = (sc: Screen) => leaves(sc.tree).map((x) => ts.find((t) => t.id === x)?.title ?? "").join(" + ");
  const m = d.querySelector<HTMLElement>(".menu-pop")!;
  m.innerHTML = String(
    html`<b class="mh">Move to</b>${s.screens.filter((sc) => !leaves(sc.tree).includes(id)).map((sc) => html`<button data-mv="${sc.id}">${ico("arrow")}<span>${name(sc)}</span></button>`)}<button data-mv="">${ico("plus")}<span>New tab</span></button>`,
  );
  const r = d.querySelector("summary")!.getBoundingClientRect();
  m.style.top = r.bottom + 4 + "px";
  m.style.left = Math.max(8, r.right - m.offsetWidth) + "px";
}

function wire() {
  const bar = $("rtabs"),
    s = saved();
  bar.onclick = (e) => {
    const t = e.target as HTMLElement;
    const xs = t.closest<HTMLElement>("[data-xs]")?.dataset.xs;
    if (xs) return void closeScreen(xs);
    const tab = t.closest<HTMLElement>("[data-t]")?.dataset.t;
    if (tab) {
      s.on = tab;
      save();
      return draw();
    }
    const n = t.closest<HTMLElement>("[data-n]")?.dataset.n;
    if (n) {
      const d = t.closest<HTMLDetailsElement>(".radd")!;
      const mode = d.dataset.mode;
      d.open = false;
      // + makes a new tab; split right/down adds to the tab shown.
      target = mode === "tab" || !s.on ? null : { screen: s.on, dir: mode as "cols" | "rows" };
      if (n === "shell") void newPty();
      else if (n.startsWith("agent:")) void newPty(n.slice(6));
      else if (n === "local") addTab({ id: "local", kind: "local", title: "localhost" });
      else if (n.startsWith("reopen:")) {
        s.hidden = s.hidden.filter((h) => h !== "rn:" + n.slice(7));
        show("rn:" + n.slice(7));
      } else if (n === "history") addTab({ id: "history", kind: "history", title: "History" });
      else openPreview();
      return;
    }
    if (t.closest("#rside")) {
      document.body.classList.toggle("rflip");
      draw();
    }
  };
  // The +, split right and split down menus open under their button, kept inside the
  // centre panel; one open at a time. A pane's own × closes just that item.
  const adds = [...bar.querySelectorAll<HTMLDetailsElement>(".radd")];
  for (const add of adds)
    add.ontoggle = () => {
      if (!add.open) return;
      for (const o of adds) if (o !== add) o.open = false;
      const m = add.querySelector<HTMLElement>(".menu-pop")!,
        r = add.querySelector("summary")!.getBoundingClientRect(),
        box = $("runv").getBoundingClientRect();
      m.style.top = r.bottom + 4 + "px";
      m.style.left = Math.max(box.left + 4, Math.min(r.left, box.right - m.offsetWidth - 4)) + "px";
    };
  $("rpanes").onclick = (e) => {
    const x = (e.target as HTMLElement).closest<HTMLElement>(".ph [data-x]")?.dataset.x;
    if (x) return void closeTab(x);
    const rk = (e.target as HTMLElement).closest<HTMLElement>("[data-b=recheck]")?.dataset.k;
    if (rk && byKey(rk)) return void openAgent(byKey(rk), true);
    // The panel's own strip (the only stage switch on a phone) changes the stage too: its terminal follows.
    if (card && e.composedPath().some((n) => (n as HTMLElement).id === "ptabs")) {
      const t = tabs().find((x) => x.id === "rn:" + key(card));
      if (t) subs(t);
    }
    const sub = (e.target as HTMLElement).closest<HTMLElement>("[data-sub]");
    if (sub && card) {
      $("panel").classList.remove("pn");
      store.tab = sub.dataset.sub!;
      const t = tabs().find((x) => x.id === "rn:" + key(card));
      return void openRun(card, true).then(() => t && subs(t));
    }
    const hist = (e.target as HTMLElement).closest<HTMLElement>("[data-hist]")?.dataset.hist;
    if (hist && byKey(hist)) {
      const c = byKey(hist);
      return addTab({ id: "rn:" + hist, kind: "run", title: subLabel(c), ck: hist });
    }
    const mv = (e.target as HTMLElement).closest<HTMLElement>("[data-mv]");
    if (mv) {
      const id = mv.closest<HTMLElement>(".rpane")!.dataset.t!;
      mv.closest("details")!.open = false;
      return moveItem(id, mv.dataset.mv || null);
    }
  };
  // Moving panes: the header's ⋯ menu lists the other tabs; dragging the header drops it on a
  // tab, on + (a tab of its own) or on a pane's edge (split there on that side).
  const box = $("rpanes");
  box.ontoggle = null;
  box.addEventListener("toggle", onMoveMenu, true);
  box.ondragstart = (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>(".ph")?.closest<HTMLElement>(".rpane")?.dataset.t;
    if (!id) return;
    dragging = id;
    e.dataTransfer!.setData("text/plain", id);
    e.dataTransfer!.effectAllowed = "move";
  };
  // A tab is the handle too: dragging it moves its focused pane (the only one, unsplit).
  bar.ondragstart = (e) => {
    const sc = saved().screens.find((x) => x.id === (e.target as HTMLElement).closest<HTMLElement>(".rtab")?.dataset.t);
    if (!sc) return;
    dragging = leaves(sc.tree).includes(sc.focus) ? sc.focus : leaves(sc.tree)[0];
    e.dataTransfer!.setData("text/plain", dragging);
    e.dataTransfer!.effectAllowed = "move";
  };
  box.ondragend = bar.ondragend = () => {
    dragging = null;
    document.querySelectorAll(".rdrop,.rdrop-l,.rdrop-r,.rdrop-t,.rdrop-b").forEach((x) => x.classList.remove("rdrop", "rdrop-l", "rdrop-r", "rdrop-t", "rdrop-b"));
  };
  const edge = (el: HTMLElement, e: DragEvent) => {
    const r = el.getBoundingClientRect(),
      x = (e.clientX - r.left) / r.width,
      y = (e.clientY - r.top) / r.height;
    const d = [["l", x], ["r", 1 - x], ["t", y], ["b", 1 - y]].sort((a, b) => (a[1] as number) - (b[1] as number))[0][0] as string;
    return d;
  };
  box.ondragover = (e) => {
    const pane = (e.target as HTMLElement).closest<HTMLElement>(".rpane");
    if (!dragging || !pane || pane.dataset.t === dragging) return;
    e.preventDefault();
    const d = edge(pane, e);
    pane.classList.remove("rdrop-l", "rdrop-r", "rdrop-t", "rdrop-b");
    pane.classList.add("rdrop-" + d);
  };
  box.ondragleave = (e) => (e.target as HTMLElement).closest(".rpane")?.classList.remove("rdrop-l", "rdrop-r", "rdrop-t", "rdrop-b");
  box.ondrop = (e) => {
    const pane = (e.target as HTMLElement).closest<HTMLElement>(".rpane"),
      id = dragging;
    if (!id || !pane || pane.dataset.t === id) return;
    e.preventDefault();
    const d = edge(pane, e);
    moveItem(id, s.on, { pane: pane.dataset.t!, dir: d === "l" || d === "r" ? "cols" : "rows", before: d === "l" || d === "t" });
  };
  bar.ondragover = (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>(".rtab,.radd[data-mode=tab]");
    if (!dragging || !t) return;
    e.preventDefault();
    bar.querySelectorAll(".rdrop").forEach((x) => x.classList.remove("rdrop"));
    t.classList.add("rdrop");
  };
  bar.ondrop = (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>(".rtab,.radd[data-mode=tab]"),
      id = dragging;
    if (!id || !t) return;
    e.preventDefault();
    moveItem(id, t.classList.contains("rtab") ? t.dataset.t! : null);
  };
  // The pane last clicked is the one a split divides.
  $("rpanes").onpointerdown = (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>(".rpane")?.dataset.t,
      sc = saved().screens.find((x) => x.id === saved().on);
    if (id && sc && sc.focus !== id) {
      sc.focus = id;
      save();
      for (const [k, p] of panes) p.el.classList.toggle("focus", p.el.classList.contains("split") && k === id);
    }
  };
}

// Leaving the workspace: its terminals unmount; the shells keep running on the server.
function stopPanes() {
  parkPanel($("rpanes"));
  for (const p of panes.values()) p.off?.();
  panes.clear();
  $("rpanes").innerHTML = "";
}
export function runStop() {
  stopPanes();
  card = ctx = null;
  $("panel").classList.remove("pn");
}

// The strip's Project notes: the project's notes as a tree in the panel; a note opens as a centre tab.
async function projectNotes() {
  const pn = $("panel");
  if (pn.classList.toggle("pn") === false) return;
  const box = $("pnlist");
  box.innerHTML = "";
  try {
    const d = await (await fetch("/vault?dir=" + encodeURIComponent(ctx!.dir))).json();
    const names: string[] = (d.notes ?? []).map((n) => n.name).sort();
    // Folders first-level as headings, notes under them: "Project/Web board" shows under Project.
    const groups = new Map<string, string[]>();
    for (const n of names) {
      const i = n.lastIndexOf("/"),
        g = i < 0 ? "" : n.slice(0, i);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(n);
    }
    box.innerHTML = String(
      html`<h3>Project notes</h3>${names.length ? [...groups].map(([g, ns]) => html`${g ? html`<div class="tf dir">${ico("side")}${g}</div>` : ""}<div class="${g ? "tree" : ""}">${ns.map((n) => html`<button class="tf" data-note="${n}">${ico("note")}${n.slice(n.lastIndexOf("/") + 1)}</button>`)}</div>`) : html`<p class="rnone">No notes in this project yet.</p>`}`,
    );
  } catch {
    box.textContent = "The notes could not load.";
  }
}

export function initRunView() {
  addEventListener("kz-run-preview", openPreview);
  $("pnotes").onclick = () => void projectNotes();
  $("pnlist").onclick = (e) => {
    const n = (e.target as HTMLElement).closest<HTMLElement>("[data-note]")?.dataset.note;
    if (n) openNoteTab(n);
  };
  // A /state change: new or ended sessions, the card's own state. Panes stay mounted.
  addEventListener("kz-state", () => {
    if (ctx && document.body.classList.contains("runv")) void showRunView();
  });
}
// Opens a card's workspace, its address in the history.
export function openWorkspace(c) {
  const u = cardHref(c);
  if (location.pathname + location.search !== u) history.pushState(null, "", u);
  markCurrent();
  go("run");
}
