// The Video page: kaizen-video's videos as a library (one tile per rendered shape, at
// that shape), and an editor for a film's on-screen words with its built preview.
// Bundled into web/video.js by `bun run build:web`. The server keeps every path; the
// page names a video by its place number and folder name only.
import { refreshBoardBadge } from "./board/badge.ts";
import { initRail } from "./board/workspace.ts";

type Format = "9x16" | "16x9" | "4x5";
type Job = { id: number; kind: string; state: string; step: number; total: number; label: string[]; error: string | null; place: number; name: string };
// letter..recipe: a filed version's revision (cli/versions.ts); kind "new" is a render still being filed.
type Output = {
  format: Format | null; file: string; thumb: string | null; srt: string | null; seconds: number | null; at: number;
  letter?: string; rev?: number; kind?: "current" | "trying" | "history" | "new"; preset?: string; from?: string | null; recipe?: boolean;
};
type Video = {
  place: number; where: string; name: string; mode: "film" | "footage"; preset: string; title: string; formats: Format[];
  platforms: string[]; seconds: number | null; text: string; poster: string | null; built: boolean; builtAt: number; size: [number, number] | null; outputs: Output[]; revising: string | null;
  job: Job | null; status: "draft" | "queued" | "building" | "rendering" | "ready" | "failed"; send: Send | null; sends: Send[];
};
type Send = { at: number; via: "localsend" | "whatsapp"; to: string; file: string; state: "waiting" | "uploading" | "sent" | "failed"; pct: number; error: string | null };
type Beat = { i: number; kind: string; vo: string | null; line: string; start: number; len: number | null; title?: string; sub?: string; kick?: string; items?: string[] };
type Film = { name: string; preset: string; format: Format; platforms: string[]; beats: Beat[]; stills: string[]; job: Job | null; log: string };

const PLATFORMS: Record<string, Format> = {
  "TikTok": "9x16", "Instagram Reels": "9x16", "YouTube Shorts": "9x16", "WhatsApp Status": "9x16", "YouTube": "16x9", "Instagram feed": "4x5",
};
const SIZE: Record<Format, [number, number]> = { "9x16": [1080, 1920], "16x9": [1920, 1080], "4x5": [1080, 1350] };
const COLORS = ["#b4462f", "#a8720a", "#2d50a5", "#0f8fa3", "#1f9d55", "#7a4fb5", "#c2416b", "#5b6b8c"];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const mmss = (s: number | null) => s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const ratio = (f: Format | null) => (f ?? "9x16").replace("x", ":");
const fileUrl = (v: { place: number; name: string }, rel: string) => `/video/f/${v.place}/${encodeURIComponent(v.name)}/${rel.split("/").map(encodeURIComponent).join("/")}`;
const LABEL: Record<Video["status"], string> = { draft: "Draft", queued: "Queued", building: "Building preview", rendering: "Rendering", ready: "Ready", failed: "Failed" };

let videos: Video[] = [];
type Agent = { place: number; name: string; pty: string; alive: boolean; asking: boolean; at: number };
let agents: Agent[] = [];
let places: { i: number; label: string; dir: string }[] = [];
// The newest agent the page started on a video, while the board still holds its terminal.
const agentOn = (place: number, name: string) => agents.filter((a) => a.place === place && a.name === name).sort((a, b) => b.at - a.at)[0];
let filter = "";
let toastT: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("on"), 3200);
}
async function post(path: string, body: unknown) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.why || `${r.status}`);
  return j;
}

// ---- library

async function load() {
  let r: Response;
  try { r = await fetch("/video/list"); } catch { toast("The board is not running"); return; }
  const d = await r.json();
  videos = d.videos;
  agents = d.agents ?? [];
  places = d.places;
  $("emptyhow").innerHTML = `Videos are folders under <code>videos/</code> in ${d.places.map((p: { dir: string }) => `<code>${esc(p.dir)}</code>`).join(" or ")}. Ask the kaizen-video skill to make one, and it shows up here.`;
  drawGrid();
  if (open) { refreshEditor(); drawSendState(); }
  drawDock();
}

// One tile per rendered shape; a video with nothing rendered yet shows once, at its own shape.
function tiles() {
  return videos.flatMap((v) => {
    // A version's tries and history stay on its page; the library shows what each version is now.
    const live = v.outputs.filter((o) => o.kind !== "history" && o.kind !== "trying");
    const outs = live.length ? live : [null];
    const shapes = new Map<string, Output | null>();
    for (const o of outs) if (!shapes.has(o?.format ?? v.formats[0]!)) shapes.set(o?.format ?? v.formats[0]!, o);
    return [...shapes].map(([f, o]) => ({ v, f: f as Format, o }));
  });
}

function drawGrid() {
  const words = $<HTMLInputElement>("q").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const all = tiles();
  const shown = all.filter(({ v }) => {
    const hay = [v.title, v.name, v.text, v.preset, v.where, v.mode, ...v.platforms].join(" ").toLowerCase();
    const st = filter === "busy" ? ["queued", "building", "rendering"].includes(v.status) : !filter || v.status === filter;
    return st && words.every((w) => hay.includes(w));
  });
  // Videos an agent is still setting up: no film.json yet, so only the agent knows them.
  const making = agents.filter((a) => a.alive && !videos.some((v) => v.place === a.place && v.name === a.name) && words.every((w) => a.name.includes(w)) && (!filter || filter === "busy" || filter === "draft"));
  $("grid").removeAttribute("aria-busy");
  $("grid").innerHTML = making.map((a) => `<article class="vid" tabindex="0" data-p="${a.place}" data-n="${esc(a.name)}" aria-label="${esc(a.name)}, being made">
      <div class="thumb making" style="--ar:9/16"><span class="t">${a.asking ? "Claude is asking you something" : "Claude is making this"}</span></div>
      <div class="meta"><b>${esc(a.name)}</b><div class="plats"><i class="where">${esc(places[a.place]?.label ?? "")}</i></div>
        <span class="pill ${a.asking ? "draft" : "building"}">${a.asking ? "Needs your answer" : "Being made"}</span></div></article>`).join("") + shown.map(({ v, f, o }) => {
    const [w, h] = SIZE[f];
    const img = o?.thumb ? fileUrl(v, o.thumb) : v.poster ? fileUrl(v, v.poster) : "";
    const plats = v.platforms.filter((p) => PLATFORMS[p] === f);
    const busy = v.job && (v.job.state === "running" || v.job.state === "queued");
    const pct = busy && v.job!.total ? Math.round((v.job!.step / v.job!.total) * 100) : 0;
    return `<article class="vid" tabindex="0" data-p="${v.place}" data-n="${esc(v.name)}" aria-label="${esc(v.name)}, ${ratio(f)}">
      <div class="thumb" style="--ar:${w}/${h}">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}
        <span class="tag sh">${ratio(f)}</span><span class="t">${img ? "" : esc(v.title)}</span>
        ${(o?.seconds ?? v.seconds) != null ? `<span class="tag du">${mmss(o?.seconds ?? v.seconds)}</span>` : ""}
        ${busy ? `<span class="bar" style="width:${Math.max(6, pct)}%"></span>` : ""}</div>
      <div class="meta"><b>${esc(v.name)}</b>
        <div class="plats">${plats.map((p) => `<i>${esc(p)}</i>`).join("")}<i class="where" title="Where it lives">${esc(v.where)}</i></div>
        <span class="pill ${v.status}">${LABEL[v.status]}${v.preset ? ` · ${esc(v.preset)}` : ""}</span></div></article>`;
  }).join("");
  $("nores").hidden = !all.length || !!shown.length || !!making.length;
  $("empty").hidden = !!all.length || !!making.length;
}

