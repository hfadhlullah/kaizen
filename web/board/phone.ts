// ---- Phones: their own Home (devices, recent runs, usage) and the Runs page (this
// machine's runs grouped waiting / active / done). The board, Ideas and Icebox are set up
// on a computer; a phone has Home, Chat, Runs and Settings.
import { runPopup } from "./cards.ts";
import { $, html, raw } from "./dom.ts";
import { cardHref, logo, railData, stateOf, subline, titleOf, usageChips, wsHref } from "./workspace.ts";
import { toast } from "./toast.ts";
import { agentStatus, wsKey, type Agent, type Status } from "./ws-tabs.ts";

export const isPhone = () => matchMedia("(max-width:640px)").matches;

type Computer = { name: string; dns: string; os: string; online: boolean };
let net: { self: Computer | null; computers: Computer[]; tailscale: boolean } = { self: null, computers: [], tailscale: false };
let usage: any[] = [];
let mode: "home" | "device" | null = null;
let allDevices = false;

const chev = raw(`<svg class="pchev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`);
const runs = () => railData().cards.filter((c) => c.kind === "run" && !c.archived);
// Ideas not started yet: a phone has no Ideas page, so the Runs page lists them.
const ideas = () => railData().cards.filter((c) => c.kind === "idea" && !c.archived);
const rowKey = (c) => (c.kind === "run" ? c.id : c.text);
const projName = (dir: string) => {
  const l = railData().projects?.find((p) => p.dir === dir)?.label || dir.replace(/[\\/]\.kaizen$/, "");
  return l.split(/[\\/]/).pop() || l;
};

function row(c, now: number) {
  const name = projName(c.state);
  return html`<a class="prow" href="${cardHref(c)}" data-dir="${c.state}" data-id="${rowKey(c)}"><span class="si ${stateOf(c)}"></span><span class="pmain"><b>${titleOf(c)}</b><small>${logo(c.state, name, railData().projects)}${name}</small><code>${subline(c, now)}</code></span></a>`;
}

// Home's slider: one card per workspace with an agent open, those asking first.
const WORD: Record<Status, string> = { asking: "Asking", working: "Working", done: "Done" };
const DOT: Record<Status, string> = { asking: "wait", working: "build", done: "done" };
const RANK: Record<Status, number> = { asking: 0, working: 1, done: 2 };
const agentIco = (a: Agent) => {
  const id = "i-" + (a.agent || "").toLowerCase();
  return raw(`<svg class="pag-ico" aria-hidden="true"><use href="#${document.getElementById(id) ? id : "i-ai"}"/></svg>`);
};
const wsName = (a: Agent) => a.ws?.split(/[\\/]/).pop() || "main";
const groupKey = (a: Agent) => a.dir + "\n" + (a.ws ?? ""); // a NUL would not survive innerHTML
function agentGroups(now: number) {
  const groups = new Map<string, { a: Agent; st: Status }[]>();
  for (const a of (railData().agents ?? []) as Agent[]) {
    const k = groupKey(a);
    groups.set(k, [...(groups.get(k) ?? []), { a, st: agentStatus(a, now) }]);
  }
  const list = [...groups].map(([k, rows]) => ({ k, rows: rows.sort((x, y) => RANK[x.st] - RANK[y.st]) }));
  return list.sort((x, y) => RANK[x.rows[0].st] - RANK[y.rows[0].st]);
}
function agentCards(now: number) {
  const groups = agentGroups(now);
  const asking = groups.filter((g) => g.rows[0].st === "asking").length;
  const cards = groups.map(({ k, rows }) => {
    const { a, st } = rows[0];
    return html`<button type="button" class="pag${st === "asking" ? " ask" : ""}" data-group="${k}"><span class="pag-st"><i class="si ${DOT[st]}"></i>${rows.length > 1 ? rows.length + " agents" : WORD[st]}<span class="pag-icos">${rows.map((r) => agentIco(r.a))}</span></span><span class="pag-ws">${wsName(a)}</span><small>${projName(a.dir)}</small></button>`;
  });
  return html`<section class="psec2"><div class="pag-h"><h3>Agents${asking ? html`<span class="pag-n">${asking} asking</span>` : ""}</h3><button type="button" class="pag-new">New</button></div>${groups.length ? html`<div class="pslide">${cards}</div>` : html`<p class="pnote">No agents running.</p>`}</section>`;
}
function openTerm(a: Agent) {
  if (dispatchEvent(new CustomEvent("kz-open-term", { cancelable: true, detail: { dir: a.dir, ws: a.ws, key: a.key } }))) location.href = wsHref(a.dir, a.ws ?? "");
}
// Several agents in a workspace: a sheet picks which terminal to open.
function pickAgent(rows: { a: Agent; st: Status }[]) {
  const d = document.createElement("dialog");
  d.className = "pagsheet";
  d.innerHTML = String(html`<h4>${wsName(rows[0].a)}</h4>${rows.map(({ a, st }, i) => html`<button type="button" data-i="${String(i)}">${agentIco(a)}${a.name || a.agent || "Terminal"}<i class="si ${DOT[st]}"></i><small>${WORD[st]}</small></button>`)}<button type="button" data-new="1">${agentIco({ agent: "" } as Agent)}New agent</button>`);
  d.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    d.close();
    if (b?.dataset.new) void newSheet(rows[0].a.dir, rows[0].a.ws);
    else if (b) openTerm(rows[Number(b.dataset.i)].a);
  });
  d.addEventListener("close", () => d.remove());
  document.body.append(d);
  d.showModal();
}

