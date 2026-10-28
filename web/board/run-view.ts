// The run workspace (?view=run&dir=&id=, or &idea=<text> for an idea): the card's panel
// docked at the right as an icon strip (panel.ts draws it; open() fills it), and a tabbed
// centre: the run's agent, shells started with POST /shell, the project's localhost, the
// run's Preview and project notes. Terminal tabs are kzTerm mounts on /pty that live as
// long as their tab, so a tab switch or a /state tick never reconnects them. Split right
// or down shows a second tab beside the first, sized with the Terminal page's handles.
import { store } from "./store.ts";
import { toast } from "./toast.ts";
import { $, html, ico, raw } from "./dom.ts";
import { key } from "./cards.ts";
import { open } from "./panel.ts";
import { termLoad } from "./agent-term.ts";
import { load, post } from "./api.ts";
import { attach, md, preview } from "./markdown.ts";
import { layout } from "./terms.ts";
import { cardHref, railData } from "./workspace.ts";
import { go } from "./views.ts";

type Tab = { id: string; kind: "agent" | "shell" | "local" | "preview" | "note"; title: string; key?: string; note?: string };
// Per run: the extra tabs opened (localhost, preview, notes), agent tabs closed, the tab shown, the split.
type Saved = { tabs: Tab[]; hidden: string[]; on: string | null; split: { dir: "cols" | "rows"; other: string } | null };
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
let card: any = null;
let shells: any[] = [];
let noPty = false;
let agents: string[] = [];
// Tab id -> its pane, and for a terminal the function that unmounts it.
const panes = new Map<string, { el: HTMLElement; off: (() => void) | null }>();
const runKey = (c) => key(c);
const saved = (): Saved => (ALL[runKey(card)] ||= { tabs: [], hidden: [], on: null, split: null });
const loopback = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

function tabs(): Tab[] {
  const s = saved(),
    out: Tab[] = [];
  if (card.pty) out.push({ id: "agent:" + card.pty.key, kind: "agent", title: card.tags?.includes("codex") ? "Codex" : "Agent", key: card.pty.key });
  for (const sh of shells) out.push({ id: "sh:" + sh.key, kind: "shell", title: sh.title, key: sh.key });
  return [...out.filter((t) => !s.hidden.includes(t.id)), ...s.tabs];
}
const icon = (t: Tab) => ico({ agent: "ai", shell: "term", local: "link", preview: "eye", note: "note" }[t.kind]);

// Called by go("run") and on every /state: draws the tab strip and keeps the panes.
export async function showRunView() {
  const p = new URLSearchParams(location.search),
    dir = p.get("dir"),
    id = p.get("id"),
    idea = p.get("idea");
  const find = (cs) => cs.find((x) => x.state === dir && (id ? x.kind === "run" && x.id === id : x.kind === "idea" && x.text === idea));
  const c = find(store.S.cards);
  if (!c) {
    // A project this board is not showing: the all-projects board has it.
    if (!store.all && find(railData().cards)) location.href = "/?all=1&" + p.toString();
    else $("rtabs").innerHTML = String(html`<span class="rnone">That ${id ? "run" : "idea"} is not on this board.</span>`);
    return;
  }
  const fresh = !card || runKey(card) !== runKey(c);
  // Another run of the same project keeps the project's shell panes (and their sockets); draw() drops the rest.
  if (fresh && (!card || card.state !== c.state)) stopPanes();
  card = c;
  if (fresh || store.openKey !== key(c)) open(c);
  try {
    const r = await fetch("/shells?dir=" + encodeURIComponent(c.state));
    shells = r.ok ? await r.json() : [];
  } catch {}
  if (fresh) {
    try {
      agents = ((await (await fetch("/agents?dir=" + encodeURIComponent(c.state))).json()).agents ?? []).map((a) => a.cmd);
    } catch {}
  }
  if (card !== c) return;
  // Nothing to show (no board-launched agent, no shell, no tab saved): a shell in the project,
  // once per project, so the centre is never blank. No agent is ever started this way.
  if (!tabs().length && !noPty && !autoShell.has(c.state)) {
    autoShell.add(c.state);
    return void newPty();
  }
  draw();
}
const autoShell = new Set<string>();

