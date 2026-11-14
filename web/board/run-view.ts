// The workspace centre (?view=ws&dir=&ws=; a run's or task's old address resolves to its
// workspace and picks that run in the panel): a tab bar over one folder holding terminals and the
// Browser, never runs. Agent terminals are tabs, named by stage for a run's ("Build · Claude"),
// beside shells started with POST /shell {ws}, the project's localhost, the Preview, project
// notes and History (finished runs, read-only in the panel). The run panel (#panel, drawn by
// panel.ts) docks on the right and shows one run, chosen in its picker (run-pick.ts); the centre
// never follows it. A workspace with no tab opens a shell in its folder. Terminal tabs are
// kzTerm mounts on /pty that live as long as their tab, so a tab switch or a /state tick never
// reconnects them. Split right or down shows a second tab beside the first, sized with the
// Terminal page's handles. The panes, their layout and the Browser tab are React (components/run/run-panes.tsx, the
// layout in lib/run/layout-store.ts); this module knows which items the workspace has, starts and ends sessions, and
// answers the keyboard.
import { ask } from "@lib/core";
import { pick } from "./projects.ts";
import { store } from "./store.ts";
import { toast } from "./toast.ts";
import { $, html, ico, raw } from "./dom.ts";
import { key } from "./cards.ts";
import { open } from "./panel.ts";
import { load, post } from "./api.ts";
import { attach, md, preview } from "./markdown.ts";
import { cardHref, markCurrent, railData, stateOf, titleOf, wsHref, wsOfCard } from "./workspace.ts";
import { awaiting, chosen, devUrl, dueWord, finished, gitDue, historyOf, leaves, liveIn, loopbackUrl, migrate, newRun, pickable, previewIn, previewOpens, reviewing, stageTabs, toOpen, wsKey } from "./ws-tabs.ts";
import { age } from "./labels.ts";
import { go } from "./views.ts";
import { isPhone } from "./phone.ts";
import { annotator } from "./annotate.ts";
import { react } from "./views.ts";
import { boxesOf, detach, focusItem, keepUrl, layoutOf, moveInLayout, nearestPane, openAppWindow, patch, placeItems, refreshPreview, replaceAll, requestBrowse, clearBrowse, rects, selectScreen, setDragging, setRunActions, setRunView, setTarget, showItem, useLayout, type Saved, type SavedTab } from "@lib/run";

type Tab = SavedTab & { kind: "agent" | "shell" | "local" | "preview" | "note" | "wait" | "history" };
// Per workspace the saved layout (lib/run/layout-store.ts): the extra items opened (localhost, preview, notes, History),
// tabs closed, and the screens. A screen is one tab of the bar: one or more items side by side or stacked.
// The workspace shown, and the card whose panel is up (the picker's).
let ctx: { dir: string; ws: string; k: string } | null = null;
let card: any = null;
let shells: any[] = [];
let noPty = false;
// Every agent installed for this project (from /agents), each offered as a bare session.
let agents: { name: string; cmd: string; yolo?: boolean; bypassDefault?: boolean }[] = [];
let defAgent = "";
const byKey = (k: string) => store.S.cards.find((x) => key(x) === k);
// The shown workspace's saved layout, and a change to it.
const saved = (): Saved => layoutOf(ctx!.k);
const edit = (fn: (s: Saved) => Saved) => patch(ctx!.k, fn);
const screens = () => saved().screens;
const loopback = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

const AGENTS = ["claude", "codex", "gemini", "agy", "opencode", "cursor"];
const wsCards = () => (ctx ? liveIn(store.S.cards, ctx.dir, ctx.ws, wsOfCard) : []);