$("grid").addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>(".vid");
  if (t) go(Number(t.dataset.p), t.dataset.n!);
});
$("grid").addEventListener("keydown", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>(".vid");
  if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); go(Number(t.dataset.p), t.dataset.n!); }
});
$("q").addEventListener("input", drawGrid);
$("fstat").addEventListener("click", (e) => {
  const c = (e.target as HTMLElement).closest<HTMLElement>(".chip");
  if (!c) return;
  filter = c.dataset.f!;
  for (const x of $("fstat").querySelectorAll(".chip")) x.classList.toggle("on", x === c);
  drawGrid();
});

// ---- editor: #<place>/<name> in the address, so a reload or a shared tab opens the same video

let open: { place: number; name: string } | null = null;
let film: Film | null = null;
let edits = new Map<number, Partial<Beat>>();
let picked = new Set<string>();
let dur = 0;
let playing = false;
let lastJob = "";

function go(place: number | null, name?: string) {
  const want = place == null ? "" : `#${place}/${encodeURIComponent(name!)}`;
  if (location.hash !== want) history.pushState(null, "", want || location.pathname);
  route();
}
function route() {
  const m = location.hash.match(/^#(\d+)\/(.+)$/);
  open = m ? { place: Number(m[1]), name: decodeURIComponent(m[2]!) } : null;
  const wiz = location.hash === "#new";
  $("lib").hidden = !!open || wiz;
  $("edit").hidden = !open;
  $("wiz").hidden = !wiz;
  film = null;
  edits = new Map();
  rtab = "form";
  shown = null;
  sp = null;
  $("sendp").innerHTML = "";
  // Opening a video: placeholders for the player and the form until its data arrives, as the board shows.
  if (open && !cur()) {
    parkDock();
    // Not class "ed": refreshEditor takes a missing .ed to mean "draw the editor now".
    $("editbody").innerHTML = `<div class="edskel" aria-busy="true"><span class="skel" style="aspect-ratio:9/16"></span>
      <div style="display:grid;gap:10px"><span class="skel" style="height:36px;width:180px"></span><span class="skel" style="height:56px"></span><span class="skel" style="height:56px"></span><span class="skel" style="height:56px"></span></div></div>`;
  }
  if (open) refreshEditor(true);
  else { parkDock(); $("editbody").innerHTML = ""; }
  if (wiz) drawWizard();
  drawDock();
}
addEventListener("popstate", route);

const cur = () => open && videos.find((v) => v.place === open!.place && v.name === open!.name);

async function refreshEditor(first = false) {
  const v = cur();
  if (!v) {
    parkDock();
    const a = open && agentOn(open.place, open.name);
    if (a) $("editbody").innerHTML = `<div class="crumb"><button data-back>‹ Back to videos</button></div>
      <div class="ehead"><h2>${esc(a.name)}</h2></div><p class="note">Claude is setting this video up. Answer its questions above; the editor opens here once the video has its storyboard.</p>`;
    else if (videos.length) $("editbody").innerHTML = `<p class="blank">That video is gone. <button class="btn" data-back>Back to videos</button></p>`;
    return;
  }
  // What, when it changes, needs a redraw: the job, the set of rendered versions (a render or a delete),
  // or the draft rebuilt (an edit or an Ask Claude change: Render final comes back).
  const jobKey = JSON.stringify([v.job && [v.job.id, v.job.state, v.job.step], v.outputs.map((o) => [o.file, o.kind]), v.builtAt, v.revising]);
  if (!first && (film || v.mode !== "film") && jobKey === lastJob) return;
  const builtNow = lastJob && v.job?.state === "done" && jobKey !== lastJob;
  lastJob = jobKey;
  // Nothing drawn for this video yet: the first answer after opening it, however it arrives.
  const fresh = first || !$("edit").querySelector(".ed");
  if (v.mode === "film") {
    const r = await fetch(`/video/film?p=${v.place}&name=${encodeURIComponent(v.name)}`);
    if (!r.ok) { parkDock(); $("editbody").innerHTML = `<p class="blank">Could not read this film's film.json.</p>`; return; }
    film = await r.json();
  }
  if (fresh) picked = new Set(film?.platforms.length ? film.platforms : v.platforms);
  if (fresh) drawEditor(v);
  else { drawJob(v); drawFiles(v); drawRender(v); if (builtNow && !shown) reloadPreview(v); }
}

function drawEditor(v: Video) {
  picked0 = false;
  const f = (film?.format ?? v.formats[0] ?? "9x16") as Format;
  const [w, h] = v.size ?? SIZE[f];
  const beats = film?.beats ?? [];
  dur = beats.reduce((a, b) => Math.max(a, b.start + (b.len ?? 0)), 0) || v.seconds || 0;
  // The live terminal (#dock) is parked outside the editor while it is redrawn, then put back in the
  // Terminal tab: the same element, so its session stays connected.
  const dock = parkDock();
  $("editbody").innerHTML = `
    <div class="crumb"><button data-back>‹ Back to videos</button></div>
    <div class="ehead"><h2>${esc(v.name)}</h2><span class="pill ${v.status}" id="stat">${LABEL[v.status]}</span>
      <div class="acts">${v.mode === "film" ? `<button class="btn" id="stillsBtn" title="Build the film and take three still frames">Preview stills</button>` : ""}
      <span class="pill ready" id="rdone" hidden title="Nothing changed since the last render">Rendered</span><button class="btn pri" id="render">Render final</button></div></div>
    <div class="ed">
      <div class="player">
        <div class="screen" style="--ar:${w}/${h}" id="screen">${v.built
          ? `<iframe id="frame" title="Preview" src="${esc(fileUrl(v, "v/film/index.html"))}" width="${w}" height="${h}"></iframe>`
          : `<div class="none">No preview yet. Press <b>Preview stills</b> or save a change to build it.</div>`}</div>
        <div class="ctrl"><button class="play" id="play" aria-label="Play" ${v.built ? "" : "disabled"}><svg><use href="#i-play"/></svg></button><span id="time">0:00 / ${mmss(dur)}</span><span class="sp"></span><span id="shape">${v.built ? `Draft · ${esc(v.preset)}` : `${ratio(f)} · ${esc(v.preset)}`}</span></div>
        ${beats.length ? `<div class="strip" id="strip">${beats.map((b, i) => `<button style="flex:${Math.max(1, b.len ?? 1)};--c:${COLORS[i % COLORS.length]}" data-b="${i}" title="${esc(b.kind)} ${mmss(b.start)}">${i + 1}</button>`).join("")}<span class="head" id="head" style="left:0"></span></div>` : ""}
        <div class="stills" id="stills">${(film?.stills ?? []).map((s) => `<a href="${esc(fileUrl(v, s))}" target="_blank" rel="noopener"><img src="${esc(fileUrl(v, s))}?t=${Date.now()}" alt="Still frame"></a>`).join("")}</div>
      </div>
      <div class="rcol">
      <div class="tabs" role="tablist" aria-label="Edit or talk to Claude">
        <button role="tab" id="tab-form" data-tab="form" aria-controls="formpane">Form</button><button role="tab" id="tab-term" data-tab="term" aria-controls="termpane">Terminal<i class="tdot" aria-hidden="true"></i><span class="sr" id="tdotsr"></span></button></div>
      <div class="termpane" id="termpane" role="tabpanel" aria-labelledby="tab-term"><p class="note tnone">No Claude session for this video yet. Ask Claude for a change in the Form tab and it opens here.</p></div>
      <div class="beats" id="formpane" role="tabpanel" aria-labelledby="tab-form">
        <div id="job"></div>
        ${v.mode === "film" ? beats.map((b, i) => beatRow(b, i)).join("") : `<p class="note">A video made from your footage. Its words come from what you said; change them by asking the kaizen-video skill. Render it again here.</p>`}
        <div class="savebar"><div class="chips" id="plats" role="group" aria-label="Where it goes">${Object.keys(PLATFORMS).map((p) => `<button class="chip${picked.has(p) ? " on" : ""}" data-p="${esc(p)}">${esc(p)}</button>`).join("")}</div>
          ${v.mode === "film" ? `<button class="btn pri" id="save">Save changes</button>` : ""}</div>
        <p class="note" id="platnote"></p>
        <div class="ask"><input id="askin" maxlength="2000" placeholder="Ask Claude for a bigger change, like a new voice line or a punchier hook" aria-label="Ask Claude to change this video"><button class="btn pri" id="askgo">Send</button></div>
        <p class="note">Claude works in the Terminal tab; answer it there.</p>
        <div class="files" id="files"></div>
      </div>
      </div>
    </div>`;
  $("termpane").append(dock);
  showTab();
  fit();
  drawPlats();
  drawJob(v);
  drawFiles(v);
  drawRender(v);
  if (shown) showVersion(v);
}

function beatRow(b: Beat, i: number) {
  const e = { ...b, ...edits.get(i) };
  const field = (k: "kick" | "title" | "sub", label: string) => typeof b[k] === "string"
    ? `<label>${label}<input data-i="${i}" data-k="${k}" value="${esc(e[k])}" maxlength="400"></label>` : "";
  const items = Array.isArray(b.items) ? `<label>List, one per line<textarea data-i="${i}" data-k="items">${esc((e.items ?? []).join("\n"))}</textarea></label>` : "";
  const fields = field("kick", "Small line above") + field("title", "Words on screen") + field("sub", "Line below") + items;
  return `<div class="beat" data-b="${i}"><button><span class="sw" style="--c:${COLORS[i % COLORS.length]}"></span><span class="k">${esc(b.kind)}</span>
    <span class="tm">${mmss(b.start)}–${mmss(b.start + (b.len ?? 0))}</span><span class="tx">${esc(e.title ?? e.kick ?? b.line.replace(/\[[^\]]*\]\s*/g, ""))}</span></button>
    <div class="form">${fields || `<p class="note">No words on screen in this beat.</p>`}
      ${b.line ? `<div class="said">Said: ${esc(b.line.replace(/\[[^\]]*\]\s*/g, ""))}<br><span class="note">Changing what is said records the voice again; ask Claude for that.</span></div>` : ""}</div></div>`;
}