// New: pick a workspace, then an agent or a plain shell. It starts as a tab of that
// workspace, the same POST the workspace's own + button makes.
async function newSheet(dir?: string, ws?: string) {
  const spots = (railData().projects ?? []).flatMap((p) => (p.workspaces ?? []).map((w) => ({ dir: p.dir as string, ws: w.path as string, name: w.branch || w.path.split(/[\\/]/).pop() })));
  const first = agentGroups(Date.now())[0]?.rows[0].a;
  const on = spots.find((x) => x.dir === (dir ?? first?.dir) && x.ws === (ws ?? first?.ws)) ?? spots[0];
  if (!on) return toast("Add a project on a computer first");
  const list = await fetch("/agents?dir=" + encodeURIComponent(on.dir)).then((r) => r.json(), () => null);
  const kinds: { cmd: string; name: string }[] = [...(list?.agents ?? []), { cmd: "", name: "Shell" }];
  const d = document.createElement("dialog");
  d.className = "pagsheet";
  d.innerHTML = String(html`<h4>New in</h4><select aria-label="Workspace">${spots.map((x, i) => html`<option value="${String(i)}"${raw(x === on ? " selected" : "")}>${projName(x.dir)} ${x.name}</option>`)}</select>${kinds.map((k, i) => html`<button type="button" data-i="${String(i)}">${k.cmd ? agentIco({ agent: k.cmd } as Agent) : raw(`<svg class="pag-ico" aria-hidden="true"><use href="#i-term"/></svg>`)}${k.name}</button>`)}`);
  d.addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (e.target === d) return d.close();
    if (!b) return;
    const at = spots[Number(d.querySelector("select")!.value)], cmd = kinds[Number(b.dataset.i)].cmd;
    d.close();
    const r = await fetch("/shell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir: at.dir, ws: at.ws, run: wsKey(at.dir, at.ws), ...(cmd ? { agent: cmd } : {}) }) }).catch(() => null);
    const sh = r?.ok ? await r.json() : null;
    if (sh) openTerm({ dir: at.dir, ws: at.ws, key: sh.key } as Agent);
    else toast("No new terminal: " + ((await r?.json().catch(() => null))?.error || "kaizen did not answer"));
  });
  d.addEventListener("close", () => d.remove());
  document.body.append(d);
  d.showModal();
}

function home() {
  const now = Date.now();
  const all = runs();
  const active = all.filter((c) => !["done", "abandoned"].includes(c.status));
  const waiting = all.filter((c) => stateOf(c) === "wait").length;
  const projects = new Set(all.map((c) => c.state)).size;
  const me = net.self?.name || "This computer";
  // Two devices show, this computer first; the rest wait behind Show more.
  const others = net.computers.slice(0, allDevices ? undefined : 1).map(
    (d) =>
      html`<a class="pdev" href="${d.dns ? "https://" + d.dns + "/" : "#"}" target="_blank" rel="noopener"${raw(d.dns ? "" : ' aria-disabled="true"')}><span class="pico"><svg><use href="#r-desk"/></svg></span><span class="pmain"><b>${d.name}</b><small><i class="pdot${d.online ? " on" : ""}"></i>${d.online ? "Connected" : "Disconnected"}${d.os ? " · " + d.os : ""}</small></span>${chev}</a>`,
  );
  const recent = [...all].sort((a, b) => (b.moved ?? 0) - (a.moved ?? 0)).slice(0, 12);
  const hidden = net.computers.length - 1;
  const more = hidden > 0 ? html`<button type="button" class="pmore" aria-expanded="${String(allDevices)}"><span>${allDevices ? "Show less" : `Show ${hidden} more`}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>` : "";
  return html`${agentCards(now)}<section class="psec2"><h3>Devices</h3><a class="pdev" href="/?view=device" data-dev="here"><span class="pico"><svg><use href="#r-desk"/></svg></span><span class="pmain"><b>${me}</b><small><i class="pdot on"></i>Connected · ${projects} project${projects === 1 ? "" : "s"} · ${active.length} active${waiting ? html` · <em>${waiting} waiting</em>` : ""}</small></span>${chev}</a>${others}${more}${net.tailscale ? "" : html`<p class="pnote">Tailscale is off on this computer: other devices do not show.</p>`}</section>
<section class="psec2"><h3>Runs</h3><div class="plist2">${recent.map((c) => row(c, now))}${recent.length ? "" : html`<p class="pnote">No runs yet.</p>`}</div></section>${usage.length ? html`<section class="psec2"><h3>Usage</h3><div class="pusage">${raw(usageChips(usage))}</div></section>` : ""}`;
}

