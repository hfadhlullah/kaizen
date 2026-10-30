// The workspace centre (?view=ws&dir=&ws=; a run's or idea's old address resolves to its
// workspace and picks that run in the panel): a tab bar over one folder holding terminals and the
// Browser, never runs. Agent terminals are tabs, named by stage for a run's ("Build · Claude"),
// beside shells started with POST /shell {ws}, the project's localhost, the Preview, project
// notes and History (finished runs, read-only in the panel). The run panel (#panel, drawn by
// panel.ts) docks on the right and shows one run, chosen in its picker (run-pick.ts); the centre
// never follows it. A workspace with no tab opens a shell in its folder. Terminal tabs are
// kzTerm mounts on /pty that live as long as their tab, so a tab switch or a /state tick never
// reconnects them. Split right or down shows a second tab beside the first, sized with the
// Terminal page's handles.
import { pick } from "./projects.ts";
import { store } from "./store.ts";
import { toast } from "./toast.ts";
import { $, html, ico, raw } from "./dom.ts";
import { key } from "./cards.ts";
import { open } from "./panel.ts";
import { termLoad } from "./agent-term.ts";
import { load, post } from "./api.ts";
import { attach, md, preview } from "./markdown.ts";
import { layout } from "./terms.ts";
import { cardHref, markCurrent, railData, stateOf, titleOf, wsHref, wsOfCard } from "./workspace.ts";
import { type Node, awaiting, chosen, finished, historyOf, leaves, liveIn, loopbackUrl, migrate, pickable, prune, reviewing, stageTabs, toOpen, wsKey } from "./ws-tabs.ts";
import { drawPick, hidePick, initPick, setOpen } from "./run-pick.ts";
import { age } from "./labels.ts";
import { go } from "./views.ts";
import { isPhone } from "./phone.ts";