// The iframe is the film at full size (1080×1920…), scaled down to the box.
function fit() {
  const fr = document.getElementById("frame") as HTMLIFrameElement | null, box = document.getElementById("screen");
  if (fr && box) fr.style.transform = `scale(${box.clientWidth / Number(fr.width)})`;
}
addEventListener("resize", fit);

function reloadPreview(v: Video) {
  const box = document.getElementById("screen");
  if (!box) return;
  const [w, h] = v.size ?? SIZE[(film?.format ?? "9x16") as Format];
  box.style.setProperty("--ar", `${w}/${h}`);
  box.innerHTML = `<iframe id="frame" title="Preview" src="${esc(fileUrl(v, "v/film/index.html"))}?t=${Date.now()}" width="${w}" height="${h}"></iframe>`;
  ($("play") as HTMLButtonElement).disabled = false;
  fit();
  const st = document.getElementById("stills");
  if (st && film) st.innerHTML = film.stills.map((s) => `<a href="${esc(fileUrl(v, s))}" target="_blank" rel="noopener"><img src="${esc(fileUrl(v, s))}?t=${Date.now()}" alt="Still frame"></a>`).join("");
}

function drawPlats() {
  const fs = [...new Set([...picked].map((p) => PLATFORMS[p]))];
  const n = document.getElementById("platnote");
  if (n) n.textContent = picked.size ? `Render makes ${fs.length} file${fs.length > 1 ? "s" : ""}: ${fs.map((f) => ratio(f!)).join(", ")}` : "Pick where it goes, then Render.";
}

function drawJob(v: Video) {
  const el = document.getElementById("job"), stat = document.getElementById("stat");
  if (stat) { stat.className = `pill ${v.status}`; stat.textContent = LABEL[v.status]; }
  const busy = !!v.job && (v.job.state === "running" || v.job.state === "queued");
  for (const id of ["render", "stillsBtn", "save"]) { const b = document.getElementById(id) as HTMLButtonElement | null; if (b) b.disabled = busy; }
  if (!el) return;
  const j = v.job;
  if (!j || j.state === "done" || j.state === "cancelled") { el.innerHTML = ""; return; }
  const pct = j.total ? Math.round((j.step / j.total) * 100) : 0;
  const what = j.state === "queued" ? "Waiting for another video to finish" : j.state === "failed" ? j.error ?? "Failed" : `${j.label[j.step] ?? "Working"} (step ${j.step + 1} of ${j.total})`;
  el.innerHTML = `<div class="job"><div class="row"><b>${esc(what)}</b><span class="sp"></span>${busy ? `<button class="btn" data-cancel="${j.id}">Cancel</button>` : ""}</div>
    ${busy ? `<div class="prog"><i style="width:${Math.max(4, pct)}%"></i></div>` : ""}
    ${j.state === "failed" && film?.log ? `<pre>${esc(film.log.split("\n").slice(-25).join("\n"))}</pre>` : ""}</div>`;
}

// Versions: the draft (the live build, not rendered) first, then each rendered file, labelled with the
// preset it was rendered in (output/<name>/<preset>/<file>). Clicking a row shows it in the player.
let shown: string | null = null;   // null: the draft; else a rendered file's path ("o/<preset>/<file>")
const presetOf = (file: string) => file.split("/")[1] ?? "";
// The draft's preset for a file: a filed revision carries it; a loose render sits in output/<name>/<preset>/.
const presetIn = (o: Output) => o.preset ?? presetOf(o.file);
const stamp = (ms: number) => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
// The draft has a render newer than its last build, in its own preset: nothing new to render.
const draftDone = (v: Video) => v.built && v.outputs.some((o) => presetIn(o) === v.preset && o.kind !== "history" && o.at >= v.builtAt);

// What a person sees for a version: the video's name and its preset (letters are only the store's key),
// with "(2)", "(3)" when the same preset was rendered as more than one version.
function vtitle(v: Video, l: string) {
  const firsts = v.outputs.filter((o) => o.letter && o.kind === "current");
  const me = firsts.find((o) => o.letter === l);
  if (!me) return v.name;
  const same = firsts.filter((o) => presetIn(o) === presetIn(me));
  const i = same.indexOf(me);
  return `${v.name} · ${presetIn(me)}${same.length > 1 && i > 0 ? ` (${i + 1})` : ""}`;
}

// One row: a button that shows it in the player, a line of facts, then its actions (wrapping under the
// name on a phone).
function verRow(v: Video, o: Output, label: string, facts: string, acts: string, cls = "") {
  return `<div class="file ver${cls}${shown === o.file ? " on" : ""}" data-show="${esc(o.file)}">
      <button class="vname" data-show="${esc(o.file)}" aria-pressed="${shown === o.file}">${label}</button>
      <span class="vfacts">${facts}</span>
      <span class="acts">${acts}</span></div>`;
}
const openLinks = (v: Video, o: Output) => `<a href="${esc(fileUrl(v, o.file))}" target="_blank" rel="noopener">Open</a>${o.srt ? `<a href="${esc(fileUrl(v, o.srt))}" target="_blank" rel="noopener">Captions</a>` : ""}`;
const vact = (a: string, l: string, text: string, cls = "btn", n?: number, aria?: string) =>
  `<button class="${cls}" data-vact="${a}" data-l="${esc(l)}"${n != null ? ` data-n="${n}"` : ""}${aria ? ` aria-label="${esc(aria)}"` : ""}>${text}</button>`;

