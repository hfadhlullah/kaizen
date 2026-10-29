// Global search: the "Search" entry on top of the side menu, and Ctrl/Cmd+K anywhere, open
// one palette over workspaces, runs and ideas, chats, agent terminals, projects, pages and
// actions (modelled on Orca's "Jump to..." palette). Nothing is fetched but /chats; the rest
// is what the side menu already holds. Stands alone like workspace.ts, so the notebook and
// video pages carry it too: a pick the page cannot do in place navigates instead.
import { $, html, raw } from "./dom.ts";
import { age } from "./labels.ts";
import { openAdd } from "./add-project.ts";
import { cardHref, folderOf, projName, railData, stateOf, subline, titleOf, wsHref, wsLabel, wsOfCard } from "./workspace.ts";
import { match, type Item } from "./search-match.ts";

// The pages that can open a thing in place answer this event and cancel it.
const ask = (name: string, detail: any) => !dispatchEvent(new CustomEvent(name, { cancelable: true, detail }));
// A menu entry's own click: in place on the board, a page load elsewhere.
const page = (v: string, href: string) => () => {
  const a = document.querySelector<HTMLElement>(`.rail a.it[data-view="${v}"]`);
  a ? a.click() : (location.href = href);
};
const openWs = (dir: string, ws: string) => {
  if (!ask("kz-open-ws", { dir, ws })) location.href = wsHref(dir, ws);
};
const ICO = {
  ws: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 8v8M18 10c0 4-6 3-12 6"/>',
  run: '<path d="M5 4l14 8-14 8z"/>',
  idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  term: '<path d="M4 17l6-5-6-5M12 19h8"/>',
  proj: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  page: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16"/>',
  act: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
};
const svg = (k: string) => raw(`<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICO[k]}</g></svg>`);

