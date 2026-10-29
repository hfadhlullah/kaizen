// The side menu's live parts on every page (board, notebook, video): the Icebox count,
// the Ideas entry's source icons and the Projects list; and the board's flat footer
// (agent usage, terminal count, phone). Stands alone, so the notebook and video
// bundles can carry it without the board.
import { onBoardCards } from "./badge.ts";
import { store } from "./store.ts";
import { $, html, raw } from "./dom.ts";
import { age, need } from "./labels.ts";

const DAY = 864e5;
const STAGE = ["idea", "planning", "building", "reviewing", "done"];
// A card's state icon (.si) and the word under its title.
export function stateOf(c) {
  // An idea whose agent is working is a run being born: show it as planning.
  if (c.kind === "idea") return !c.pty?.alive ? "idle" : c.pty.asking ? "wait" : c.pty.busy ? "plan" : "idle";
  if (c.status === "waiting" || (c.pty?.alive && c.pty.asking)) return "wait";
  if (c.status === "done") return c.accept === "needs" ? "wait" : "done";
  if (c.status === "abandoned") return "aband";
  if (c.status === "stalled") return "stalled";
  return c.column >= 3 ? "review" : c.column === 2 ? "build" : "plan";
}
export function subline(c, now) {
  // An idle agent and no run yet: it answered, or waits for the user.
  if (c.kind === "idea") return !c.pty?.alive ? "idea" : c.pty.asking ? "waiting on you" : c.pty.busy ? "planning · starting" : "agent · open";
  const t = c.moved ?? now;
  if (c.status === "waiting") return c.awaiting ? `${STAGE[c.column] ?? "waiting"} · ${need(c.awaiting)}` : "waiting on you";
  if (c.accept === "needs") return "done, not approved";
  if (c.accept === "auto") return `auto-accepted · ${age(t, now)} ago`;
  if (c.status === "done" || c.status === "abandoned") return `${c.status} · ${age(t, now)} ago`;
  if (c.status === "stalled") return `stalled · ${age(t, now)}`;
  return `${STAGE[c.column] ?? c.status} · ${age(t, now)}`;
}
export const titleOf = (c) => (c.title || c.text || "").split("\n")[0];
// Shown in the list: runs not archived, a finished one only for a day. Ideas not started yet
// live on the Ideas page; one whose agent is starting (it has a terminal) shows here.
export const listed = (c, now) =>
  !c.archived && (c.kind === "idea" ? !!c.pty : !["done", "abandoned"].includes(c.status) || now - (c.moved ?? 0) < DAY);
const projName = (dir, projects) => {
  const l = projects?.find((p) => p.dir === dir)?.label || dir.replace(/[\\/]\.kaizen$/, "");
  return l.split(/[\\/]/).pop() || l;
};
export const logo = (dir, name, projects) => {
  const ini = html`<span class="plogo" aria-hidden="true">${(name || "?").charAt(0).toUpperCase()}</span>`;
  return projects?.some((p) => p.dir === dir && p.logo)
    ? html`<img class="plogo" src="/project-logo?dir=${encodeURIComponent(dir)}" alt="" loading="lazy" onerror="this.outerHTML=this.dataset.f" data-f="${String(ini)}">`
    : ini;
};
// A card's address: its run workspace (?view=run&dir=&id=, or &idea= for an idea).
export const cardHref = (c) =>
  `/?view=run&dir=${encodeURIComponent(c.state)}&` + (c.kind === "run" ? "id=" + encodeURIComponent(c.id) : "idea=" + encodeURIComponent(c.text));