function drawFiles(v: Video) {
  const el = document.getElementById("files");
  if (!el) return;
  if (shown && !v.outputs.some((o) => o.file === shown)) shown = null;
  const dur = (o: Output) => o.seconds != null ? ` · ${mmss(o.seconds)}` : "";
  const draft = v.built ? `<div class="file ver${shown ? "" : " on"}" data-show="">
      <button class="vname" data-show="" aria-pressed="${!shown}"><span class="pill draft">Draft</span><b>${esc(v.preset)}</b></button>
      <span class="vfacts">${v.revising ? `revising ${esc(vtitle(v, v.revising))}; a render becomes its next v` : "live preview, not rendered"}</span>
      ${v.revising ? `<span class="acts">${vact("new", v.revising, "Make a new version instead", "btn ghost")}</span>` : ""}</div>` : "";
  // Filed versions, by letter: the current revision, its try (if any) and its history.
  const letters = [...new Set(v.outputs.filter((o) => o.letter).map((o) => o.letter!))];
  const groups = letters.map((l) => {
    const revs = v.outputs.filter((o) => o.letter === l);
    const cur = revs.find((o) => o.kind === "current"), tr = revs.find((o) => o.kind === "trying");
    const hist = revs.filter((o) => o.kind === "history").sort((a, b) => b.rev! - a.rev!);
    if (!cur) return "";
    const N = vtitle(v, l);
    const head = verRow(v, cur, `<b>${esc(N)}</b><span class="pill ver-l">v${cur.rev}</span>`,
      `${dur(cur).slice(3)}${v.revising === l ? `${cur.seconds != null ? " · " : ""}in the draft` : ""}`,
      (cur.recipe ? vact("revise", l, "Revise", "btn", undefined, `Revise ${N}`) : "")
      + openLinks(v, cur) + `<button class="btn" data-sendfile="${esc(cur.file)}">Send</button>`
      + vact("delete", l, "Delete", "btn danger", undefined, `Delete ${N} and its history`));
    const tryRow = tr ? verRow(v, tr, `<span class="pill draft">Trying</span><b>v${tr.rev}</b>`,
      `from v${esc((tr.from ?? "").replace(/^[a-z]+/, "") || String(cur.rev))}${dur(tr)} · compare, then keep or revert`,
      vact("keep", l, "Keep", "btn pri", undefined, `Keep v${tr.rev} as ${N}`) + vact("revert", l, "Revert", "btn", undefined, `Revert ${N} to v${cur.rev}`) + openLinks(v, tr), " sub") : "";
    const histRows = hist.length ? `<details class="hist"${hist.some((o) => o.file === shown) ? " open" : ""}><summary>Earlier versions (${hist.length})</summary>${hist.map((o) =>
      verRow(v, o, `<b>v${o.rev}</b>`, `${stamp(o.at)}${dur(o)}`,
        vact("restore", l, "Restore", "btn", o.rev, `Restore v${o.rev} as ${N}`) + openLinks(v, o) + vact("delete", l, "Delete", "btn danger", o.rev, `Delete v${o.rev} of ${N}`), " sub")).join("")}</details>` : "";
    return `<div class="vgroup">${head}${tryRow}${histRows}</div>`;
  });
  // Renders still being filed (a few seconds after they finish) and the older videos/<name>/out/ files.
  const rest = v.outputs.filter((o) => !o.letter).map((o) => verRow(v, o,
    `<span class="pill ready">${ratio(o.format)}</span><b>${esc(presetIn(o))} · ${esc(o.file.split("/").pop())}</b>`,
    o.kind === "new" ? `just rendered; becoming a version${dur(o)}` : dur(o).slice(3),
    openLinks(v, o) + (o.kind === "new" ? "" : `<button class="btn" data-sendfile="${esc(o.file)}">Send</button><button class="btn danger" data-delfile="${esc(o.file)}" aria-label="Delete ${esc(presetIn(o))} version">Delete</button>`)));
  el.innerHTML = draft || v.outputs.length ? `<p class="note" style="margin:0">Versions</p>` + draft + groups.join("") + rest.join("") : "";
}
// Render final turns the draft into files. Nothing to do while a rendered version is shown, or when the
// draft was rendered in its current preset after its last build; an edit or an Ask Claude change rebuilds
// the draft, and the button comes back.
function drawRender(v: Video) {
  const b = document.getElementById("render"), done = document.getElementById("rdone");
  if (!b || !done) return;
  const off = !!shown || draftDone(v);
  b.hidden = off; done.hidden = !off;
  done.textContent = shown ? "Rendered version" : "Rendered";
  b.textContent = v.revising ? "Render new v" : "Render final";
}
// The player shows the draft (the built page, driven by the play button) or a rendered MP4 (its own controls).
function showVersion(v: Video) {
  const box = document.getElementById("screen"), label = document.getElementById("shape"), play = document.getElementById("play") as HTMLButtonElement | null;
  const o = shown && v.outputs.find((x) => x.file === shown);
  if (!box) return;
  // A rendered file plays with its own controls; the draft's play button and beat strip step aside.
  box.closest(".player")?.classList.toggle("file", !!o);
  if (!o) {
    shown = null;
    if (v.built) reloadPreview(v);
    if (label) label.textContent = `Draft · ${v.preset}`;
    const t = document.getElementById("time"), p = document.getElementById("play");
    if (t) t.textContent = `0:00 / ${mmss(dur)}`;
    if (p) { playing = false; p.innerHTML = `<svg><use href="#i-play"/></svg>`; p.setAttribute("aria-label", "Play"); }
  } else {
    box.innerHTML = `<video id="vid" src="${esc(fileUrl(v, o.file))}" controls playsinline preload="metadata" aria-label="Rendered ${esc(presetIn(o))} video"></video>`;
    if (play) play.disabled = true;
    const t = document.getElementById("time");
    if (t) t.textContent = o.seconds != null ? mmss(o.seconds) : "";
    if (label) label.textContent = `${o.letter ? `${vtitle(v, o.letter)} · v${o.rev}${o.kind === "trying" ? " (trying)" : o.kind === "history" ? " (history)" : ""}` : "Rendered · ${presetIn(o)}"}${o.seconds != null ? ` · ${mmss(o.seconds)}` : ""}`;
  }
  drawFiles(v);
  drawRender(v);
}

// ---- Send: the panel under the editor. Drawn on the person's own actions only, so a
// server change (a render step, a send's progress) never wipes a message being typed;
// the status and recent sends below it are redrawn on every change.
type Dev = { id: string; alias: string; deviceModel: string | null; deviceType: string | null };
type Chat = { id: string; name: string; type: string };
let sp: { file: string; via: "localsend" | "whatsapp"; devices: Dev[] | null; devNote: string | null; dev: string; chats: Chat[] | null; chatErr: string | null; chat: string; text: string; searching: boolean } | null = null;