let chats: any[] = [];
function items(): Item[] {
  const { cards, projects = [], agents = [] } = railData();
  const now = Date.now();
  const cur = new URLSearchParams(location.search);
  // The workspace open now: named by the address, or the one holding the run it names.
  const curRun = cur.get("id") && cards.find((c) => c.kind === "run" && c.state === cur.get("dir") && c.id === cur.get("id"));
  const curWs = cur.get("ws") ?? (curRun ? wsOfCard(curRun, projects) : null);
  const out: Item[] = [];
  // Workspaces, the one open now first; then by their latest run.
  const latest = new Map<string, number>();
  for (const c of cards) {
    const k = c.state + "\0" + wsOfCard(c, projects);
    latest.set(k, Math.max(latest.get(k) ?? 0, c.moved ?? 0));
  }
  for (const p of projects) {
    const name = projName(p.dir, projects);
    for (const w of p.workspaces ?? []) {
      const here = cur.get("dir") === p.dir && curWs === w.path;
      const at = latest.get(p.dir + "\0" + w.path);
      out.push({
        group: here ? "Current" : "Recent Workspaces",
        title: wsLabel(w),
        sub: `${name} · ${folderOf(w)}${at ? ` · ${age(at, now)} ago` : ""}`,
        hay: `${wsLabel(w)} ${name} ${w.path} workspace`,
        at: here ? Infinity : at ?? 0,
        ico: "ws",
        act: () => openWs(p.dir, w.path),
      });
    }
    out.push({ group: "Projects", title: name, sub: p.dir.replace(/[\\/]\.kaizen$/, ""), hay: `${name} ${p.dir} project`, ico: "proj", act: () => {
      const main = p.workspaces?.find((w) => w.main) ?? p.workspaces?.[0];
      main ? openWs(p.dir, main.path) : page("board", "/?view=board")();
    } });
  }
  // Runs and ideas, not archived.
  for (const c of cards.filter((c) => !c.archived)) {
    const st = stateOf(c);
    out.push({
      group: c.kind === "run" ? "Runs" : "Ideas",
      title: titleOf(c) || c.id,
      sub: `${projName(c.state, projects)} · ${subline(c, now)}`,
      hay: `${titleOf(c)} ${c.id ?? ""} ${c.text ?? ""} ${projName(c.state, projects)} ${st}`,
      at: c.moved ?? 0,
      dot: st,
      ico: c.kind === "run" ? "run" : "idea",
      act: () => {
        if (!ask("kz-open-card", { dir: c.state, id: c.kind === "run" ? c.id : undefined, text: c.text })) location.href = cardHref(c);
      },
    });
  }
  for (const c of chats)
    out.push({
      group: "Recent Chats & Terminals",
      title: c.title || "Chat",
      sub: `chat · ${c.project ? projName(c.project, projects) : "No project"}${c.updated ? ` · ${age(c.updated, now)} ago` : ""}`,
      hay: `${c.title} chat ${c.project ?? ""}`,
      at: c.updated ?? 0,
      dot: c.busy ? "build" : undefined,
      ico: "chat",
      act: () => {
        try {
          sessionStorage.setItem("kz-chat", c.id);
        } catch {}
        page("home", "/")();
      },
    });
  for (const a of agents)
    out.push({
      group: "Recent Chats & Terminals",
      title: a.name || a.agent || "Terminal",
      sub: `${a.agent ?? "terminal"} · ${projName(a.dir, projects)}${a.asking ? " · asking" : a.busy ? " · working" : ""}${a.last ? ` · ${a.last}` : ""}`,
      hay: `${a.name} ${a.agent ?? ""} ${a.run ?? ""} ${a.last ?? ""} ${projName(a.dir, projects)} terminal agent`,
      at: a.at ?? a.born ?? 0,
      dot: a.asking ? "wait" : a.busy ? "build" : "done",
      ico: "term",
      act: () => {
        if (!ask("kz-open-term", { dir: a.dir, ws: a.ws, key: a.key })) location.href = wsHref(a.dir, a.ws ?? "");
      },
    });
  // Pages and actions. Each clicks the side menu's own control, so it behaves the same.
  const click = (id: string) => () => $(id)?.click();
  const acts: [string, string, () => void, string?][] = [
    ["Home", "page", page("home", "/"), "chat"],
    ["Icebox", "page", page("sources", "/?view=icebox"), "requests sources gathered"],
    ["Ideas", "page", page("ideas", "/?view=ideas"), "backlog"],
    ["Board", "page", page("board", "/?view=board"), "kanban runs"],
    ["Notes", "page", () => (location.href = "/notebook"), "notebook docs"],
    ["Settings", "page", page("settings", "/?view=settings"), "preferences config"],
    ["New idea", "act", () => ($("newtop") ? $("newtop").click() : (location.href = "/?view=board")), "create add run"],
    ["Add a project", "act", () => openAdd({ dir: null }), "clone folder create workspace"],
    ["Toggle theme", "act", click("themet"), "dark light"],
    ["Collapse or expand menu", "act", click("fold"), "sidebar rail"],
    ["Keyboard shortcuts", "act", click("kbd"), "keys help"],
    ["Report an issue", "act", () => open("/issue", "_blank", "noopener"), "bug feedback"],
  ];
  for (const [title, ico, act, kw] of acts) out.push({ group: "Actions & Settings", title, sub: ico === "page" ? "Go to page" : "Action", hay: `${title} ${kw ?? ""}`, ico, act });
  return out;
}

const ORDER = ["Current", "Recent Workspaces", "Recent Chats & Terminals", "Runs", "Ideas", "Projects", "Actions & Settings"];
// With nothing typed each group shows its most recent few, as Orca's does.
const CAP = { "Recent Workspaces": 6, "Recent Chats & Terminals": 6, Runs: 5, Ideas: 3, Projects: 6 };