// The Projects filter: projects ticked (none = all) and which kinds of card show. Kept per browser.
type Filt = { dirs: string[]; active: boolean; done: boolean };
const ALLF: Filt = { dirs: [], active: true, done: true };
let filt: Filt = (() => {
  try {
    return { ...ALLF, ...JSON.parse(localStorage.getItem("kz-rail-filter") || "{}") };
  } catch {
    return { ...ALLF };
  }
})();
const keepFilt = () => {
  try {
    localStorage.setItem("kz-rail-filter", JSON.stringify(filt));
  } catch {}
};
const kindOf = (c) => {
  const st = stateOf(c);
  return st === "done" || st === "aband" ? "done" : "active";
};
let last: { cards: any[]; projects?: any[] } = { cards: [] };
// Project groups folded shut in the side menu, kept per browser.
const folded: Set<string> = (() => {
  try {
    return new Set(JSON.parse(localStorage.getItem("kz-rail-folded") || "[]"));
  } catch {
    return new Set();
  }
})();
function fold(dir: string) {
  folded.has(dir) ? folded.delete(dir) : folded.add(dir);
  try {
    localStorage.setItem("kz-rail-folded", JSON.stringify([...folded]));
  } catch {}
  drawList();
}
function drawList() {
  const box = $("plist");
  if (!box) return;
  const now = Date.now();
  const groups = new Map<string, any[]>();
  const all = new Set(last.cards.filter((c) => listed(c, now)).map((c) => c.state));
  for (const c of last.cards.filter((c) => listed(c, now) && filt[kindOf(c)] && (!filt.dirs.length || filt.dirs.includes(c.state)))) {
    if (!groups.has(c.state)) groups.set(c.state, []);
    groups.get(c.state)!.push(c);
  }
  // Within a project: waiting, planning, building, reviewing, stalled, ideas, done; newest first in each.
  const RANK = { wait: 0, plan: 1, build: 2, review: 3, stalled: 4, idle: 5, done: 6, aband: 7 };
  const when = (c) => c.moved ?? c.added ?? 0;
  for (const cs of groups.values()) cs.sort((a, b) => RANK[stateOf(a)] - RANK[stateOf(b)] || when(b) - when(a));
  // Projects by their most urgent card: one waiting on you before one only planning, before one with only ideas.
  const top = (cs) => Math.min(...cs.map((c) => RANK[stateOf(c)]));
  const ordered = new Map([...groups].sort((a, b) => top(a[1]) - top(b[1])));
  groups.clear();
  for (const [k, v] of ordered) groups.set(k, v);

  const f = $("pfilter");
  const on = filt.dirs.some((d) => all.has(d)) || !filt.active || !filt.done;
  f.setAttribute("aria-pressed", String(on));
  f.title = on ? "Filter on: choose projects and kinds" : "Filter projects and kinds";
  if ($("pfpop")) drawPop(all);
  const cur = new URLSearchParams(location.search);
  box.innerHTML =
    [...groups]
      .map(([dir, cs]) => {
        const name = projName(dir, last.projects);
        const shut = folded.has(dir);
        return html`<button type="button" class="proj${shut ? " shut" : ""}" data-fold="${dir}" title="${dir}" aria-expanded="${String(!shut)}"><svg class="fchev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${logo(dir, name, last.projects)}<span>${name}</span><span class="c">${cs.length}</span></button>${shut ? "" : cs.map(
          (c) =>
            html`<a class="row" href="${cardHref(c)}" data-dir="${c.state}" data-id="${c.id ?? ""}" data-text="${c.kind === "idea" ? c.text : ""}" title="${titleOf(c)}"${raw(cur.get("dir") === c.state && (cur.get("id") === c.id || cur.get("idea") === c.text) ? ' aria-current="true"' : "")}><span class="si ${stateOf(c)}"></span><div><b>${titleOf(c)}</b><small>${subline(c, now)}</small></div></a>`,
        )}`;
      })
      .join("") || `<div class="none">No runs</div>`;
  box.onclick = (e) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>("[data-fold]")?.dataset.fold;
    if (d) (e.preventDefault(), fold(d));
  };
}
// Moves the side menu's highlight to the card the address names: opening a card in place
// changes the address without redrawing the list.
export function markCurrent() {
  const cur = new URLSearchParams(location.search);
  for (const a of document.querySelectorAll<HTMLElement>("#plist a.row")) {
    const on = cur.get("dir") === a.dataset.dir && (cur.get("id") === a.dataset.id || (!!a.dataset.text && cur.get("idea") === a.dataset.text));
    if (on) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  }
}
addEventListener("popstate", markCurrent);
// The pages that can open a card in place (the board) answer this event and cancel it.
const ask = (name, detail) => !dispatchEvent(new CustomEvent(name, { cancelable: true, detail }));