type Tab = { id: string; kind: "agent" | "shell" | "local" | "preview" | "note" | "wait" | "history"; title: string; key?: string; note?: string; agent?: string };
// Per workspace: the extra items opened (localhost, preview, notes, History),
// tabs closed, and the screens. A screen is one tab of the bar: one or more items side by
// side or stacked.
type Screen = { id: string; tree: Node; focus: string };
// tmux: the focused pane splits in two, the new item right of or under it.
function splitAt(n: Node, at: string, add: string, dir: "cols" | "rows", before = false): Node {
  if (typeof n === "string") return n === at ? { dir, kids: before ? [add, n] : [n, add], sizes: [1, 1] } : n;
  return { ...n, kids: n.kids.map((k) => splitAt(k, at, add, dir, before)) };
}
// seen: the runs that already opened the Browser on their Preview, so a run does it once.
type Saved = { tabs: Tab[]; hidden: string[]; screens: Screen[]; on: string | null; seen?: string[] };
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
// The workspace shown, and the card whose panel is up (the picker's).
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
  // Layouts saved while runs were tabs: those tabs are gone, the panel picks runs now.
  s.tabs = s.tabs.filter((t: any) => t.kind !== "run");
  s.hidden = s.hidden.filter((h) => !h.startsWith("rn:"));
  if (!Array.isArray(s.screens) || s.screens.some((sc: any) => !sc.tree)) (s.screens = []), delete (s as any).split; // older saves
  return s;
};
// Where the next item goes: a new screen (null), or beside/below the items of a screen.
let target: { screen: string; dir: "cols" | "rows" } | null = null;
// Every item sits in exactly one screen; a new one goes to `target` or its own screen.
function screens(): Screen[] {
  const s = saved(),
    ids = tabs().map((t) => t.id);
  // In place: the panes on screen hold these objects, and a gutter drag writes its sizes into them.
  s.screens = s.screens.filter((sc) => {
    const tree = prune(sc.tree, (id) => ids.includes(id));
    if (!tree) return false;
    sc.tree = tree;
    if (!leaves(tree).includes(sc.focus)) sc.focus = leaves(tree)[0];
    return true;
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

function tabs(): Tab[] {
  const s = saved(),
    out: Tab[] = [];
  const named = (a?: string) => agents.find((x) => x.cmd === a)?.name ?? "Agent";
  const live = wsCards(),
    liveKeys = new Set(live.map(key));
  // Each live run's terminals: its stage terminals ("Build · Claude"), other sessions, shells, the waiting note.
  for (const c of live) {
    const k = key(c),
      runAgent = AGENTS.find((a) => a === c.pty?.agent) ?? AGENTS.find((a) => c.tags?.includes(a)) ?? undefined;
    for (const t of stageTabs(c, named(runAgent))) out.push({ id: "agent:" + t.key, kind: "agent", agent: runAgent, title: t.title, key: t.key });
    for (const sh of shells.filter((x) => x.run === k)) out.push({ id: "sh:" + sh.key, kind: sh.agent ? "agent" : "shell", agent: sh.agent || undefined, title: sh.title, key: sh.key });
    // The run's own session is running in another terminal: a tab that says so.
    if (elsewhere.has(k)) out.push({ id: "wait:" + k, kind: "wait", agent: "claude", title: named("claude") });
  }
  // The workspace's own shells and agents, and those of its finished runs.
  const owned = new Set(store.S.cards.filter((c) => c.state === ctx!.dir && wsOfCard(c) === ctx!.ws).map(key));
  for (const sh of shells.filter((x) => x.run === ctx!.k || (owned.has(x.run) && !liveKeys.has(x.run))))
    out.push({ id: "sh:" + sh.key, kind: sh.agent ? "agent" : "shell", agent: sh.agent || undefined, title: sh.title, key: sh.key });
  // Opened by hand: History, localhost, Preview, notes.
  const mine = s.tabs.map((t) => (t.kind === "local" ? { ...t, title: "Browser" } : t)); // "local" was saved before the rename
  const all = [...out.filter((t) => !s.hidden.includes(t.id)), ...mine];
  return all.filter((t, i) => all.findIndex((x) => x.id === t.id) === i);
}
// An agent's tab shows the agent's own mark when the sprite has one.
const icon = (t: Tab) =>
  t.agent && MARKS.includes(t.agent) ? raw(`<svg><use href="#i-${t.agent}"/></svg>`) : ico({ agent: "ai", shell: "term", local: "link", preview: "eye", note: "note", wait: "ai", history: "note" }[t.kind]);
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
  if (fresh && !was.has(k)) was.set(k, new Set(mineNow().filter(reviewing).map(key))); // what is already in review does not open the Browser
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
  // Every navigation (a notification, a Board card, a link) picks the card's run in the panel, even for an address already open: a finished run opens read-only.
  // A fresh visit forgets the old pick (waiting first again); one made during the visit stays.
  if (fresh) picked.delete(k);
  if (want?.kind === "run" && (nav || fresh)) picked.set(k, key(want));
  // A workspace with nothing open starts a shell in its folder (no agent, no run). A live run whose own Claude
  // session is not open anywhere on the board is resumed here, once per visit.
  if (!noPty) {
    if (!tabs().length && !autoShell.has(k)) return void (autoShell.add(k), newPty());
    // Not while a launch from the board is coming up: its terminal is not tied to the new run card yet, and
    // resuming the run here would open a second agent on the same session beside it (the stray "Agent" tab).
    const launching = !!store.wantPty && Date.now() - store.wantPty.at < 20_000;
    if (want && want.kind === "run" && !finished(want) && !want.pty && !launching && !shells.some((x) => x.run === key(want)) && !autoShell.has(key(want))) {
      autoShell.add(key(want));
      void openAgent(want, false, false);
    }
  }
  if (!showTerm()) draw();
}
// The terminal the sidebar asked for, selected once the workspace's tabs are known.
let wantTerm: string | null = null;
function showTerm() {
  // A launch from the board names its terminal (store.wantPty): it is selected once its tab exists,
  // and the ask lapses after a while so a launch that never came up cannot pull focus later.
  const w = store.wantPty && Date.now() - store.wantPty.at < 20_000 ? store.wantPty.key : null;
  if (store.wantPty && !w) store.wantPty = null;
  const t = tabs().find((x) => x.key === (wantTerm || w));
  wantTerm = null;
  if (t && store.wantPty?.key === t.key) store.wantPty = null;
  return !!t && (show(t.id), true);
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
  const menu = html`<div class="menu-pop">${PTY && dflt ? html`<button data-n="agent:${dflt.cmd}">${mark(dflt)}<span>New agent here<small>${dflt.name} in this folder</small></span></button>` : ""}${PTY ? html`<button data-n="shell">${ico("term")}<span>Shell<small>a terminal in this folder</small></span></button>` : ""}<button data-n="local">${ico("link")}<span>Browser<small>localhost pages, e.g. the dev server</small></span></button><button data-n="preview">${ico("eye")}<span>Preview<small>the run's Preview</small></span></button><button data-n="history">${ico("note")}<span>History<small>finished runs in this workspace</small></span></button>${PTY ? agents.filter((a) => a !== dflt).map((a) => html`<button data-n="agent:${a.cmd}">${mark(a)}<span>${a.name} session<small>the agent alone, no run</small></span></button>`) : ""}</div>`;
  $("rtabs").innerHTML = String(
    html`${scs.map((sc) => {
      const ids = leaves(sc.tree),
        first = item(ids[0]),
        title = ids.map((id) => item(id).title).join(" + ");
      return html`<button class="rtab${sc.id === s.on ? " on" : ""}" data-t="${sc.id}" draggable="true" title="${title}">${icon(first)}<span>${title}</span><i data-xs="${sc.id}" role="button" aria-label="Close ${title}" title="Close tab">×</i></button>`;
    })}<details class="radd" data-mode="tab"><summary class="rbtn" title="New tab" aria-label="New tab">${ico("plus")}</summary>${menu}</details><span class="sp"></span>${cur ? html`<details class="radd rsplit" data-mode="cols"><summary class="rbtn" title="Split right: add to this tab" aria-label="Split right">${ico("lcols")}</summary>${menu}</details><details class="radd rsplit" data-mode="rows"><summary class="rbtn" title="Split down: add to this tab" aria-label="Split down">${ico("lrows")}</summary>${menu}</details>` : ""}`,
  );
  $("rside").setAttribute("aria-pressed", String(document.body.classList.contains("rflip")));
  $("rtabs").querySelector(".rtab.on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  // Panes: made once per item, kept (hidden) while it is open, so terminals never reconnect.
  const box = $("rpanes");
  for (const [id, p] of panes)
    if (!ts.some((t) => t.id === id)) {
      p.off?.();
      p.el.remove();
      panes.delete(id);
    }
  for (const t of ts) if (!panes.has(t.id)) makePane(t);
  const shown = cur ? leaves(cur.tree) : [];
  for (const [id, p] of panes) {
    p.el.hidden = !shown.includes(id);
    p.el.classList.toggle("split", shown.length > 1);
    p.el.classList.toggle("focus", shown.length > 1 && id === cur?.focus);
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
  mountPanel();
  wire();
}

// The run panel (#panel) stays docked on the right of the centre and shows one run: the one picked
// in its header (run-pick.ts), first the run waiting on you, else the newest. A pick is sticky; a
// run that starts waiting later does not replace it: the picker's trigger and, with the panel
// collapsed, the panel button show a dot. With no run the panel is parked.
const picked = new Map<string, string>();
let pickOpen = false;
// Shows a run in the panel (a picker row, a History row); the centre stays as it is.
const pickRun = (k: string) => (picked.set(ctx!.k, k), draw()); // the sidebar count asked for the picker dropped down
function mountPanel() {
  const live = pickable(store.S.cards, ctx!.dir, ctx!.ws, wsOfCard),
    hist = historyOf(store.S.cards, ctx!.dir, ctx!.ws, wsOfCard),
    c = chosen(live, hist, picked.get(ctx!.k), key);
  $("panel").classList.toggle("parked", !c);
  $("rside").hidden = !c;
  // Collapsed (a phone: sheet down) and a run waits: a dot on the panel button, no pop-open.
  $("rside").toggleAttribute("data-dot", document.body.classList.contains("rflip") !== isPhone() && live.some(awaiting));
  if (!c) return void ((card = null), (pickOpen = false), hidePick());
  picked.set(ctx!.k, key(c));
  $("panel").classList.toggle("ro", hist.includes(c)); // a run from History: no edit buttons (the commit and push ones stay)
  card = c;
  drawPick(live, hist, c);
  if (store.openKey !== key(c)) void open(c, false);
  if (pickOpen) (setOpen(true), (pickOpen = false));
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
        // A frame under the pointer (the Browser, Preview) takes the moves for itself: frames ignore it while dragging.
        document.body.classList.add("rdrag");
        g.onpointermove = (m) => {
          const f = Math.min(0.9, Math.max(0.1, ((horiz ? m.clientX : m.clientY) - start) / total));
          n.sizes[i - 1] = sum * f;
          n.sizes[i] = sum * (1 - f);
          a.style.flexGrow = String(n.sizes[i - 1]);
          b.style.flexGrow = String(n.sizes[i]);
        };
        g.onpointerup = g.onlostpointercapture = () => {
          if (!g.onpointermove) return;
          document.body.classList.remove("rdrag");
          g.onpointermove = g.onpointerup = g.onlostpointercapture = null;
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
  if (t.kind === "history") {
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

// The Browser tab: a URL bar over an iframe. The address is kept per workspace; a run's
// Preview sets it when the run reaches review (autoBrowse).
function browser(el: HTMLElement) {
  const k = "kz-browse:" + ctx!.k;
  let url = "http://localhost:3000";
  try {
    url = localStorage.getItem(k) || url;
  } catch {}
  const back: string[] = [],
    fwd: string[] = [];
  el.insertAdjacentHTML(
    "beforeend",
    String(html`<form class="urlbar"><button type="button" data-b="back" title="Back" aria-label="Back">‹</button><button type="button" data-b="fwd" title="Forward" aria-label="Forward">›</button><button type="button" data-b="reload" title="Reload" aria-label="Reload">${ico("refresh")}</button><input class="sel" aria-label="Address" spellcheck="false" value="${url}"><a class="rwin" data-b="tab" target="_blank" rel="noopener" href="${url}" title="Open in a new browser tab">${ico("popout")}<span>New tab</span></a></form>`),
  );
  const f = el.querySelector("form")!,
    inp = f.querySelector("input")!,
    ext = f.querySelector<HTMLAnchorElement>("a.rwin");
  (el as any).browseTo = (u: string) => go(u);
  // On a phone over the tailnet, localhost is the phone itself: framing it shows nothing useful.
  const local = (u) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(u);
  const frame = document.createElement("iframe");
  frame.className = "rframe";
  frame.title = "Browser";
  // Dev apps run; a framed page cannot navigate the board itself (no allow-top-navigation).
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads");
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
        // The fallback card: the page refuses to be framed, so offer it outside the board.
        note.textContent = "";
        note.insertAdjacentHTML("beforeend", String(html`<b>This page refuses to be shown inside the board</b>${new URL(u).host} sends a header that forbids framing. <a class="rwin" target="_blank" rel="noopener" href="${u}">${ico("popout")}<span>Open in new tab</span></a>${winBtn(u)}`));
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
// One labelled button: a Chromium app window on the board's computer, for loopback pages only.
const winBtn = (u: string) =>
  loopback && loopbackUrl(u)
    ? html`<button type="button" class="rwin" data-b="win" title="Open in an app window">${ico("popout")}<span>Open in app window</span></button>`
    : "";
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
  const url = loopbackUrl(pv);
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
  if (id.startsWith("sh:")) {
    await post("/pty/exit", { key: id.slice(3) });
    shells = shells.filter((x) => "sh:" + x.key !== id);
  } else if (id.startsWith("agent:")) {
    // Closing the tab ends the agent, so the sidebar stops listing it; one mid-turn asks first.
    const k = id.slice(6),
      a = store.S.agents?.find((x) => x.key === k);
    if (a?.busy && !confirm("This agent is still working. End it?")) return;
    s.hidden.push(id);
    await post("/pty/exit", { key: k });
    load(true);
  }
  else if (id.startsWith("wait:")) elsewhere.delete(id.slice(5));
  else s.tabs = s.tabs.filter((t) => t.id !== id);
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
      else if (n === "local") addTab({ id: "local", kind: "local", title: "Browser" });
      else if (n === "history") addTab({ id: "history", kind: "history", title: "History" });
      else openPreview();
      return;
    }
  };
  $("rside").onclick = () => {
    document.body.classList.toggle("rflip");
    draw();
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
    const hist = (e.target as HTMLElement).closest<HTMLElement>("[data-hist]")?.dataset.hist;
    if (hist && byKey(hist)) return pickRun(hist);
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
  $("panel").classList.add("parked");
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

// The keys of the workspace's runs that were at review/done on the last tick, per workspace.
const was = new Map<string, Set<string>>();
// A run in the open workspace moves into review or done with a localhost address in its ## Preview:
// the Browser opens on it, once per run. The first tick of a workspace only records.
const mineNow = () => store.S.cards.filter((c) => c.state === ctx!.dir && wsOfCard(c) === ctx!.ws);
async function autoBrowse() {
  if (!ctx) return;
  const k = ctx.k,
    mine = mineNow(),
    prev = was.get(k);
  was.set(k, new Set(mine.filter(reviewing).map(key)));
  if (!prev) return;
  for (const c of toOpen(mine, prev, saved().seen ?? [], key)) {
    let u: string | undefined;
    try {
      const doc = await (await fetch(`/run/${encodeURIComponent(c.id)}?dir=${encodeURIComponent(c.state)}`)).json();
      u = loopbackUrl(preview(doc.impl));
    } catch {}
    if (!u || ctx?.k !== k || saved().seen?.includes(key(c))) continue;
    (saved().seen ||= []).push(key(c));
    try {
      localStorage.setItem("kz-browse:" + k, u);
    } catch {}
    addTab({ id: "local", kind: "local", title: "Browser" });
    (panes.get("local")?.el as any)?.browseTo?.(u);
  }
}

// A phone's run sheet: drag it down from anywhere its content is at the top, or tap outside it.
function initSheet() {
  const p = $("panel"),
    b = document.body;
  const on = () => isPhone() && b.classList.contains("runv") && b.classList.contains("rflip");
  const shut = () => $("pclose").click();
  let y0: number | null = null,
    t0 = 0,
    dy = 0;
  const scrolled = (t: EventTarget | null) => ((t as Element).closest?.(".body")?.scrollTop ?? 0) > 0;
  p.addEventListener(
    "touchstart",
    (e) => {
      y0 = on() && e.touches.length === 1 && !scrolled(e.target) ? e.touches[0].clientY : null;
      t0 = Date.now();
      dy = 0;
    },
    { passive: true },
  );
  p.addEventListener(
    "touchmove",
    (e) => {
      if (y0 === null) return;
      if (scrolled(e.target)) return void (y0 = null);
      dy = e.touches[0].clientY - y0;
      // A finger drifts a few pixels in a tap; taking those as a drag would cancel its click.
      if (dy <= 10) return void (p.style.translate = "");
      e.preventDefault();
      p.style.transition = "none";
      p.style.translate = `0 ${dy}px`;
    },
    { passive: false },
  );
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    p.style.transition = "";
    if (dy > 100 || (dy > 30 && Date.now() - t0 < 250)) {
      p.style.translate = "0 100%";
      setTimeout(() => (shut(), (p.style.translate = "")), 180);
    } else p.style.translate = "";
  };
  p.addEventListener("touchend", end);
  p.addEventListener("touchcancel", end);
  addEventListener("click", (e) => on() && !(e.target as Element).closest?.("#panel,#rside,dialog,.toast") && shut());
}

export function initRunView() {
  // A phone's sheet closes with the panel's ×, which here hides the sheet rather than closing the card.
  document.addEventListener(
    "click",
    (e) => {
      if (!document.body.classList.contains("runv") || !(e.target as Element).closest?.("#pclose")) return;
      e.stopPropagation();
      document.body.classList.remove("rflip");
      setOpen(false);
    },
    true,
  );
  initSheet();
  initPick(pickRun);
  // The sidebar's agent mark: open that workspace with the agent's terminal tab selected.
  addEventListener("kz-open-term", (e: any) => {
    e.preventDefault();
    const { dir, ws, key } = e.detail;
    wantTerm = key;
    if (ctx?.k === wsKey(dir, ws) && document.body.classList.contains("runv")) return void showTerm();
    history.pushState(null, "", wsHref(dir, ws));
    markCurrent();
    go("ws");
  });
  // Search's Tabs group: open the workspace on the screen holding that tab.
  addEventListener("kz-open-tab", (e: any) => {
    e.preventDefault();
    const { dir, ws, id } = e.detail;
    const k = wsKey(dir, ws),
      s = ALL[k],
      sc = s?.screens?.find((x) => leaves(x.tree).includes(id));
    if (sc) (s.on = sc.id), save();
    if (ctx?.k === k && document.body.classList.contains("runv")) return void draw();
    history.pushState(null, "", wsHref(dir, ws));
    markCurrent();
    go("ws");
  });
  addEventListener("kz-run-preview", openPreview);
  $("pnotes").onclick = () => void projectNotes();
  $("pnlist").onclick = (e) => {
    const n = (e.target as HTMLElement).closest<HTMLElement>("[data-note]")?.dataset.note;
    if (n) openNoteTab(n);
  };
  // A /state change: new or ended sessions, the card's own state. Panes stay mounted.
  addEventListener("kz-state", () => {
    void autoBrowse();
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