function openSend(file: string) {
  const v = cur();
  if (!v) return;
  sp = { file, via: sp?.via ?? "localsend", devices: sp?.devices ?? null, devNote: sp?.devNote ?? null, dev: sp?.dev ?? "", chats: sp?.chats ?? null, chatErr: null, chat: sp?.chat ?? "", text: sp?.text || v.title || v.name, searching: false };
  drawSend();
  $("sendp").scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (sp.via === "localsend" && !sp.devices) search(false); else if (sp.via === "whatsapp" && !sp.chats) loadChats();
}
async function search(fresh: boolean) {
  if (!sp) return;
  sp.searching = true; drawSend();
  try { const d = await (await fetch(`/video/devices${fresh ? "?fresh=1" : ""}`)).json(); if (sp) { sp.devices = d.devices; sp.devNote = d.note; if (!d.devices.some((x: Dev) => x.id === sp.dev)) sp.dev = d.devices[0]?.id ?? ""; } }
  catch { toast("The board is not running"); }
  if (sp) { sp.searching = false; drawSend(); }
}
async function loadChats() {
  if (!sp) return;
  try { const d = await (await fetch("/video/chats")).json(); if (sp) { sp.chats = d.chats; sp.chatErr = d.error ?? null; if (!d.chats.some((c: Chat) => c.id === sp.chat)) sp.chat = d.chats[0]?.id ?? ""; } }
  catch { toast("The board is not running"); }
  drawSend();
}
function drawSend() {
  const el = $("sendp"), v = cur();
  if (!sp || !v) { el.innerHTML = ""; return; }
  const kind = (d: Dev) => d.deviceModel || d.deviceType || "";
  const local = sp.via === "localsend";
  el.innerHTML = `<div class="sendp"><div class="row"><h3>Send</h3>
      <label class="sr" for="sfile">File</label><select id="sfile">${v.outputs.flatMap((o) => [o.file, o.srt, o.thumb]).filter(Boolean).map((f) => `<option value="${esc(f)}"${f === sp!.file ? " selected" : ""}>${esc(f!.split("/").pop())}</option>`).join("")}</select>
      <span class="sp"></span><button class="ib" data-sclose aria-label="Close send">✕</button></div>
    <div class="chips" role="tablist"><button class="chip${local ? " on" : ""}" role="tab" aria-selected="${local}" data-via="localsend">LocalSend</button><button class="chip${local ? "" : " on"}" role="tab" aria-selected="${!local}" data-via="whatsapp">WhatsApp <small>via Hermes</small></button></div>
    ${local ? `<div class="sendbox">
        <div class="chips" role="group" aria-label="Device">${sp.searching ? `<span class="note">Looking for devices…</span>` : (sp.devices ?? []).map((d) => `<button class="chip${d.id === sp!.dev ? " on" : ""}" data-dev="${esc(d.id)}">${esc(d.alias)}${kind(d) ? ` <small>${esc(kind(d))}</small>` : ""}</button>`).join("") || `<span class="note">No devices found. Open LocalSend on the phone, on the same Wi‑Fi, then search again.</span>`}</div>
        ${sp.devNote ? `<span class="note">${esc(sp.devNote)}</span>` : ""}
        <div class="row"><button class="btn" data-search ${sp.searching ? "disabled" : ""}>Search again</button><span class="sp"></span><button class="btn pri" data-sgo ${sp.dev && !sp.searching ? "" : "disabled"}>Send to device</button></div>
        <span class="note">The device asks to accept; it has 2 minutes.</span></div>`
    : `<div class="sendbox">
        ${sp.chatErr ? `<span class="note">${esc(sp.chatErr)}</span>` : sp.chats ? `<label>Chat<select id="schat">${sp.chats.map((c) => `<option value="${esc(c.id)}"${c.id === sp!.chat ? " selected" : ""}>${esc(c.name)}${c.type ? ` (${esc(c.type)})` : ""}</option>`).join("")}</select></label>` : `<span class="note">Asking Hermes for its chats…</span>`}
        <label>Message<textarea id="stext" maxlength="1000">${esc(sp.text)}</textarea></label>
        <div class="row"><span class="sp"></span><button class="btn pri" data-sgo ${sp.chat ? "" : "disabled"}>Send on WhatsApp</button></div></div>`}
    <div id="sendst"></div></div>`;
  drawSendState();
}
const when = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function drawSendState() {
  const el = document.getElementById("sendst"), v = cur();
  if (!el || !v) return;
  const s = v.send;
  const line = (x: Send) => x.state === "sent" ? `Sent to ${x.to}` : x.state === "failed" ? (x.error ?? "Failed") : x.state === "waiting" ? (x.via === "localsend" ? `Waiting for ${x.to} to accept…` : `Hermes is sending to ${x.to}…`) : `Sending to ${x.to}… ${x.pct}%`;
  const busy = !!s && (s.state === "waiting" || s.state === "uploading");
  el.innerHTML = (s ? `<div class="job sendres ${s.state}" role="status"><div class="row"><b>${esc(line(s))}</b></div>${busy && s.via === "localsend" ? `<div class="prog"><i style="width:${Math.max(4, s.pct)}%"></i></div>` : ""}</div>` : "")
    + (v.sends.length ? `<p class="note" style="margin:0">Recent sends</p><ul class="sends">${v.sends.map((x) => `<li><span class="pill ${x.state === "sent" ? "ready" : "failed"}">${x.state === "sent" ? "Sent" : "Failed"}</span> ${esc(x.file.split("/").pop())} → ${esc(x.to)}${x.via === "whatsapp" ? " (WhatsApp)" : ""}, ${when(x.at)}${x.state === "failed" && x.error ? ` <span class="note">${esc(x.error)}</span>` : ""}</li>`).join("")}</ul>` : "");
  for (const b of document.querySelectorAll<HTMLButtonElement>("#sendp [data-sgo]")) if (busy) b.disabled = true;
}
$("sendp").addEventListener("click", async (e) => {
  const t = e.target as HTMLElement, v = cur();
  if (!sp || !v) return;
  if (t.closest("[data-sclose]")) { sp = null; return drawSend(); }
  const via = t.closest<HTMLElement>("[data-via]");
  if (via) { sp.via = via.dataset.via as "localsend" | "whatsapp"; drawSend(); return sp.via === "localsend" ? (sp.devices ? undefined : search(false)) : (sp.chats ? undefined : loadChats()); }
  const dev = t.closest<HTMLElement>("[data-dev]");
  if (dev) { sp.dev = dev.dataset.dev!; return drawSend(); }
  if (t.closest("[data-search]")) return search(true);
  if (!t.closest("[data-sgo]")) return;
  try {
    await post("/video/send", { p: v.place, name: v.name, file: sp.file, via: sp.via, to: sp.via === "localsend" ? sp.dev : sp.chat, text: sp.text });
    toast(sp.via === "localsend" ? "Accept it on the device" : "Hermes is sending it");
  } catch (err) { toast(err instanceof Error ? err.message : String(err)); }
  load();
});
$("sendp").addEventListener("change", (e) => {
  const t = e.target as HTMLSelectElement;
  if (!sp) return;
  if (t.id === "sfile") sp.file = t.value;
  if (t.id === "schat") sp.chat = t.value;
});
$("sendp").addEventListener("input", (e) => {
  const t = e.target as HTMLTextAreaElement;
  if (sp && t.id === "stext") sp.text = t.value;
});

function selectBeat(i: number, seek = true) {
  document.querySelectorAll(".beat").forEach((b) => b.classList.toggle("open", Number((b as HTMLElement).dataset.b) === i));
  document.querySelectorAll("#strip button").forEach((b) => b.classList.toggle("on", Number((b as HTMLElement).dataset.b) === i));
  const b = film?.beats[i];
  picked0 = true;
  if (seek && b) send({ kz: "seek", t: b.start + Math.min(1.2, (b.len ?? 0) / 2) });
}
const send = (m: unknown) => (document.getElementById("frame") as HTMLIFrameElement | null)?.contentWindow?.postMessage(m, location.origin);

addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.data?.kz !== "time") return;
  const { t, dur: d, on } = e.data as { t: number; dur: number; on: boolean };
  dur = d || dur;
  const tm = document.getElementById("time"), hd = document.getElementById("head");
  if (tm) tm.textContent = `${mmss(t)} / ${mmss(dur)}`;
  if (hd && dur) hd.style.left = `${(t / dur) * 100}%`;
  if (on !== playing) {
    playing = on;
    const p = document.getElementById("play");
    if (p) { p.innerHTML = `<svg><use href="#i-${on ? "pause" : "play"}"/></svg>`; p.setAttribute("aria-label", on ? "Pause" : "Play"); }
  }
});

// Tabs: arrow keys move between Form and Terminal (the WAI-ARIA tabs pattern).
$("edit").addEventListener("keydown", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]");
  if (!t || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
  e.preventDefault();
  rtab = rtab === "form" ? "term" : "form";
  showTab();
  document.querySelector<HTMLElement>(`[data-tab=${rtab}]`)?.focus();
});
$("edit").addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  const v = cur();
  if (t.closest("[data-back]")) return go(null);
  const tab = t.closest<HTMLElement>("[data-tab]");
  if (tab) { rtab = tab.dataset.tab as "form" | "term"; return showTab(); }
  if (!v) return;
  const beat = t.closest<HTMLElement>(".beat>button");
  if (beat) return selectBeat(Number(beat.parentElement!.dataset.b));
  const seg = t.closest<HTMLElement>("#strip button");
  if (seg) return selectBeat(Number(seg.dataset.b));
  if (t.closest("#play")) return send({ kz: playing ? "pause" : "play" });
  const ver = t.closest<HTMLElement>("[data-show]");
  if (ver && (t.closest(".vname") || !t.closest("a, button"))) {
    const want = ver.dataset.show || null;
    if (want === shown) return;   // already showing: a second click must not reload the draft
    shown = want;
    return showVersion(v);
  }
  const chip = t.closest<HTMLElement>("#plats .chip");
  if (chip) { const p = chip.dataset.p!; picked.has(p) ? picked.delete(p) : picked.add(p); chip.classList.toggle("on", picked.has(p)); return drawPlats(); }
  const sf = t.closest<HTMLElement>("[data-sendfile]");
  if (sf) return openSend(sf.dataset.sendfile!);
  // Version actions (cli/versions.ts). Each asks first where something is replaced or removed.
  const va = t.closest<HTMLElement>("[data-vact]");
  if (va) {
    const a = va.dataset.vact!, l = va.dataset.l!, n = va.dataset.n ? Number(va.dataset.n) : undefined;
    const tr = v.outputs.find((o) => o.letter === l && o.kind === "trying"), cur = v.outputs.find((o) => o.letter === l && o.kind === "current");
    const N = vtitle(v, l);
    const unrendered = edits.size > 0 || (v.built && !draftDone(v));
    const ask = a === "revise" ? (unrendered ? `The draft has changes that are not rendered. Revising ${N} replaces the draft with ${N}'s recipe, and those changes are lost. Go on?` : null)
      : a === "keep" ? `Keep v${tr?.rev} as ${N}? The current v${cur?.rev} moves to ${N}'s history, where you can restore it.`
      : a === "revert" ? `Revert ${N}? The try v${tr?.rev} is deleted from disk${cur?.recipe ? `, and the draft goes back to ${N}${unrendered ? "; its changes that are not rendered are lost" : ""}` : ""}.`
      : a === "restore" ? `Restore v${n} for ${N}? The current v${cur?.rev} moves to the history.${v.revising === l && v.outputs.find((o) => o.letter === l && o.rev === n)?.recipe ? ` The draft becomes v${n}${unrendered ? "; its changes that are not rendered are lost" : ""}.` : ""}`
      : a === "delete" ? (n != null ? `Delete v${n} from ${N}'s history? Its video, captions and thumbnail are removed from disk.` : `Delete ${N} with its try and its whole history? Every one of its videos is removed from disk. Other versions and the draft stay.`)
      : null;
    if (ask && !confirm(ask)) return;
    try {
      const r = await post("/video/version", { p: v.place, name: v.name, action: a, letter: l, n, all: a === "delete" && n == null });
      if (a === "revise" || a === "revert") { edits = new Map(); shown = null; }
      if (a === "delete" && shown && v.outputs.find((o) => o.file === shown)?.letter === l && (n == null || shown.includes(`/${l}/${n}/`))) shown = null;
      toast(a === "revise" ? `The draft is now ${N}. Change it, then render a try.` : a === "keep" ? `Kept: ${N} is now v${tr?.rev}` : a === "revert" ? `Reverted ${N}` : a === "restore" ? `Version ${l} is v${n} again` : a === "new" ? "The next render makes a new version" : "Deleted");
      if (r.note) toast(r.note);
      showVersion(v);
      load();
    } catch (err) { toast(err instanceof Error ? err.message : String(err)); }
    return;
  }
  // Delete a rendered version: asks first, names what goes, and only touches that render's files.
  const del = t.closest<HTMLElement>("[data-delfile]");
  if (del) {
    const f = del.dataset.delfile!, o = v.outputs.find((x) => x.file === f);
    if (!o || !confirm(`Delete the ${presetOf(f)} version (${f.split("/").pop()})? Its rendered video${o.srt ? ", captions" : ""}${o.thumb ? ", thumbnail" : ""} are removed from disk. The draft and other versions stay.`)) return;
    try {
      await post("/video/delete", { p: v.place, name: v.name, file: f });
      if (shown === f) { shown = null; showVersion(v); }
      toast("Version deleted");
      load();
    } catch (err) { toast(err instanceof Error ? err.message : String(err)); }
    return;
  }
  const cancel = t.closest<HTMLElement>("[data-cancel]");
  try {
    if (cancel) { await post("/video/cancel", { id: Number(cancel.dataset.cancel) }); toast("Cancelled"); }
    else if (t.closest("#save")) {
      const list = [...edits].map(([i, x]) => ({ i, ...x }));
      await post("/video/save", { p: v.place, name: v.name, edits: list, platforms: [...picked] });
      edits = new Map();
      toast(list.length ? "Saved. Building the preview…" : "Saved");
    } else if (t.closest("#stillsBtn")) {
      await post("/video/job", { p: v.place, name: v.name, kind: "preview" });
      toast("Building the film and taking stills…");
    } else if (t.closest("#askgo")) {
      const words = ($("askin") as HTMLInputElement).value.trim();
      if (!words) return toast("Write what to change first");
      const r = await post("/video/ask", { p: v.place, name: v.name, text: words });
      ($("askin") as HTMLInputElement).value = "";
      toast(r.pty ? "Claude is on it. Its terminal is at the top of the page." : "Claude opened in a terminal window.");
      scrollTo({ top: 0, behavior: "smooth" });
    } else if (t.closest("#render")) {
      if (!picked.size) return toast("Pick where it goes first");
      if (v.mode === "film") await post("/video/save", { p: v.place, name: v.name, edits: [], platforms: [...picked], build: false });
      const r = await post("/video/job", { p: v.place, name: v.name, kind: "render", platforms: [...picked] });
      toast(`Rendering ${r.job.total} file${r.job.total > 1 ? "s" : ""}. You can leave this page.`);
    } else return;
  } catch (err) { toast(err instanceof Error ? err.message : String(err)); }
  load();
});