let dl: HTMLDialogElement | null = null;
let shown: Item[] = [];
let sel = 0;
function draw() {
  const q = (dl!.querySelector("input") as HTMLInputElement).value;
  const all = items();
  const hit = q.trim() ? match(all, q) : all.slice().sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  shown = [];
  // Typed: the group holding the best match comes first, so Enter takes it.
  const order = q.trim() ? [...new Set(hit.map((i) => i.group))] : ORDER;
  for (const g of order) {
    const rows = hit.filter((i) => i.group === g);
    shown.push(...rows.slice(0, q.trim() ? 8 : CAP[g] ?? rows.length));
  }
  // Orca offers to create what was typed; here that is a new idea.
  if (q.trim())
    shown.push({ group: "Create", title: `New idea "${q.trim()}"`, hay: "", ico: "plus", act: () => newIdeaWith(q.trim()) });
  sel = Math.min(sel, shown.length - 1);
  const list = dl!.querySelector(".gs-list")!;
  let g = "";
  list.innerHTML = String(
    html`${shown.map((i, n) => {
      const head = i.group !== g ? ((g = i.group), html`<div class="gs-h" role="presentation">${i.group}</div>`) : "";
      return html`${head}<div class="gs-i" role="option" id="gs-${n}" data-n="${n}" aria-selected="${String(n === sel)}">${svg(i.ico)}${i.dot ? html`<span class="si ${i.dot}"></span>` : ""}<span class="gs-t">${i.title}</span>${i.sub ? html`<span class="gs-s">${i.sub}</span>` : ""}</div>`;
    })}${shown.length === 1 && q.trim() ? html`<div class="gs-none"><b>No results match your search</b><span>Try a workspace, project, run, idea, chat, terminal, page or action.</span></div>` : ""}`,
  );
  mark(sel);
  dl!.querySelector(".gs-live")!.textContent = `${shown.length} result${shown.length === 1 ? "" : "s"} found`;
}
// Moves the selection without rebuilding the list.
function mark(n: number) {
  dl!.querySelector(`#gs-${sel}`)?.setAttribute("aria-selected", "false");
  sel = n;
  const r = dl!.querySelector(`#gs-${n}`);
  r?.setAttribute("aria-selected", "true");
  dl!.querySelector("input")!.setAttribute("aria-activedescendant", "gs-" + n);
  r?.scrollIntoView({ block: "nearest" });
}
function newIdeaWith(text: string) {
  if (!$("newtop")) return void (location.href = "/?view=board");
  $("newtop").click();
  const t = document.querySelector<HTMLTextAreaElement>("dialog[open] textarea");
  if (t) (t.value = text), t.dispatchEvent(new Event("input", { bubbles: true }));
}
function pick(n: number) {
  const i = shown[n];
  if (!i) return;
  dl!.close();
  i.act();
}