function tabs(): Tab[] {
  const out: Tab[] = [];
  const named = (a?: string) => agents.find((x) => x.cmd === a)?.name ?? "Agent";
  const live = wsCards(),
    liveKeys = new Set(live.map(key));
  // A finished run's agent that is still open keeps its tab, as the sidebar keeps it.
  const open = store.S.cards.filter((c) => c.state === ctx!.dir && wsOfCard(c) === ctx!.ws && !liveKeys.has(key(c)) && c.pty?.alive);
  // Each live run's terminals: its stage terminals ("Build · Claude"), other sessions, shells, the waiting note.
  for (const c of [...live, ...open]) {
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
  // A closed agent tab stays hidden only for that agent: one started again under the same key (a resume) is a new
  // agent (born differs) and the sidebar lists it, so its tab comes back.
  for (const a of store.S.agents ?? []) {
    const id = "agent:" + a.key,
      hb = saved().hb;
    if (hb && id in hb && hb[id] !== (a.born ?? 0))
      edit((s) => ({ ...s, hidden: s.hidden.filter((h) => h !== id), hb: Object.fromEntries(Object.entries(s.hb ?? {}).filter(([x]) => x !== id)) }));
  }
  const s = saved(),
    mine = s.tabs.map((t) => (t.kind === "local" ? { ...t, title: "Browser" } : t)) as Tab[]; // "local" was saved before the rename
  const all = [...out.filter((t) => !s.hidden.includes(t.id)), ...mine];
  return all.filter((t, i) => all.findIndex((x) => x.id === t.id) === i);
}
const elsewhere = new Set<string>();

let switched: string | null = null; // the project a deep link last switched the board to
const none = (t: string) => setRunView({ message: t });
// Called by go("run") and on every /state: draws the tab strip and keeps the panes.
export async function showRunView(nav = false) {
  const p = new URLSearchParams(location.search),
    dir = p.get("dir"),
    id = p.get("id"),
    task = p.get("idea");
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
    const find = (cs) => cs.find((x) => x.state === dir && (id ? x.kind === "run" && x.id === id : x.kind === "idea" && x.text === task));
    const c = find(store.S.cards);
    // A launched task becomes a run: its agent session moves to the run's card, and the view follows.
    const pk = task && (c ?? card)?.kind === "idea" && (c ?? card)?.pty?.key;
    const run = pk && store.S.cards.find((x) => x.kind === "run" && x.state === dir && (x.pty?.key === pk || x.pty?.all?.includes(pk)));
    if (run) {
      history.replaceState(null, "", cardHref(run));
      markCurrent();
      return showRunView(nav);
    }
    if (!c) {
      if (await away()) return showRunView(nav);
      if (!store.all && find(railData().cards)) location.href = "/?all=1&" + p.toString();
      else (stopPanes(), (ctx = card = null), none(`That ${id ? "run" : "idea"} was not found.`));
      return;
    }
    want = c;
    ws = wsOfCard(c);
  }
  if (!dir || !ws) return void (stopPanes(), (ctx = card = null), none("That workspace was not found."));
  const k = wsKey(dir, ws);
  const fresh = ctx?.k !== k;
  // Each workspace has its own centre: switching unmounts this one's panes (its shells keep running on the server).
  if (fresh) (stopPanes(), (card = null), (ctx = { dir, ws, k }));
  if (fresh && !was.has(k)) was.set(k, new Set(mineNow().filter(reviewing).map(key))); // what is already in review does not open the Browser
  if (fresh) seenRuns.set(k, new Set(mineNow().map(key))); // what is here on arrival is not new
  if (fresh) previewAt.delete(k); // nor is a preview: arriving only records it
  // The header titles a phone's workspace: the run, else the branch.
  const w = railData().projects?.find((x) => x.dir === dir)?.workspaces?.find((x) => x.path === ws);
  document.querySelector(".hdr h1")!.textContent = want ? titleOf(want) : w?.branch || ws.split(/[\\/]/).pop() || "Workspace";
  // Layouts saved per run before workspaces move to their workspace; keys no card owns stay.
  if (store.S.cards.some((c) => key(c) in useLayout.getState().all)) {
    const all = structuredClone(useLayout.getState().all);
    if (migrate(all as any, store.S.cards, key, wsOfCard)) replaceAll(all);
  }
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
  // Asked for by name (the sidebar's mark, a launch): shown even if its tab was closed before.
  const want = wantTerm || w;
  if (want) edit((s) => ({ ...s, hidden: s.hidden.filter((h) => h !== "agent:" + want && h !== "sh:" + want) }));
  const t = tabs().find((x) => x.key === want);
  wantTerm = null;
  if (t && store.wantPty?.key === t.key) store.wantPty = null;
  return !!t && (show(t.id), true);
}
const autoShell = new Set<string>();