function draw() {
  const s = saved(),
    ts = tabs();
  if (!ts.some((t) => t.id === s.on)) s.on = ts[0]?.id ?? null;
  if (s.split && (!ts.some((t) => t.id === s.split!.other) || s.split.other === s.on)) s.split = null;
  const name = (t: Tab) => t.title;
  const PTY = !noPty;
  $("rtabs").innerHTML = String(
    html`${ts.map((t) => html`<button class="rtab${t.id === s.on ? " on" : ""}${t.id === s.split?.other ? " sec" : ""}" data-t="${t.id}" title="${t.title}">${icon(t)}<span>${name(t)}</span><i data-x="${t.id}" role="button" aria-label="Close ${t.title}" title="Close">×</i></button>`)}<details class="radd"><summary class="rbtn" title="New tab" aria-label="New tab">${ico("plus")}</summary><div class="menu-pop">${PTY ? html`<button data-n="shell">${ico("term")}<span>New shell<small>a terminal in the project folder</small></span></button>` : ""}<button data-n="local">${ico("link")}<span>Open localhost<small>the project's dev server</small></span></button><button data-n="preview">${ico("eye")}<span>Open preview<small>the run's Preview</small></span></button>${PTY ? ["claude", "codex"].filter((a) => agents.includes(a)).map((a) => html`<button data-n="agent:${a}"><svg><use href="#i-${a}"/></svg><span>New ${a === "claude" ? "Claude" : "Codex"} session<small>the agent alone, no run</small></span></button>`) : ""}</div></details><span class="sp"></span><button class="rbtn rsplit" data-split="cols" title="Split right" aria-label="Split right">${ico("lcols")}</button><button class="rbtn rsplit" data-split="rows" title="Split down" aria-label="Split down">${ico("lrows")}</button><button class="rbtn" id="rside" title="Show or hide the run panel" aria-label="Show or hide the run panel" aria-pressed="${String(document.body.classList.contains("rflip"))}">${ico("open")}</button>`,
  );
  $("rtabs").querySelector(".rtab.on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  // Panes: made once per tab, kept while it is open.
  const box = $("rpanes");
  for (const [id, p] of panes)
    if (!ts.some((t) => t.id === id)) {
      p.off?.();
      p.el.remove();
      panes.delete(id);
    }
  for (const t of ts) if (!panes.has(t.id)) makePane(t);
  const shown = [s.on, s.split?.other].filter(Boolean) as string[];
  for (const [id, p] of panes) {
    p.el.hidden = !shown.includes(id);
    p.el.classList.toggle("split", !!s.split);
    // The mockup's slim pane line: "shell · split right ×" on the pane the split added.
    const t = ts.find((x) => x.id === id);
    if (t) p.el.querySelector(".ph span")!.textContent = t.title + (s.split && id === s.split.other ? ` · split ${s.split.dir === "cols" ? "right" : "down"}` : "");
    if (shown.includes(id) && box.children[shown.indexOf(id)] !== p.el) box.insertBefore(p.el, box.children[shown.indexOf(id)] || null);
  }
  box.querySelectorAll(".tsplit").forEach((h) => h.remove());
  if (s.split) layout(box, s.split.dir === "cols" ? [1, 1] : [1], s.split.dir === "rows" ? [1, 1] : [1], "run:" + s.split.dir, 9, true);
  else box.style.gridTemplateColumns = box.style.gridTemplateRows = "";
  // One empty note at most: every draw used to append another.
  box.querySelector(".rempty")?.remove();
  if (!ts.length) box.insertAdjacentHTML("beforeend", String(html`<div class="empty rempty"><b>No tabs open</b><p>Open a shell, the project's localhost or the Preview with +.</p></div>`));
  wire();
}

function makePane(t: Tab) {
  const el = document.createElement("section");
  el.className = "rpane";
  el.dataset.t = t.id;
  el.innerHTML = String(html`<header class="ph"><span>${t.title}</span><button data-x="${t.id}" title="Close" aria-label="Close ${t.title}">×</button></header>`);
  const p = { el, off: null as null | (() => void) };
  panes.set(t.id, p);
  $("rpanes").append(el);
  if (t.kind === "agent" || t.kind === "shell") {
    const term = document.createElement("div");
    term.className = "term";
    el.append(term);
    termLoad()
      .then((m) => {
        if (panes.get(t.id) === p) p.off = m(term, t.key, () => load(true));
      })
      .catch(() => (term.textContent = "The terminal could not load."));
  } else if (t.kind === "local") browser(el);
  else if (t.kind === "note") el.insertAdjacentHTML("beforeend", String(html`<iframe class="rframe" title="${t.title}" src="/notebook?dir=${encodeURIComponent(card.state)}&note=${encodeURIComponent(t.note!)}&embed=1"></iframe>`));
  else void previewPane(el);
}

// The localhost tab: a URL bar over an iframe. The URL is kept per project.
function browser(el: HTMLElement) {
  const k = "kz-browse:" + card.state;
  let url = "http://localhost:3000";
  try {
    url = localStorage.getItem(k) || url;
  } catch {}
  const back: string[] = [],
    fwd: string[] = [];
  el.insertAdjacentHTML(
    "beforeend",
    String(html`<form class="urlbar"><button type="button" data-b="back" title="Back" aria-label="Back">‹</button><button type="button" data-b="fwd" title="Forward" aria-label="Forward">›</button><button type="button" data-b="reload" title="Reload" aria-label="Reload">${ico("refresh")}</button><input class="sel" aria-label="Address" spellcheck="false" value="${url}"><a class="rbtn" target="_blank" rel="noopener" title="Open in a new tab" aria-label="Open in a new tab" href="${url}">${ico("ext")}</a></form>`),
  );
  const f = el.querySelector("form")!,
    inp = f.querySelector("input")!,
    ext = f.querySelector("a")!;
  // On a phone over the tailnet, localhost is the phone itself: framing it shows nothing useful.
  const local = (u) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(u);
  const frame = document.createElement("iframe");
  frame.className = "rframe";
  frame.title = "localhost";
  const note = document.createElement("p");
  note.className = "rnote";
  note.textContent = "This page is on the computer running the board; from this device localhost is the device itself. Use Open in a new tab on that computer.";
  el.append(frame, note);
  const go = (u, push = true) => {
    if (push && url !== u) back.push(url), (fwd.length = 0);
    url = u;
    inp.value = u;
    ext.href = u;
    try {
      localStorage.setItem(k, u);
    } catch {}
    const hide = !loopback && local(u);
    frame.hidden = hide;
    note.hidden = !hide;
    if (!hide) frame.src = u;
  };
  f.onsubmit = (e) => {
    e.preventDefault();
    let u = inp.value.trim();
    if (!/^https?:\/\//.test(u)) u = "http://" + u;
    go(u);
  };
  f.onclick = (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-b]")?.dataset.b;
    if (b === "reload") go(url, false);
    else if (b === "back" && back.length) fwd.push(url), go(back.pop()!, false);
    else if (b === "fwd" && fwd.length) back.push(url), go(fwd.pop()!, false);
  };
  go(url, false);
}

// The run's Preview: a localhost address it names opens in a frame, else its screenshots
// (each opens the image viewer on click), else what the Preview says.
async function previewPane(el: HTMLElement) {
  let doc = store.runDoc && store.runDoc.id === card.id ? store.runDoc : null;
  if (!doc && card.kind === "run")
    try {
      doc = await (await fetch(`/run/${encodeURIComponent(card.id)}?dir=${encodeURIComponent(card.state)}`)).json();
    } catch {}
  const pv = doc && preview(doc.impl);
  const url = pv && /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?[^\s)`'"<>]*/.exec(pv)?.[0];
  if (url && loopback) el.insertAdjacentHTML("beforeend", String(html`<iframe class="rframe" title="Preview" src="${url}"></iframe>`));
  else el.insertAdjacentHTML("beforeend", String(html`<div class="rprev md">${pv ? raw(md(attach(pv, card))) : html`<p class="rnone">This run has no Preview yet.</p>`}</div>`));
}

function addTab(t: Tab) {
  const s = saved();
  if (!s.tabs.some((x) => x.id === t.id)) s.tabs.push(t);
  s.on = t.id;
  save();
  draw();
}
export const openNoteTab = (name: string) => addTab({ id: "note:" + name, kind: "note", title: name.slice(name.lastIndexOf("/") + 1), note: name });
const openPreview = () => addTab({ id: "preview", kind: "preview", title: "Preview" });

async function newPty(agent?: string) {
  const r = await fetch("/shell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(agent ? { dir: card.state, agent } : { dir: card.state }) });
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
  saved().on = "sh:" + sh.key;
  save();
  draw();
}

async function closeTab(id: string) {
  const s = saved();
  if (id.startsWith("sh:")) {
    await post("/pty/exit", { key: id.slice(3) });
    shells = shells.filter((x) => "sh:" + x.key !== id);
  } else if (id.startsWith("agent:")) s.hidden.push(id);
  else s.tabs = s.tabs.filter((t) => t.id !== id);
  if (s.split?.other === id) s.split = null;
  if (s.on === id) s.on = s.split ? s.split.other : null;
  if (s.on === s.split?.other) s.split = null;
  save();
  draw();
}

function wire() {
  const bar = $("rtabs"),
    s = saved();
  bar.onclick = (e) => {
    const t = e.target as HTMLElement;
    const x = t.closest<HTMLElement>("[data-x]")?.dataset.x;
    if (x) return void closeTab(x);
    const tab = t.closest<HTMLElement>("[data-t]")?.dataset.t;
    if (tab) {
      if (s.split?.other === tab) s.split.other = s.on!;
      s.on = tab;
      save();
      return draw();
    }
    const n = t.closest<HTMLElement>("[data-n]")?.dataset.n;
    if (n) {
      (bar.querySelector(".radd") as HTMLDetailsElement).open = false;
      if (n === "shell") void newPty();
      else if (n.startsWith("agent:")) void newPty(n.slice(6));
      else if (n === "local") addTab({ id: "local", kind: "local", title: "localhost" });
      else openPreview();
      return;
    }
    const sp = t.closest<HTMLElement>("[data-split]")?.dataset.split as "cols" | "rows";
    if (sp) {
      // Beside or below the shown tab goes the next one; with one tab, a new shell.
      const ts = tabs(),
        other = ts.find((x) => x.id !== s.on);
      if (s.split?.dir === sp) s.split = null;
      else if (other) s.split = { dir: sp, other: other.id };
      else if (!noPty) {
        s.split = null;
        void newPty().then(() => {
          const o = tabs().find((x) => x.id !== saved().on);
          if (o) {
            saved().split = { dir: sp, other: saved().on! };
            saved().on = o.id;
            save();
            draw();
          }
        });
        return;
      }
      save();
      return draw();
    }
    if (t.closest("#rside")) {
      document.body.classList.toggle("rflip");
      draw();
    }
  };
  // The + menu opens under its button, kept inside the centre panel.
  const add = bar.querySelector<HTMLDetailsElement>(".radd")!;
  add.ontoggle = () => {
    if (!add.open) return;
    const m = add.querySelector<HTMLElement>(".menu-pop")!,
      r = add.querySelector("summary")!.getBoundingClientRect(),
      box = $("runv").getBoundingClientRect();
    m.style.top = r.bottom + 4 + "px";
    m.style.left = Math.max(box.left + 4, Math.min(r.left, box.right - m.offsetWidth - 4)) + "px";
  };
  $("rpanes").onclick = (e) => {
    const x = (e.target as HTMLElement).closest<HTMLElement>(".ph [data-x]")?.dataset.x;
    if (x) void closeTab(x);
  };
}

// Leaving the workspace: its terminals unmount; the shells keep running on the server.
function stopPanes() {
  for (const p of panes.values()) p.off?.();
  panes.clear();
  $("rpanes").innerHTML = "";
}
export function runStop() {
  stopPanes();
  card = null;
  $("panel").classList.remove("pn");
}

// The strip's Project notes: the project's notes as a tree in the panel; a note opens as a centre tab.
async function projectNotes() {
  const pn = $("panel");
  if (pn.classList.toggle("pn") === false) return;
  const box = $("pnlist");
  box.innerHTML = "";
  try {
    const d = await (await fetch("/vault?dir=" + encodeURIComponent(card.state))).json();
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
  addEventListener("kz-run-preview", openPreview);
  $("pnotes").onclick = () => void projectNotes();
  $("pnlist").onclick = (e) => {
    const n = (e.target as HTMLElement).closest<HTMLElement>("[data-note]")?.dataset.note;
    if (n) openNoteTab(n);
  };
  // A /state change: new or ended sessions, the card's own state. Panes stay mounted.
  addEventListener("kz-state", () => {
    if (card && document.body.classList.contains("runv")) void showRunView();
  });
}
// Opens a card's workspace, its address in the history.
export function openWorkspace(c) {
  const u = cardHref(c);
  if (location.pathname + location.search !== u) history.pushState(null, "", u);
  go("run");
}
