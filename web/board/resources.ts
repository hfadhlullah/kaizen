// The footer's resource monitor, left of the terminal button: memory, storage and every
// live terminal by workspace. Modelled on Orca's Resource Manager status segment.
import { $, html } from "./dom.ts";

const size = (n: number) => {
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
};

let res: any = null, disk: any = null, confirm = "", failed = "", timer: any = null;

// Recent memory use, kept in this page only: it starts empty on each load.
const history: number[] = [];
let diskOpen = false;
try { diskOpen = localStorage.getItem("kz-res-disk") === "1"; } catch {}

// The largest rows, the rest folded into one, so the bar stays readable.
const top = (rows: any[]) => {
  const head = rows.slice(0, 4).map((r) => [r.name, r.bytes] as [string, number]), left = rows.slice(4).reduce((n, r) => n + r.bytes, 0);
  return left ? [...head, ["Other", left] as [string, number]] : head;
};

// A segmented bar with its legend beside the values, so identity is never colour alone.
const split = (parts: [string, number][], rows = true) => {
  const sum = parts.reduce((n, p) => n + p[1], 0) || 1;
  return html`<div class="rseg">${parts.map(([n, v], i) => html`<i class="s${i}" style="flex:${v} 0 2px" title="${n}: ${size(v)}"></i>`)}</div>
    ${rows && parts.map(([n, v], i) => html`<div class="rsrow"><span><u class="s${i}"></u>${n}</span><em>${Math.round((v / sum) * 100)}%</em><b>${size(v)}</b></div>`)}`;
};

function spark() {
  if (history.length < 2) return "";
  const x = (i: number) => (i / (history.length - 1)) * 100, y = (v: number) => 36 - v * 0.34;
  const line = history.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return html`<svg class="rspark" viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-label="Memory use over recent minutes"><polygon points="0,36 ${line} 100,36"></polygon><polyline points="${line}" vector-effect="non-scaling-stroke"></polyline></svg>`;
}

const pop = () => document.getElementById("respop");

function draw() {
  const box = pop();
  if (!box || !res) return;
  const pct = Math.round((res.system.used / res.system.total) * 100);
  const groups = new Map<string, any[]>();
  for (const t of res.terminals) {
    const g = `${t.project || "Other"} / ${t.ws.split(/[\\/]/).pop() || "main"}`;
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(t);
  }
  const row = (t: any) => html`<div class="rsrow"><span title="${t.title}">${t.title}</span><b>${t.rss == null ? "–" : size(t.rss)}</b>${
    confirm === t.key
      ? html`<button type="button" data-keep>Keep</button><button type="button" class="yes" data-kill="${t.key}">Kill</button>`
      : html`${t.dir ? html`<button type="button" data-open="${t.key}">Open</button>` : ""}<button type="button" class="kill" data-ask="${t.key}" aria-label="Kill ${t.title}">Kill</button>`
  }</div>`;
  const other = Math.max(0, res.system.used - res.kaizen), free = Math.max(0, res.system.total - res.system.used);
  const mem = html`
    <h3>Memory</h3>
    <div class="rhero"><b>${pct}%</b><span>${size(res.system.used)} of ${size(res.system.total)} used</span></div>
    ${spark()}
    ${split([["Kaizen and its terminals", res.kaizen], ["Other apps", other], ["Free", free]])}`;
  const rest = html`
    <h3><button type="button" class="rfold" data-fold aria-expanded="${diskOpen}"><span>${diskOpen ? "▾" : "▸"}</span> Storage</button><span class="rbtns"><button type="button" data-cleanup title="Open a Claude Code in Home that runs /disk-cleanup">Cleanup</button><button type="button" data-rescan>${disk?.scanning ? "Scanning…" : "Rescan"}</button></span></h3>
    ${disk?.at ? html`<div class="rhero"><b>${size(disk.total)}</b><span>used by kaizen</span></div>${split(top(disk.rows), diskOpen)}` : html`<div class="rnote">Scanning…</div>`}
    <h3>Terminals (${res.terminals.length})</h3>
    ${failed ? html`<div class="rnote" role="alert">${failed}</div>` : ""}
    ${res.terminals.length ? [...groups].map(([g, ts]) => html`<div class="rgrp">${g}</div>${ts.map(row)}`) : html`<div class="rnote">No live terminals.</div>`}`;
  // Memory changes on every poll; the rest stays put, or a row's button would lose focus.
  for (const [id, m] of [["resm", mem], ["resr", rest]] as const) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement("div"); el.id = id; box.append(el); }
    const text = String(m);
    if (el.dataset.was !== text) { el.dataset.was = text; el.innerHTML = text; }
  }
}

async function load() {
  try {
    res = await (await fetch("/resources")).json();
    history.push((res.system.used / res.system.total) * 100);
    if (history.length > 60) history.shift();
    const b = $("res");
    b.querySelector("span").textContent = size(res.kaizen);
    b.title = `Kaizen uses ${size(res.kaizen)} of memory`;
    draw();
  } catch { /* board restarting */ }
}

async function loadDisk(refresh = false) {
  try {
    disk = await (await fetch("/resources/storage" + (refresh ? "?refresh=1" : ""))).json();
    draw();
  } catch { /* board restarting */ }
}

function close() {
  pop()?.remove();
  confirm = failed = "";
  $("res").setAttribute("aria-expanded", "false");
  clearInterval(timer);
  timer = setInterval(load, 15_000);
}

function open() {
  const box = document.createElement("div");
  box.id = "respop";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Resources");
  document.body.append(box);
  $("res").setAttribute("aria-expanded", "true");
  box.onclick = (e) => void click(e);
  draw();
  void load();
  void loadDisk();
  clearInterval(timer);
  timer = setInterval(() => { void load(); if (disk?.scanning || !disk?.at) void loadDisk(); }, 3000);
}

async function click(e: MouseEvent) {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  const d = b.dataset;
  if ("fold" in d) {
    diskOpen = !diskOpen;
    try { localStorage.setItem("kz-res-disk", diskOpen ? "1" : "0"); } catch {}
    return draw();
  }
  if ("rescan" in d) return void loadDisk(true);
  // Cleanup: a new Claude Code in the Home window, starting on the disk-cleanup skill.
  if ("cleanup" in d) return void dispatchEvent(new CustomEvent("kz-home-start", { detail: { agent: "claude", prompt: "/disk-cleanup" } }));
  if ("keep" in d) { confirm = ""; return draw(); }
  if (d.ask) { confirm = d.ask; failed = ""; return draw(); }
  if (d.open) {
    const t = res.terminals.find((x: any) => x.key === d.open);
    if (!t) return;
    close();
    if (dispatchEvent(new CustomEvent("kz-open-term", { cancelable: true, detail: { dir: t.dir, ws: t.ws, key: t.key } }))) location.href = `/?view=ws&dir=${encodeURIComponent(t.dir)}&ws=${encodeURIComponent(t.ws)}`;
    return;
  }
  if (d.kill) {
    confirm = "";
    const r = await fetch("/pty/kill", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: d.kill }) }).catch(() => null);
    failed = r?.ok ? "" : "Could not kill that terminal.";
    await load();
    draw();
  }
}

export function initResources() {
  const b = $("res");
  b.onclick = () => (pop() ? close() : open());
  addEventListener("pointerdown", (e) => { if (pop() && !(e.target as Element).closest("#respop,#res")) close(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && pop()) close(); });
  void load();
  timer = setInterval(load, 15_000);
}