function draw() {
  const ts = tabs();
  // Every item sits in exactly one screen: new ones are placed, closed ones leave.
  placeItems(ctx!.k, ts.map((t) => t.id));
  const s = saved(),
    scs = s.screens,
    cur = scs.find((sc) => sc.id === s.on);
  const item = (id: string) => ts.find((t) => t.id === id)!;
  // The chrome and the panes are React (components/run): they are handed what to show, never an element. A pane is
  // made once per item and kept (hidden while its screen is not shown), so terminals never reconnect.
  const now = Date.now();
  setRunView({
    message: null,
    screens: scs.map((sc) => {
      const ids = leaves(sc.tree),
        { id, kind, title, agent } = item(ids[0]);
      return { id: sc.id, ids, focus: sc.focus, title: ids.map((x) => item(x).title).join(" + "), first: { id, kind, title, agent } };
    }),
    on: s.on,
    split: !!cur,
    agents,
    defAgent,
    pty: !noPty,
    titles: Object.fromEntries(ts.map((t) => [t.id, t.title])),
    items: ts,
    wsk: ctx!.k,
    ws: ctx,
    history: historyOf(store.S.cards, ctx!.dir, ctx!.ws, wsOfCard).map((c) => ({ k: key(c), title: titleOf(c), state: stateOf(c), line: `${c.status} · ${age(c.moved ?? now, now)} ago` })),
    empty: !scs.length,
  });
  $("rside").setAttribute("aria-pressed", String(document.body.classList.contains("rflip")));
  requestAnimationFrame(() => $("rtabs").querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  mountPanel();
}

// The run panel (#panel) stays docked on the right of the centre and shows one run: the one picked
// in its header (run-pick.ts), first the run waiting on you, else the newest. A pick is sticky; a
// run that starts waiting later does not replace it: the picker's trigger and, with the panel
// collapsed, the panel button show a dot. Only a run created during the visit takes the pick
// (followNew). With no run the panel is parked.
const picked = new Map<string, string>();
// Every card seen in the workspace this visit. It only grows, so a restored run or a /state tick
// missing cards never reads as new.
const seenRuns = new Map<string, Set<string>>();
function followNew() {
  const seen = ctx && seenRuns.get(ctx.k);
  if (!seen) return;
  const c = newRun(pickable(store.S.cards, ctx!.dir, ctx!.ws, wsOfCard), seen, key);
  for (const m of mineNow()) seen.add(key(m));
  if (c) picked.set(ctx!.k, key(c));
}
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
  if (!c) return void ((card = null), setRunView({ picker: null }));
  picked.set(ctx!.k, key(c));
  $("panel").classList.toggle("ro", hist.includes(c)); // a run from History: no edit buttons (the commit and push ones stay)
  card = c;
  // The picker is React (components/run/run-picker.tsx): the run shown, a dot when another needs you, the runs, then History.
  const now = Date.now(),
    row = (r) => ({ k: key(r), title: titleOf(r), state: stateOf(r), line: `${gitDue(r) ? `waiting on you · ${dueWord(r)}` : awaiting(r) ? "needs you" : r.status} · ${age(r.moved ?? now, now)}` });
  setRunView({ picker: { cur: row(c), live: live.map(row), hist: hist.map(row), other: live.some((r) => r !== c && awaiting(r)) } });
  if (store.openKey !== key(c)) void open(c, false);
}
// Moves an item out of its tab into another one (split beside a pane there, or next to its
// focused pane), or into a tab of its own (to = null). Terminals keep running and frames stay loaded.
function moveItem(id: string, to: string | null, at?: { pane: string; dir: "cols" | "rows"; before: boolean }) {
  if (moveInLayout(ctx!.k, id, to, at)) draw();
}

// A Chromium app window on the board's computer (POST /open-url): for dev servers that
// refuse to be framed. Only offered when the page itself is on that computer.
// One labelled button: a Chromium app window on the board's computer, for loopback pages only.
const winBtn = (u: string) =>
  loopback && loopbackUrl(u)
    ? html`<button type="button" class="rwin" data-b="win" title="Open in an app window">${ico("popout")}<span>Open in app window</span></button>`
    : "";
async function openWindow(u: string) {
  const why = await openAppWindow(u);
  if (why) toast(why);
}