function device() {
  const now = Date.now();
  const all = [...runs()].sort((a, b) => (b.moved ?? 0) - (a.moved ?? 0));
  const wait = all.filter((c) => stateOf(c) === "wait");
  const done = all.filter((c) => ["done", "abandoned"].includes(c.status));
  const active = all.filter((c) => !wait.includes(c) && !done.includes(c));
  const group = (title: string, cs: any[], shut = false) =>
    cs.length ? html`<details class="pgrp"${raw(shut ? "" : " open")}><summary>${title}<span>${cs.length}</span></summary><div class="plist2">${cs.map((c) => row(c, now))}</div></details>` : "";
  const idle = ideas().sort((a, b) => (b.moved ?? b.added ?? 0) - (a.moved ?? a.added ?? 0));
  return html`${group("Waiting on you", wait)}${group("Active", active)}${group("Ideas", idle)}${group("Done", done, true)}${all.length || idle.length ? "" : html`<p class="pnote">No runs yet.</p>`}`;
}

function draw() {
  const el = $("phome");
  if (!el || !mode) return;
  const keep = mode === "device" ? [...el.querySelectorAll("details")].map((d) => d.open) : [];
  const slid = el.querySelector(".pslide")?.scrollLeft ?? 0;
  el.innerHTML = String(mode === "home" ? home() : device());
  const slide = el.querySelector(".pslide");
  if (slide) slide.scrollLeft = slid;
  el.querySelectorAll("details").forEach((d, i) => keep[i] !== undefined && (d.open = keep[i]));
}

async function fetchNet() {
  try {
    const [p, u] = await Promise.all([fetch("/phone").then((r) => r.json()), fetch("/usage").then((r) => (r.ok ? r.json() : []))]);
    net = { self: p.self ?? null, computers: p.computers ?? [], tailscale: !!p.tailscale };
    usage = u;
    draw();
  } catch {}
}

// Home (devices) or Runs (this machine); null when neither shows.
export function openPhone(m: "home" | "device" | null) {
  mode = m;
  if (!m) return;
  draw();
  if (m === "home") void fetchNet();
}

// A light tick on every tap of something pressable. Android has vibrate; iOS (18+) has none,
// but Safari ticks when a switch checkbox toggles, so a hidden one is toggled through its label.
let tick: HTMLLabelElement | null = null;
function haptic() {
  try {
    if (localStorage.getItem("kz-haptic") === "off") return;
  } catch (e) {}
  if (navigator.vibrate) return void navigator.vibrate(8);
  if (!tick) {
    tick = document.createElement("label");
    tick.hidden = true;
    tick.innerHTML = `<input type="checkbox" switch>`;
    document.body.append(tick);
  }
  tick.click();
}

export function initPhone(go: (v: string, push?: boolean) => void, openRun: (c) => void) {
  addEventListener("kz-cards", draw);
  addEventListener(
    "click",
    (e) => isPhone() && e.isTrusted && (e.target as HTMLElement).closest?.("button,a,summary,label,select,[role=button],input[type=checkbox]") && haptic(),
    true,
  );
  $("phome")?.addEventListener("click", (e) => {
    if ((e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey) return;
    const t = e.target as HTMLElement;
    if (t.closest(".pag-new")) return void newSheet();
    if (t.closest(".pmore")) return (allDevices = !allDevices), draw();
    const group = t.closest<HTMLElement>(".pag")?.dataset.group;
    if (group) {
      const rows = agentGroups(Date.now()).find((g) => g.k === group)?.rows;
      if (rows) rows.length > 1 ? pickAgent(rows) : openTerm(rows[0].a);
      return;
    }
    const a = t.closest<HTMLAnchorElement>("a");
    if (!a) return;
    if (a.dataset.dev) return (e.preventDefault(), go("device", true));
    if (a.getAttribute("aria-disabled")) return e.preventDefault();
    if (a.classList.contains("prow")) {
      const c = [...runs(), ...ideas()].find((x) => x.state === a.dataset.dir && rowKey(x) === a.dataset.id);
      if (!c) return;
      e.preventDefault();
      // An idea not started has nothing in a workspace yet: pick its agent and mode instead.
      if (c.kind === "idea" && c.status === "idea") runPopup(c);
      else openRun(c);
    }
  });
}