// What the Ideas page reads too: the cards, and /sources (sources plus every icebox signal).
let srcs: any = null;
export const railData = () => ({ ...last, srcs });
const told = () => dispatchEvent(new Event("kz-rail"));
let srcAt = 0;
export async function drawSources(force = false) {
  if (!force && Date.now() - srcAt < 30_000) return;
  srcAt = Date.now();
  try {
    const r = await fetch("/sources");
    if (!r.ok) return;
    const d = (srcs = await r.json());
    told();
    const n = (d.icebox ?? []).filter((s) => s.status === "new").length;
    $("ice-n").textContent = n ? String(n) : "";
    $("rail-srcs").innerHTML = (d.sources ?? [])
      .slice(0, 3)
      .map((s) => String(srcIcon(s)))
      .join("");
  } catch {
    /* offline: keep what shows */
  }
}
// A source's mark: a social platform's sprite, a sheet's grid, else the site's favicon.
export const srcIcon = (s) => {
  if (s.social) return html`<svg aria-hidden="true"><use href="#i-b-${s.social}"/></svg>`;
  if (/docs\.google\.com\/spreadsheets|\.(csv|tsv)$/.test(s.url)) return raw(`<svg aria-hidden="true"><use href="#i-sheet"/></svg>`);
  try {
    return html`<img src="${new URL(s.url).origin}/favicon.ico" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
  } catch {
    return raw("");
  }
};

// The filter popover: every project listed (search when there are many), All projects, and
// the kinds of card. Each tick applies at once.
let pq = "";
function drawPop(all: Set<string>) {
  const p = $("pfpop");
  const dirs = [...all];
  const shown = dirs.filter((d) => projName(d, last.projects).toLowerCase().includes(pq.toLowerCase()));
  const box = (on: boolean, attrs: string, label) => html`<label class="pfrow"><input type="checkbox" ${raw(attrs)}${on ? raw(" checked") : ""}>${label}</label>`;
  const had = document.activeElement?.id;
  p.innerHTML = String(
    html`${dirs.length > 6 ? html`<input class="sel" id="pfq" placeholder="Search projects…" aria-label="Search projects" value="${pq}" autocomplete="off" spellcheck="false">` : ""}${box(!filt.dirs.length, 'data-all="1"', "All projects")}${shown.map((d) => box(filt.dirs.includes(d), `data-dir="${encodeURIComponent(d)}"`, html`${logo(d, projName(d, last.projects), last.projects)}<span>${projName(d, last.projects)}</span>`))}<div class="pfh">Show</div>${(["active", "done"] as const).map((k) => box(filt[k], `data-k="${k}"`, { active: "Active runs", done: "Done (last day)" }[k]))}`,
  );
  if (had === "pfq") {
    const q = $("pfq") as HTMLInputElement;
    q.focus();
    q.setSelectionRange(pq.length, pq.length);
  }
  p.oninput = (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === "pfq") pq = t.value;
    else if (t.dataset.all) filt.dirs = [];
    else if (t.dataset.dir) {
      const d = decodeURIComponent(t.dataset.dir);
      filt.dirs = t.checked ? [...new Set([...filt.dirs, d])] : filt.dirs.filter((x) => x !== d);
    } else if (t.dataset.k) filt[t.dataset.k] = t.checked;
    keepFilt();
    drawList();
  };
}
function closePop() {
  $("pfpop")?.remove();
  $("pfilter").setAttribute("aria-expanded", "false");
}

// Rows are redrawn on every refresh, which restarts a CSS animation from 0deg: the state
// icons jumped back mid-turn. Pinning each to the page clock's origin keeps them in phase
// (the si-* animations have no delay for this to cancel).
const syncSpin = () =>
  document.getAnimations().forEach((a: any) => {
    if (a.animationName?.startsWith("si-") && a.startTime !== 0) a.startTime = 0;
  });
export function initRail() {
  let queued = false;
  const hasSi = (n: any) => n.nodeType === 1 && (n.classList.contains("si") || n.querySelector(".si"));
  new MutationObserver((rs) => {
    if (queued || !rs.some((r) => [...r.addedNodes].some(hasSi))) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      syncSpin();
    });
  }).observe(document.body, { childList: true, subtree: true });
  if (!$("plist")) return;
  onBoardCards((cards, projects) => {
    last = { cards, projects: projects ?? last.projects };
    drawList();
    void drawSources();
    onCount?.(cards);
    dispatchEvent(new Event("kz-cards"));
    told();
  });
  $("pfilter").onclick = (e) => {
    e.stopPropagation();
    if ($("pfpop")) return closePop();
    const p = document.createElement("div");
    p.id = "pfpop";
    p.className = "pfpop";
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-label", "Filter the Projects list");
    const r = $("pfilter").getBoundingClientRect();
    p.style.left = r.left + "px";
    p.style.top = r.bottom + 4 + "px";
    document.body.append(p);
    $("pfilter").setAttribute("aria-expanded", "true");
    drawList();
    (p.querySelector("input") as HTMLElement)?.focus();
  };
  addEventListener("pointerdown", (e) => {
    const p = $("pfpop");
    if (p && !p.contains(e.target as Node) && !$("pfilter").contains(e.target as Node)) closePop();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("pfpop")) {
      closePop();
      $("pfilter").focus();
    }
  });
  $("padd").onclick = () => {
    // The page's own project when it has one: the run workspace's, or the one project the filter shows.
    const p = new URLSearchParams(location.search);
    const dir = p.get("view") === "run" ? p.get("dir") : filt.dirs.length === 1 ? filt.dirs[0] : null;
    if (!ask("kz-new-idea", { dir })) location.href = "/?view=board";
  };
  $("plist").addEventListener("click", (e) => {
    const a = (e.target as Element).closest?.("a.row") as HTMLAnchorElement;
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || (e as MouseEvent).button) return;
    if (ask("kz-open-card", { dir: a.dataset.dir, id: a.dataset.id, text: a.dataset.text })) e.preventDefault();
  });
}

// ---- footer (board page)
const meter = (p) => html`<span class="umtr"><i class="${p >= 85 ? "hi" : p >= 50 ? "mid" : ""}" style="width:${Math.min(100, p)}%"></i></span>`;
const when = (t) => (t ? new Date(t).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "unknown");
const NAME = { claude: "Claude", codex: "Codex" };
export function usageChips(list) {
  // The agent's mark and its 5-hour %, coloured as it fills; the full figures on hover/focus.
  const lvl = (p) => (p >= 95 ? " hi" : p >= 80 ? " mid" : "");
  return list
    .filter((u) => NAME[u.agent])
    .map((u) => {
      const mark = html`<svg aria-hidden="true"><use href="#i-${u.agent}"/></svg>`;
      if (u.error) return html`<span class="uchip na" tabindex="0">${mark}<b>–</b><span class="utip" role="tooltip"><b>${NAME[u.agent]}</b>Usage unavailable: ${u.error}</span></span>`;
      const head = u.five ?? u.week;
      const row = (label, w) => (w ? html`<span class="urow"><span>${label}</span><b class="${lvl(w.pct).trim()}">${w.pct}%</b><i><i style="width:${Math.min(100, w.pct)}%" class="${lvl(w.pct).trim()}"></i></i><small>resets ${when(w.resetsAt)}</small></span>` : "");
      return html`<span class="uchip" tabindex="0" aria-label="${NAME[u.agent]} usage">${mark}<b class="${lvl(head?.pct ?? 0).trim()}">${head ? head.pct + "%" : ""}</b><span class="utip" role="tooltip"><b>${NAME[u.agent]}</b>${row("5-hour window", u.five)}${row("Week", u.week)}</span></span>`;
    })
    .join("");
}
async function usage(refresh = false) {
  try {
    const r = await fetch("/usage" + (refresh ? "?refresh=1" : ""));
    if (r.ok) $("usage").innerHTML = usageChips(await r.json());
  } catch {}
}
async function phone() {
  try {
    const d = await (await fetch("/phone")).json();
    const el = $("phone");
    el.hidden = false;
    const [txt, on, tip] = !d.tailscale
      ? ["Tailscale off", false, "Tailscale is not running on this computer"]
      : d.online
        ? ["Phone connected", true, "A phone is online on your tailnet"]
        : ["Phone offline", false, d.phones ? "Your phone is not online on the tailnet" : "No phone on your tailnet"];
    el.title = tip;
    el.innerHTML = String(html`<svg aria-hidden="true"><use href="#i-phone"/></svg><span class="ptxt">${txt}</span><span class="dot${on ? "" : " off"}"></span>`);
  } catch {}
}
// Live terminals: the board's agent sessions plus the shells /shell started.
let agentPtys = 0;
let onCount: ((cards: any[]) => void) | null = null;
async function terms() {
  let shells = 0;
  try {
    store.shells = await (await fetch("/shells")).json();
    shells = store.shells.length;
    dispatchEvent(new Event("kz-shells"));
  } catch {}
  const n = agentPtys + shells,
    a = $("tcount");
  a.hidden = !n;
  a.querySelector("span").textContent = String(n);
  a.title = `${n} live terminal${n === 1 ? "" : "s"}: show them all`;
}
export function initFooter(goTerminal: () => void) {
  if (!$("foot")) return;
  // The Board drawer is position:fixed; it stops above the footer, whose height varies.
  const fh = () => document.documentElement.style.setProperty("--foot-h", $("foot").offsetHeight + "px");
  new ResizeObserver(fh).observe($("foot"));
  fh();
  void usage();
  void phone();
  setInterval(() => void usage(), 5 * 60_000);
  setInterval(() => void phone(), 60_000);
  $("usage-r").onclick = () => void usage(true);
  $("tcount").onclick = (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    goTerminal();
  };
  onCount = (cards) => {
    agentPtys = cards.filter((c) => c.pty?.alive).length;
    void terms();
  };
}
