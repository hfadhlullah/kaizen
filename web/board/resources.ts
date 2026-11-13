// The footer's resource monitor, left of the terminal button, laid out like macOS Control Center
// (approved concept "Control Center", .preview/resource-monitor): a Memory tile and a Storage tile
// side by side, each opening in place to its detail, and every live terminal heaviest first.
import { $, html, ico, raw } from "./dom.ts";

const size = (n: number) => {
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
};

let res: any = null, disk: any = null, confirm = "", failed = "", timer: any = null;

// Recent memory use, kept in this page only: it starts empty on each load.
const history: number[] = [];
let diskOpen = false, memOpen = false;
try { diskOpen = localStorage.getItem("kz-res-disk") === "1"; memOpen = localStorage.getItem("kz-res-mem") === "1"; } catch {}
const keep = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch {} };
const MARKS = ["claude", "codex", "gemini"];
const CHEV = raw('<svg class="rchev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>');
// Cleanup is a broom, Rescan a refresh arrow: icon buttons, named by title and aria-label.
const BROOM = raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3l-4 9"/><path d="M6.5 12h8l1.5 8.5a.5.5 0 0 1-.5.5H5.5a.5.5 0 0 1-.5-.5z"/><path d="M8 21l.5-4M11.5 21v-4M15 21l-.5-4"/></svg>');
const REFRESH = raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>');

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
  const other = Math.max(0, res.system.used - res.kaizen), free = Math.max(0, res.system.total - res.system.used);
  const C = 94.25; // the ring's circumference (r 15)
  const mem = html`<button type="button" class="rtile${memOpen ? " open" : ""}" data-mem aria-expanded="${memOpen}">
    <span class="rth">Memory${CHEV}</span>
    <svg class="rring" viewBox="0 0 36 36" role="img" aria-label="${pct}% of memory used"><circle cx="18" cy="18" r="15"></circle><circle class="on" cx="18" cy="18" r="15" stroke-dasharray="${((pct / 100) * C).toFixed(1)} ${C}" transform="rotate(-90 18 18)"></circle><text x="18" y="20.6" text-anchor="middle">${pct}%</text></svg>
    <span class="rcap">${size(res.system.used)} of ${size(res.system.total)}</span>
    ${memOpen ? html`<span class="rmore">${spark()}${split([["Kaizen and its terminals", res.kaizen], ["Other apps", other], ["Free", free]])}</span>` : ""}
  </button>`;
  const dsk = html`<div class="rtile${diskOpen ? " open" : ""}">
    <div class="rth"><button type="button" class="rtt" data-fold aria-expanded="${diskOpen}">Storage${CHEV}</button><span class="rib"><button type="button" data-cleanup title="Clean up: a Claude Code in Home runs /disk-cleanup" aria-label="Clean up">${BROOM}</button><button type="button" class="${disk?.scanning ? "spin" : ""}" data-rescan title="${disk?.scanning ? "Scanning…" : "Rescan"}" aria-label="Rescan">${REFRESH}</button></span></div>
    ${disk?.at ? html`<div class="rbig">${size(disk.total)}</div><span class="rcap l">used by kaizen</span>${split(top(disk.rows), false)}${diskOpen ? html`<div class="rmore">${disk.rows.slice(0, 6).map((r) => html`<div class="rsrow"><span title="${r.name}">${r.name}</span><b>${size(r.bytes)}</b></div>`)}${disk.rows.length > 6 ? html`<div class="rsrow"><span>${disk.rows.length - 6} more</span><b>${size(disk.rows.slice(6).reduce((n, r) => n + r.bytes, 0))}</b></div>` : ""}</div>` : ""}` : html`<span class="skel" style="width:70%"></span><span class="skel" style="width:45%"></span>`}
  </div>`;
  const ts = [...res.terminals].sort((a, b) => (b.rss ?? 0) - (a.rss ?? 0));
  const mark = (t: any) => (MARKS.includes(t.agent) ? raw(`<svg><use href="#i-${t.agent}"/></svg>`) : ico("term"));
  const row = (t: any) => html`<div class="rtr"><span class="ric">${mark(t)}</span><span class="rnm"><b title="${t.title}">${t.title}</b><small>${t.project || "Home"} / ${t.ws.split(/[\\/]/).pop() || "main"}</small></span><span class="rsz">${t.rss == null ? "–" : size(t.rss)}</span><span class="ract">${
    confirm === t.key
      ? html`<button type="button" data-keep>Keep</button><button type="button" class="yes" data-kill="${t.key}">Kill</button>`
      : html`${t.dir ? html`<button type="button" data-open="${t.key}">Open</button>` : ""}<button type="button" class="kill" data-ask="${t.key}" aria-label="Kill ${t.title}">Kill</button>`
  }</span></div>`;
  const term = html`<div class="rtile w">
    <div class="rth"><span>Terminals</span><small>${ts.length ? `${ts.length} running` : ""}</small></div>
    ${failed ? html`<div class="rnote" role="alert">${failed}</div>` : ""}
    ${ts.length ? html`<div class="rterms" id="rterms">${ts.map(row)}</div>` : html`<div class="rnote">No terminals. Start one with + in a workspace.</div>`}
  </div>`;
  // Each tile is redrawn only when its own markup changed: memory moves on every poll, and a
  // terminal row's button keeps focus while the rest stays put.
  for (const [id, m] of [["resm", mem], ["resd", dsk], ["rest", term]] as const) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement("div"); el.id = id; box.append(el); }
    const text = String(m);
    if (el.dataset.was !== text) { el.dataset.was = text; el.innerHTML = text; }
    el.className = id === "rest" || (id === "resm" ? memOpen : diskOpen) ? "rcell w" : "rcell";
  }
  // The other half tile does not stay alone beside a gap while one is open.
  box.classList.toggle("one", memOpen || diskOpen);
  const list = document.getElementById("rterms");
  if (list) {
    const end = () => list.classList.toggle("end", list.scrollHeight - list.scrollTop - list.clientHeight < 4);
    list.onscroll = end;
    end();
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
  if ("fold" in d) { diskOpen = !diskOpen; keep("kz-res-disk", diskOpen); return draw(); }
  if ("mem" in d) { memOpen = !memOpen; keep("kz-res-mem", memOpen); return draw(); }
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