$("edit").addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  const i = Number(t.dataset.i), k = t.dataset.k;
  if (!k || !film) return;
  const x = edits.get(i) ?? {};
  (x as any)[k] = k === "items" ? t.value.split("\n").map((s) => s.trim()).filter(Boolean) : t.value;
  edits.set(i, x);
  if (k === "title") { const tx = t.closest(".beat")?.querySelector(".tx"); if (tx) tx.textContent = t.value; }
});

// A film opens on its first frame, which is usually a fade from black: show a moment in
// instead, unless the person already picked a beat while it loaded.
let picked0 = false;
document.addEventListener("load", (e) => {
  if ((e.target as HTMLElement).id === "frame" && !picked0) send({ kz: "seek", t: Math.min(1.5, dur / 2) });
}, true);

// ---- the agent on this video: its board terminal, mounted here so questions are answered without leaving the page

let termLib: Promise<(el: HTMLElement, key: string, onEnd?: () => void) => () => void> | null = null;
const loadTerm = () => termLib ??= new Promise((ok, no) => {
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = "/term.css";
  document.head.append(l);
  const sc = document.createElement("script");
  sc.src = "/term.js";
  sc.onload = () => ok((window as any).kzTerm);
  sc.onerror = () => { termLib = null; no(new Error("terminal failed to load")); };
  document.head.append(sc);
});
let mounted: { key: string; off: () => void } | null = null;
// The editor's right column: the form (default) or Claude's terminal. Reset to the form for each video.
let rtab: "form" | "term" = "form";
// #dock lives in the Terminal tab, which is inside #editbody: move it out before #editbody is rewritten,
// or the rewrite deletes it (and the live terminal with it). Parked, it shows above the editor, as in the
// "Claude is setting this video up" state, which has no tabs.
function parkDock() {
  const d = $("dock");
  if (d.parentElement !== $("edit")) $("edit").prepend(d);
  return d;
}
function showTab() {
  const f = document.getElementById("formpane"), t = document.getElementById("termpane");
  if (!f || !t) return;
  f.hidden = rtab !== "form"; t.hidden = rtab !== "term";
  for (const b of document.querySelectorAll<HTMLElement>("[data-tab]")) {
    b.setAttribute("aria-selected", String(b.dataset.tab === rtab));
    b.tabIndex = b.dataset.tab === rtab ? 0 : -1;
  }
  if (rtab === "term") drawDock();
}

async function drawDock() {
  const dock = $("dock");
  const a = open && agentOn(open.place, open.name);
  if (!a) {
    mounted?.off(); mounted = null;
    dock.innerHTML = "";
    document.querySelector("[data-tab=term]")?.classList.remove("ask");
    const sr = document.getElementById("tdotsr");
    if (sr) sr.textContent = "";
    return;
  }
  if (mounted?.key !== a.pty && !document.getElementById("term")?.dataset.pty?.includes(a.pty)) {
    mounted?.off(); mounted = null;
    dock.innerHTML = `<div class="agentbar" id="abar"></div><div class="term" id="term" data-pty="${esc(a.pty)}"></div>`;
  }
  // The terminal starts only once it can be seen: started in a hidden tab, at zero size, it draws nothing.
  // A placeholder claims the slot before the await, so two overlapping calls never mount it twice.
  const seen = !dock.closest("#termpane") || rtab === "term";
  if (mounted?.key !== a.pty && seen) {
    const slot = { key: a.pty, off: () => {} };
    mounted = slot;
    try {
      const mount = await loadTerm();
      const el = document.getElementById("term");
      if (el && mounted === slot) slot.off = mount(el, a.pty, () => load());
    } catch {
      // Keep the message: the next poll would rebuild the dock and try again, every few seconds.
      mounted = { key: a.pty, off: () => {} };
      const el = document.getElementById("term");
      if (el) el.textContent = "The terminal could not load. Open it on the board instead.";
    }
  }
  document.querySelector("[data-tab=term]")?.classList.toggle("ask", a.alive && a.asking);
  const sr = document.getElementById("tdotsr");
  if (sr) sr.textContent = a.alive && a.asking ? " (Claude is asking you something)" : "";
  const bar = document.getElementById("abar");
  if (!bar) return;
  bar.className = "agentbar" + (a.alive && a.asking ? " asking" : "");
  bar.innerHTML = `<b>${!a.alive ? "Claude finished. Its terminal stays here for a few minutes." : a.asking ? "Claude is asking you something: answer in the terminal below." : "Claude is working on this video."}</b>
    <a class="btn" href="/?view=terminal" target="_blank" rel="noopener">Open on the board</a>`;
}

// ---- New video: one form, the mockup's. Every choice goes into the agent's request.

const LANG_NAMES: Record<string, string> = { id: "Indonesian", en: "English" };
const wiz = { source: "brief" as "brief" | "footage", brief: "", folder: "", assets: "", preset: "", platforms: new Set(["TikTok"]), seconds: 60, language: "id", place: 0 };
let wizPresets: { name: string; kind: "film" | "footage" | "template"; label: string; hidden?: true }[] = [];
let limits: Record<string, number> = {};
const LEN_MIN = 15, LEN_MAX = 300;
const tick = (s: number) => `${((s - LEN_MIN) / (LEN_MAX - LEN_MIN)) * 100}%`;