// The run's Preview: its screenshots (each opens the image viewer on click), with an Open
// app link when it names a localhost address. The address is framed only when the Preview
// has no images: the dev server a run used is often gone, and a dead frame hides the proof.
// No run, no `## Preview`: what an agent last showed with `kaizen preview <image|url>` in this workspace.
async function directPreview(el: HTMLElement) {
  if (!ctx) return false;
  const p = await fetchPreview(ctx.dir, ctx.ws);
  if (!p) return false;
  const u = p.image ? fileUrl(ctx.dir, p.image) : p.url!;
  el.insertAdjacentHTML("beforeend", String(p.image ? html`<div class="rprev"><figure><img src="${u}" alt="Latest change" style="max-width:100%"><figcaption>${p.image.split("/").pop()}</figcaption></figure></div>` : html`<iframe class="rframe" title="Preview" src="${u}"></iframe>`));
  return true;
}
async function previewPane(el: HTMLElement) {
  let doc = store.runDoc && store.runDoc.id === card?.id ? store.runDoc : null;
  if (!doc && card?.kind === "run")
    try {
      doc = await (await fetch(`/run/${encodeURIComponent(card.id)}?dir=${encodeURIComponent(card.state)}`)).json();
    } catch {}
  const pv = doc && preview(doc.impl);
  if (!pv && (await directPreview(el))) return;
  const url = loopbackUrl(pv);
  const shots = pv && /!\[[^\]]*\]\(/.test(pv);
  if (url && loopback && !shots) return void el.insertAdjacentHTML("beforeend", String(html`<iframe class="rframe" title="Preview" src="${/^https?:\/\//i.test(String(url)) ? url : "about:blank"}"></iframe>`));
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
  if (!saved().tabs.some((x) => x.id === t.id)) edit((s) => ({ ...s, tabs: [...s.tabs, t] }));
  // Already open somewhere: moving it into the target screen means taking it out of its old one.
  else if (useLayout.getState().target) detach(ctx!.k, t.id);
  show(t.id);
}
// Automatic opens (a run's Preview, `kaizen preview`) bring a tab forward only when it is not open yet;
// an open one just navigates, so the user can leave it.
const autoTab = (t: Tab) => { if (!saved().tabs.some((x) => x.id === t.id)) addTab(t); };
// After an item is added: place it (which uses the split target) and show the screen holding it.
function show(id: string) {
  placeItems(ctx!.k, tabs().map((t) => t.id));
  showItem(ctx!.k, id);
  draw();
}
export const openNoteTab = (name: string) => addTab({ id: "note:" + name, kind: "note", title: name.slice(name.lastIndexOf("/") + 1), note: name });
const openPreview = () => {
  addTab({ id: "preview", kind: "preview", title: "Preview" });
  if (isPhone()) $("pclose").click(); // Preview is a centre tab: the sheet would sit over it
};

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