export function openSearch() {
  if (dl) return dl.querySelector("input")!.focus();
  dl = document.createElement("dialog");
  dl.className = "gs";
  dl.setAttribute("aria-label", "Search");
  dl.innerHTML = String(
    html`<div class="gs-box"><div class="gs-q">${svg("search")}<input type="text" placeholder="Search workspaces, runs, ideas, chats, terminals, projects and actions…" aria-label="Search workspaces, runs, ideas, chats, terminals, projects and actions" role="combobox" aria-expanded="true" aria-controls="gs-list" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div><div class="gs-list" id="gs-list" role="listbox"></div><div class="gs-ft"><span><kbd>↑</kbd><kbd>↓</kbd> Move</span><span><kbd>Enter</kbd> Open</span><span><kbd>Esc</kbd> Close</span><span class="gs-live" role="status" aria-live="polite"></span></div></div>`,
  );
  document.body.append(dl);
  const q = dl.querySelector("input")!;
  sel = 0;
  q.oninput = () => ((sel = 0), draw());
  q.onkeydown = (e) => {
    const d = { ArrowDown: 1, ArrowUp: -1 }[e.key] ?? (e.ctrlKey && e.key === "n" ? 1 : e.ctrlKey && e.key === "p" ? -1 : 0);
    if (d) {
      e.preventDefault();
      mark((sel + d + shown.length) % shown.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(sel);
    }
  };
  const list = dl.querySelector<HTMLElement>(".gs-list")!;
  list.onclick = (e) => {
    const r = (e.target as Element).closest<HTMLElement>(".gs-i");
    if (r) pick(+r.dataset.n!);
  };
  list.onpointermove = (e) => {
    const r = (e.target as Element).closest<HTMLElement>(".gs-i");
    if (r && +r.dataset.n! !== sel) mark(+r.dataset.n!);
  };
  dl.onclick = (e) => e.target === dl && dl!.close();
  dl.onclose = () => (dl!.remove(), (dl = null));
  dl.showModal();
  draw();
  // Chats live behind one fetch; the list redraws when they land.
  fetch("/chats")
    .then((r) => r.json())
    .then((d) => {
      chats = d.chats ?? [];
      if (dl) draw();
    })
    .catch(() => {});
}

const CSS = `dialog.gs{border:0;padding:0;margin:12vh auto auto;background:none;width:min(640px,calc(100vw - 32px));color:var(--ink);overflow:visible}
dialog.gs::backdrop{background:rgb(0 0 0/.45)}
.gs-box{display:flex;flex-direction:column;max-height:min(560px,76vh);background:var(--bg);border:1px solid var(--line);border-radius:12px;box-shadow:0 20px 50px rgb(0 0 0/.35);overflow:hidden}
.gs-q{display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid var(--line)}
.gs-q svg{width:16px;height:16px;color:var(--dim);flex:none}
.gs-q input{flex:1;min-width:0;height:44px;border:0;outline:0;background:none;color:var(--ink);font:inherit;font-size:var(--fs-l,14px)}
.gs-list{flex:1;overflow:auto;padding:4px}
.gs-h{padding:8px 8px 4px;font-size:var(--fs-xs,11px);font-weight:600;color:var(--dim)}
.gs-i{display:flex;align-items:center;gap:var(--gap,6px);min-height:var(--btn-s,32px);padding:0 var(--padx,8px);border-radius:var(--r-s,4px);cursor:pointer;font-size:var(--fs,13px)}
.gs-i[aria-selected=true]{background:var(--hover)}
.gs-i svg{width:var(--ico,14px);height:var(--ico,14px);color:var(--dim);flex:none}
.gs-i .si{flex:none}
.gs-t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto}
.gs-s{margin-left:auto;padding-left:12px;color:var(--dim);font-size:var(--fs-s,12px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 auto}
.gs-none{display:flex;flex-direction:column;gap:2px;padding:16px 8px;text-align:center;color:var(--dim);font-size:var(--fs-s,12px)}
.gs-none b{color:var(--ink);font-weight:600}
.gs-ft{display:flex;align-items:center;gap:14px;padding:6px 12px;border-top:1px solid var(--line);color:var(--dim);font-size:var(--fs-xs,11px)}
.gs-live{margin-left:auto}
dialog.gs kbd{display:inline-block;min-width:18px;padding:0 4px;margin-right:2px;border:1px solid var(--line);border-radius:4px;font:inherit;font-size:var(--fs-xs,11px);text-align:center;color:var(--dim)}
@media(max-width:640px){.rail a.it.gs-it{display:none}}`;

export function initSearch() {
  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.append(st);
  const mac = /Mac|iP(hone|ad)/.test(navigator.platform);
  const it = $("gsearch");
  if (it) it.onclick = (e) => (e.preventDefault(), openSearch());
  // Ctrl/Cmd+K anywhere, and Orca's own Cmd+J (Ctrl+Shift+J is the browser's console).
  addEventListener(
    "keydown",
    (e) => {
      // A terminal keeps its keys: Ctrl+K there is the shell's kill-line.
      if ((e.target as Element)?.closest?.(".xterm")) return;
      const mod = mac ? e.metaKey : e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && !e.altKey && ((k === "k" && !e.shiftKey) || (mac && k === "j" && !e.shiftKey))) {
        e.preventDefault();
        e.stopPropagation();
        dl ? dl.close() : openSearch();
      }
    },
    true,
  );
}