async function drawWizard() {
  try {
    const d = await (await fetch(`/video/presets?p=${wiz.place}`)).json();
    wizPresets = d.presets; limits = d.limits;
  } catch { toast("The board is not running"); return; }
  // A template preset films a product, so it needs a brief; a footage preset edits the user's recording,
  // so it needs footage; a film preset works from either start. Hidden presets stay off the list.
  const list = wizPresets.filter((p) => !p.hidden && (p.kind === "film" || (p.kind === "template") === (wiz.source === "brief")));
  const kind = wiz.source === "brief" ? "film" : "footage";  // the default is one of the start's own kind
  if (!list.some((p) => p.name === wiz.preset)) wiz.preset = (list.find((p) => p.kind === kind) ?? list.find((p) => p.kind === "template") ?? list[0])?.name ?? "";
  $("wiz").innerHTML = `
    <div class="crumb"><button data-back>‹ Back to videos</button></div>
    <div class="ehead"><h2>New video</h2></div>
    <form class="card" id="wform" novalidate>
      <div><h3>Start from</h3><div class="src">
        <button type="button" class="opt${wiz.source === "brief" ? " on" : ""}" data-src="brief"><b>A brief</b><small>Describe it. Claude writes the script, the narration, the cards and picks music.</small></button>
        <button type="button" class="opt${wiz.source === "footage" ? " on" : ""}" data-src="footage"><b>My footage</b><small>A talking-head video already on this computer. Claude cuts dead air and retakes, then captions it.</small></button>
      </div></div>
      ${wiz.source === "brief"
        ? `<label style="display:grid;gap:6px"><h3 style="margin:0">Brief</h3><textarea id="wbrief" maxlength="4000" placeholder="60-second promo for … in Indonesian, friendly, ends with …">${esc(wiz.brief)}</textarea></label>
           <div><h3>Your assets <small>(optional)</small></h3><div class="pickrow"><input type="text" id="wassets" value="${esc(wiz.assets)}" placeholder="/home/you/Pictures/brand" aria-label="Assets folder"><button type="button" class="btn" id="wpicka">Pick…</button></div>
           <p class="note">PNGs, logos, graphics, photos, a deck or clips Claude should use. Leave empty to make everything from scratch.</p></div>`
        : `<div><h3>Footage folder</h3><div class="pickrow"><input type="text" id="wfolder" value="${esc(wiz.folder)}" placeholder="/home/you/Videos/recording" aria-label="Footage folder"><button type="button" class="btn" id="wpick">Pick…</button></div>
           <p class="note">Claude copies the video from this folder into the video's own folder; the original stays where it is.</p></div>`}
      <div><h3>Style preset</h3><div class="styles">${list.map((p) => `<button type="button" class="sty${p.name === wiz.preset ? " on" : ""}" data-preset="${esc(p.name)}"><b>${esc(p.label)}</b><small>${esc(p.name)} · ${p.kind}</small></button>`).join("") || `<p class="note">No presets found.</p>`}</div></div>
      <div><h3>Where it goes <small>(pick one or more)</small></h3><div class="chips" id="wplats">${Object.keys(PLATFORMS).map((p) => `<button type="button" class="chip${wiz.platforms.has(p) ? " on" : ""}" data-plat="${esc(p)}">${esc(p)}</button>`).join("")}</div><p class="note" id="wplatnote"></p></div>
      <div><h3>Length</h3>
        <div class="lenrow"><input type="range" id="wlen" min="${LEN_MIN}" max="${LEN_MAX}" step="5" value="${Math.min(LEN_MAX, wiz.seconds)}" aria-label="Length in seconds"><input type="text" id="wlentxt" value="${mmss(wiz.seconds)}" inputmode="numeric" aria-label="Length as minutes:seconds"></div>
        <div class="ticks"><span style="left:0">0:15</span><span class="m-hide" style="left:${tick(60)}">1:00</span><span style="left:${tick(120)}">2:00</span><span style="left:${tick(180)}">3:00</span><span style="left:100%">5:00</span></div>
        <p class="note" id="wlennote"></p></div>
      <div class="two">
        <label>Language<select id="wlang">${Object.entries(LANG_NAMES).map(([k, n]) => `<option value="${k}"${k === wiz.language ? " selected" : ""}>${n}</option>`).join("")}</select></label>
        <label>Save in<select id="wplace">${places.map((p) => `<option value="${p.i}"${p.i === wiz.place ? " selected" : ""}>${esc(p.label === "library" ? `Video library (${p.dir})` : `${p.label} (${p.dir})`)}</option>`).join("")}</select></label>
      </div>
      <div class="foot"><button type="button" class="btn" data-back>Cancel</button><button type="submit" class="btn pri" id="wgo">Generate draft</button></div>
    </form>`;
  wizNotes();
}

function wizNotes() {
  const shapes = [...new Set([...wiz.platforms].map((p) => PLATFORMS[p]))];
  const pn = document.getElementById("wplatnote");
  if (pn) pn.textContent = wiz.platforms.size ? `Makes ${shapes.length} file${shapes.length > 1 ? "s" : ""}: ${shapes.map((f) => ratio(f!)).join(", ")}` : "Pick at least one.";
  const over = [...wiz.platforms].filter((p) => limits[p] && wiz.seconds > limits[p]!).map((p) => `${p} takes at most ${mmss(limits[p]!)}`);
  const ln = document.getElementById("wlennote");
  if (ln) { ln.textContent = over.length ? `Too long: ${over.join(", ")}` : `About ${Math.round(wiz.seconds * 2.3)} words of narration`; ln.className = "note" + (over.length ? " warn-t" : ""); }
}

$("new").addEventListener("click", () => { if (location.hash !== "#new") history.pushState(null, "", "#new"); route(); });
$("wiz").addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  if (t.closest("[data-back]")) return go(null);
  const src = t.closest<HTMLElement>("[data-src]");
  if (src) { keepText(); wiz.source = src.dataset.src as "brief" | "footage"; return drawWizard(); }
  const pr = t.closest<HTMLElement>("[data-preset]");
  if (pr) { wiz.preset = pr.dataset.preset!; for (const b of $("wiz").querySelectorAll("[data-preset]")) b.classList.toggle("on", b === pr); return; }
  const pl = t.closest<HTMLElement>("[data-plat]");
  if (pl) { const p = pl.dataset.plat!; wiz.platforms.has(p) ? wiz.platforms.delete(p) : wiz.platforms.add(p); pl.classList.toggle("on", wiz.platforms.has(p)); return wizNotes(); }
  if (t.closest("#wpicka")) {
    try { const r = await post("/pick-folder", {}); if (r.path) { wiz.assets = r.path; ($("wassets") as HTMLInputElement).value = r.path; } }
    catch (err) { toast(err instanceof Error ? err.message : String(err)); }
    return;
  }
  if (t.closest("#wpick")) {
    try { const r = await post("/pick-folder", {}); if (r.path) { wiz.folder = r.path; ($("wfolder") as HTMLInputElement).value = r.path; } }
    catch (err) { toast(err instanceof Error ? err.message : String(err)); }
  }
});
const keepText = () => {
  const b = document.getElementById("wbrief") as HTMLTextAreaElement | null, f = document.getElementById("wfolder") as HTMLInputElement | null;
  if (b) wiz.brief = b.value;
  if (f) wiz.folder = f.value;
  const a = document.getElementById("wassets") as HTMLInputElement | null;
  if (a) wiz.assets = a.value;
};
$("wiz").addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "wlen") { wiz.seconds = Number(t.value); ($("wlentxt") as HTMLInputElement).value = mmss(wiz.seconds); wizNotes(); }
  else if (t.id === "wbrief" || t.id === "wfolder" || t.id === "wassets") keepText();
});
$("wiz").addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "wlentxt") {
    const [m, s] = t.value.includes(":") ? t.value.split(":").map(Number) : [0, Number(t.value)];
    wiz.seconds = Math.min(600, Math.max(LEN_MIN, Math.round(((m! * 60 + s!) || 60) / 5) * 5));
    t.value = mmss(wiz.seconds);
    ($("wlen") as HTMLInputElement).value = String(Math.min(LEN_MAX, wiz.seconds));
    wizNotes();
  } else if (t.id === "wlang") wiz.language = t.value;
  else if (t.id === "wplace") { keepText(); wiz.place = Number(t.value); drawWizard(); }
});
$("wiz").addEventListener("submit", async (e) => {
  e.preventDefault();
  keepText();
  const btn = $("wgo") as HTMLButtonElement;
  btn.disabled = true;
  try {
    const r = await post("/video/new", { p: wiz.place, source: wiz.source, brief: wiz.brief, folder: wiz.folder, assets: wiz.source === "brief" ? wiz.assets : "", preset: wiz.preset, platforms: [...wiz.platforms], seconds: wiz.seconds, language: wiz.language });
    wiz.brief = ""; wiz.folder = ""; wiz.assets = "";
    await load();
    go(wiz.place, r.name);
    toast(r.pty ? "Claude started. Answer its questions in the terminal at the top." : "Claude opened in a terminal window.");
  } catch (err) { toast(err instanceof Error ? err.message : String(err)); }
  finally { btn.disabled = false; }
});

// The board's change stream: a job moving or a file landing redraws what is on screen.
function listen() {
  const es = new EventSource("/events");
  es.onmessage = () => { load(); void refreshBoardBadge(); };
}

// The board only watches its own state, not video folders: a draft Claude rebuilds in its terminal (an Ask
// Claude change) lands unannounced. While a video is open and the tab is visible, look again every 5 s,
// so its Versions and Render final follow. Cheap: a few stat calls, durations are cached.
setInterval(() => { if (open && document.visibilityState === "visible") load(); }, 5000);

route();
load();
initRail();
void refreshBoardBadge();
listen();