// `yolo` only when the + menu's switch was flipped; otherwise the server applies that agent's saved setting.
async function newPty(agent?: string, yolo?: boolean) {
  const r = await fetch("/shell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir: ctx!.dir, ws: ctx!.ws, run: ctx!.k, ...(agent ? { agent, yolo } : {}) }) });
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

// The Run app button (play icon; the + menu's Preview is the run's Preview tab): the workspace's app in the Browser tab. A dev server already listening
// opens at once; otherwise the board starts the folder's dev script in a terminal here, waits
// for its port, then opens it. No dev script: the run's Preview (report and screenshots).
let starting = false;
async function previewApp() {
  if (!ctx || starting) return;
  const c = ctx;
  const ports = async (): Promise<number[]> => {
    try {
      return await (await fetch("/devports?ws=" + encodeURIComponent(c.ws))).json();
    } catch {
      return [];
    }
  };
  // The newest run here names the page to open (its ## Preview), when it has one.
  const card = store.S.cards.filter((x) => x.state === c.dir && wsOfCard(x) === c.ws && x.id).sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
  let pv = "";
  try {
    if (card) pv = preview((await (await fetch(`/run/${encodeURIComponent(card.id)}?dir=${encodeURIComponent(c.dir)}`)).json()).impl) ?? "";
  } catch {}
  const openAt = (u: string) => {
    try {
      localStorage.setItem("kz-browse:" + c.k, u);
    } catch {}
    addTab({ id: "local", kind: "local", title: "Browser" });
    requestBrowse(c.k, u);
  };
  const now = await ports();
  if (now.length) return openAt(devUrl(pv, now)!);
  const u = devUrl(pv, []);
  const r = await fetch("/shell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir: c.dir, ws: c.ws, run: c.k, dev: true }) }).catch(() => null);
  if (!r?.ok) {
    let why = "";
    try {
      why = (await r!.json()).error;
    } catch {}
    toast(why ? `Preview: ${why}` : "Preview: the dev server did not start");
    return openPreview();
  }
  const sh = await r.json();
  if (!shells.some((x) => x.key === sh.key)) shells.push(sh);
  draw();
  starting = true;
  toast("Starting the app…");
  try {
    // Up to a minute for the first port; Linux only reads ports, elsewhere the run's address after a pause.
    for (let i = 0; i < 40 && ctx?.k === c.k; i++) {
      await new Promise((ok) => setTimeout(ok, 1500));
      const p = await ports();
      if (p.length) return openAt(devUrl(pv, p)!);
      if (i === 5 && u && !navigator.platform.startsWith("Linux")) return openAt(u);
    }
    if (ctx?.k === c.k) toast("The app did not open a port. Its terminal tab shows why.");
  } finally {
    starting = false;
  }
}

async function closeTab(id: string) {
  const wk = ctx!.k;
  if (id.startsWith("sh:")) {
    await post("/pty/exit", { key: id.slice(3) });
    shells = shells.filter((x) => "sh:" + x.key !== id);
  } else if (id.startsWith("agent:")) {
    // Closing the tab ends the agent, so the sidebar stops listing it; one mid-turn asks first.
    const k = id.slice(6),
      a = store.S.agents?.find((x) => x.key === k);
    if (a?.busy && !(await ask({ title: "This agent is still working. End it?", confirmLabel: "End", danger: true }))) return;
    patch(wk, (s) => ({ ...s, hidden: [...s.hidden, id], hb: { ...s.hb, [id]: a?.born ?? 0 } }));
    await post("/pty/exit", { key: k });
    load(true);
  }
  else if (id.startsWith("wait:")) elsewhere.delete(id.slice(5));
  else patch(wk, (s) => ({ ...s, tabs: s.tabs.filter((t) => t.id !== id) }));
  if (ctx?.k === wk) draw();
}
// A tab's ×: everything in it closes (shells end, the agent is only hidden).
async function closeScreen(sid: string) {
  const sc = saved().screens.find((x) => x.id === sid);
  for (const id of sc ? leaves(sc.tree) : []) await closeTab(id);
}

// + makes a new tab; split right/down adds to the tab shown. `n` is a menu item's data-n.
function openNew(n: string, mode: string, yolo?: boolean) {
  const s = saved();
  setTarget(mode === "tab" || !s.on ? null : { screen: s.on, dir: mode as "cols" | "rows" });
  if (n === "shell") void newPty();
  else if (n.startsWith("agent:")) void newPty(n.slice(6), yolo);
  else if (n === "local") addTab({ id: "local", kind: "local", title: "Browser" });
  else if (n === "history") addTab({ id: "history", kind: "history", title: "History" });
  else openPreview();
}
// Ctrl+Space r / d: a second terminal like the focused one (same agent, or a shell), split right or down.
// Anything else (Browser, Preview, notes) has no copy to make, so the menu opens to pick from.
function likeFocused(): string | null {
  const sc = screens().find((x) => x.id === saved().on);
  const t = sc && tabs().find((x) => x.id === sc.focus);
  if (t?.kind === "shell") return "shell";
  if (t?.kind === "agent") return "agent:" + (t.agent ?? (defAgent || agents[0]?.cmd || ""));
  return null;
}
// Leaving the workspace: its terminals unmount; the shells keep running on the server.
function stopPanes() {
  $("panel").classList.add("parked");
  // No items, no workspace: every pane component unmounts (and with it its terminal).
  setRunView({ items: [], wsk: null, ws: null });
  clearBrowse();
}
export function runStop() {
  stopPanes();
  card = ctx = null;
  $("panel").classList.remove("pn");
}

// The strip's Project notes: the project's notes as a tree in the panel (components/run/project-notes.tsx); a note opens as a centre tab.
async function projectNotes() {
  if ($("panel").classList.toggle("pn") === false) return;
  setRunView({ notes: { loading: true } });
  try {
    const d = await (await fetch("/vault?dir=" + encodeURIComponent(ctx!.dir))).json();
    setRunView({ notes: { names: (d.notes ?? []).map((n) => n.name).sort() } });
  } catch {
    setRunView({ notes: { failed: true } });
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
      // Only an address the report names: with none, the lowest port in the workspace was a guess
      // (it once opened Claude Code's own local port, "not found").
      const pv = preview(doc.impl);
      if (!loopbackUrl(pv)) continue;
      u = devUrl(pv, await (await fetch("/devports?ws=" + encodeURIComponent(ctx.ws))).json());
    } catch {}
    if (!u || ctx?.k !== k || saved().seen?.includes(key(c))) continue;
    edit((s) => ({ ...s, seen: [...(s.seen ?? []), key(c)] }));
    keepUrl(k, u);
    autoTab({ id: "local", kind: "local", title: "Browser" });
    requestBrowse(k, u);
  }
}

// `kaizen preview <url|image>` (cli/preview.ts) wrote what an agent changed: the Browser tab opens
// on it, inside the board. Never an outside window. Only in the workspace it was written from, and
// only while you watch it: each visit's first look records the newest (`previewAt`, per visit), so a
// click, a switch or a reload never opens a tab, or reopens one you closed.
const previewAt = new Map<string, number>();
const fileUrl = (dir: string, image: string) => `${location.origin}/file?dir=${encodeURIComponent(dir)}&p=${encodeURIComponent(image)}`;
// The latest preview written for this workspace, or null.
async function fetchPreview(dir: string, ws: string) {
  let p: { url?: string; image?: string; ws?: string; at?: number } = {};
  try {
    p = await (await fetch("/preview?dir=" + encodeURIComponent(dir))).json();
  } catch {}
  return p.at && p.ws && previewIn(p.ws, ws) && (p.url || p.image) ? p : null;
}
async function pollPreview() {
  if (!ctx) return;
  const k = ctx.k, dir = ctx.dir;
  const p = await fetchPreview(dir, ctx.ws);
  if (ctx?.k !== k) return;
  const at = p?.at ?? 0, last = previewAt.get(k);
  if (last !== undefined && at <= last) return;
  previewAt.set(k, at);
  if (!p || !previewOpens(at, last)) return;
  if (p.image) {
    // A screenshot belongs in Preview; a live page in the Browser. An open Preview reads the new one.
    const open = saved().tabs.some((x) => x.id === "preview");
    autoTab({ id: "preview", kind: "preview", title: "Preview" });
    if (open) refreshPreview();
    return;
  }
  keepUrl(k, p.url!);
  autoTab({ id: "local", kind: "local", title: "Browser" });
  requestBrowse(k, p.url!);
}
setInterval(() => void pollPreview(), 3000);

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
  // composedPath, not target: a strip button redraws #ptabs in its own click, so by here
  // the target is detached and closest() would call a tap inside the sheet an outside one.
  addEventListener("click", (e) => on() && !e.composedPath().some((n) => (n as Element).matches?.("#panel,#rside,dialog,.toast,[data-sonner-toast]")) && shut());
}

// The keyboard, tmux style: Ctrl+Space puts focus in the current pane, then one more key
// moves it: arrows or hjkl between panes, 1-9, n, p between tabs.
const focusPane = (id?: string) => {
  // Looked up after the next frame: the pane may have just been shown.
  requestAnimationFrame(() => {
    const el = id ? [...$("rpanes").querySelectorAll<HTMLElement>(".rpane")].find((p) => p.dataset.t === id) : null;
    el?.querySelector<HTMLElement>("textarea,input,iframe")?.focus();
  });
};
const setPane = (id: string) => {
  focusItem(ctx!.k, id);
  draw();
  focusPane(id);
};
const DIRS = { ArrowLeft: "l", h: "l", ArrowRight: "r", l: "r", ArrowUp: "u", k: "u", ArrowDown: "d", j: "d" } as const;
function paneKey(k: string) {
  if (k === "?") {
    (document.activeElement as HTMLElement)?.blur(); // Escape closes it only from outside the terminal
    return void $("help").classList.add("on");
  }
  if (k === "x") {
    const sc = screens().find((x) => x.id === saved().on);
    if (sc) void closeTab(sc.focus).then(() => focusPane(screens().find((x) => x.id === saved().on)?.focus));
    return;
  }
  const mode = { c: "tab", r: "cols", d: "rows" }[k];
  const same = mode && mode !== "tab" && !noPty ? likeFocused() : null;
  if (same) return void openNew(same, mode!);
  if (mode) return void setRunView({ menu: mode as "tab" | "cols" | "rows" });
  const s = saved(),
    scs = screens(),
    at = scs.findIndex((x) => x.id === s.on),
    sc = scs[at];
  if (!sc) return;
  if (DIRS[k]) {
    const to = nearestPane(boxesOf(rects(sc.tree).panes), sc.focus, DIRS[k]);
    if (to) setPane(to);
    return;
  }
  const i = k === "n" ? (at + 1) % scs.length : k === "p" ? (at - 1 + scs.length) % scs.length : /^[1-9]$/.test(k) ? +k - 1 : -1;
  const to = scs[i];
  if (!to) return;
  selectScreen(ctx!.k, to.id);
  draw();
  focusPane(to.focus);
}
// While the prefix waits for its key, a chip says so and lists the keys (components/run/key-hint.tsx).
const keyHint = (on: boolean) => setRunView({ hint: on });
function initPaneKeys() {
  let armed: Timer | undefined;
  // Capture: xterm must not see these. Ctrl+B would reach an agent or a tmux inside the pane.
  addEventListener(
    "keydown",
    (e) => {
      if (!ctx || !document.body.classList.contains("runv") || document.querySelector("dialog[open]")) return;
      if (e.ctrlKey && !e.shiftKey && e.code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        focusPane(screens().find((x) => x.id === saved().on)?.focus);
        clearTimeout(armed);
        keyHint(true);
        armed = setTimeout(() => ((armed = undefined), keyHint(false)), 2000);
        return;
      }
      if (!armed || ["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(armed);
      armed = undefined;
      keyHint(false);
      paneKey(e.key);
    },
    true,
  );
}

export function initRunView() {
  initPaneKeys();
  // A phone's sheet closes with the panel's ×, which here hides the sheet rather than closing the card.
  document.addEventListener(
    "click",
    (e) => {
      if (!document.body.classList.contains("runv") || !(e.target as Element).closest?.("#pclose")) return;
      e.stopPropagation();
      document.body.classList.remove("rflip");
    },
    true,
  );
  initSheet();
  $("rside").onclick = () => {
    document.body.classList.toggle("rflip");
    draw();
  };
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
      sc = layoutOf(k).screens.find((x) => leaves(x.tree).includes(id));
    if (sc) selectScreen(k, sc.id);
    if (ctx?.k === k && document.body.classList.contains("runv")) return void draw();
    history.pushState(null, "", wsHref(dir, ws));
    markCurrent();
    go("ws");
  });
  addEventListener("kz-run-preview", openPreview);
  $("pnotes").onclick = () => void projectNotes();
  // The React parts of the run view: the tab bar, the panes, the panel's width grip and the project notes list.
  react.mountRunPart($("rtabs"), "tabs");
  react.mountRunPart($("rpanes"), "panes");
  react.mountRunPart($("panel"), "grip");
  react.mountRunPart($("pnlist"), "notes");
  setRunActions({
    select: (sid) => {
      selectScreen(ctx!.k, sid);
      draw();
    },
    close: (sid) => void closeScreen(sid),
    closeItem: (id) => void closeTab(id),
    openNew,
    runApp: () => void previewApp(),
    move: moveItem,
    drag: setDragging,
    dragging: () => useLayout.getState().dragging,
    drop: (to) => {
      const id = useLayout.getState().dragging;
      if (id) moveItem(id, to);
    },
    openHere: (k) => byKey(k) && void openAgent(byKey(k), true),
    pick: (k) => byKey(k) && pickRun(k),
    openNote: openNoteTab,
    termEnded: () => load(true),
    currentRun: () => (card?.id ? { dir: card.state, id: card.id } : null),
    mountPreview: (el) => void previewPane(el),
    annotate: (o) => annotator({ ...o, run: () => (card?.id ? { dir: card.state, id: card.id } : null) }),
  });
  // A /state change: new or ended sessions, the card's own state. Panes stay mounted.
  addEventListener("kz-state", () => {
    void autoBrowse();
    followNew();
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
