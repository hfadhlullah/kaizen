// The Game page: your kaizen runs as a character, guilds and dungeons. Everything shown is
// computed by cli/game.ts (GET /game/state) from the run files; this page only draws it.
// Bundled into web/game.js by `bun run build:web`.
type Bar = { level: number; into: number; need: number; xp: number };
type Skill = Bar & { id: string; name: string; learned: boolean; runs: number };
type Guild = Bar & { id: string; name: string; blurb: string; founded: boolean; skills: Skill[] };
type Stage = { name: string; monsters: number; ms: number | null };
type Dungeon = {
  id: string; title: string; project: string; guild: string; skill: string; outcome: "cleared" | "retreat" | "live" | "stalled";
  stages: Stage[]; waves: number; monsters: number; boss: boolean; files: number; xp: number; pending: number;
  stage: string; work: { done: number; items: number } | null;
};
type Look = { hair: string; skinColor: string; hairColor: string; eyeColor: string; facialHairColor: string; height: number };
type State = {
  art: string[]; scenes?: { installed: string[]; missing: string[] };
  game: { name: string; look: Look }; character: Bar & { name: string }; guilds: Guild[]; dungeons: Dungeon[];
  totals: { runs: number; cleared: number; retreat: number; live: number; stalled: number };
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// A colour from game.json goes into a style attribute: only a hex colour passes.
const hex = (c: string, fallback: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback);
const n = (x: number) => x.toLocaleString("en-US");
const pct = (b: Bar) => Math.min(100, Math.round((b.into / b.need) * 100));
const bar = (b: Bar) => `<div class="xp" role="progressbar" aria-valuemin="0" aria-valuemax="${b.need}" aria-valuenow="${b.into}"><i style="width:${pct(b)}%"></i></div>`;
const root = document.getElementById("root")!;
let last: State | null = null;

// Art you put in assets/game/ (served as /game/art/<file>): hero, backdrop, guild-<id>. A missing
// piece keeps the drawn placeholder.
let artFiles: string[] = [];
const art = (base: string) => { const f = artFiles.find((x) => x.replace(/\.\w+$/, "") === base); return f ? `/game/art/${encodeURIComponent(f)}` : ""; };

// A placeholder portrait in the player's colours, unless hero.* is in assets/game/.
function portrait(l: Look) {
  const img = art("hero");
  if (img) return `<img class="portrait art" src="${img}" alt="Your character">`;
  const skin = hex(l.skinColor, "#e0ac8a"), hair = hex(l.hairColor, "#4a2f1b"), eye = hex(l.eyeColor, "#3b6b8f");
  return `<svg class="portrait" viewBox="0 0 150 190" role="img" aria-label="Your character">
  <path d="M20 190c0-34 24-52 55-52s55 18 55 52z" fill="var(--panel-2)" stroke="var(--line)" stroke-width="2"/>
  <rect x="64" y="108" width="22" height="34" rx="8" fill="${skin}"/>
  <ellipse cx="75" cy="76" rx="32" ry="38" fill="${skin}"/>
  <path d="M42 70c-4-34 20-48 36-46 22 2 32 20 30 46-8-16-20-22-34-22s-26 6-32 22z" fill="${hair}"/>
  <circle cx="62" cy="80" r="4" fill="${eye}"/><circle cx="88" cy="80" r="4" fill="${eye}"/>
  <path d="M65 98q10 7 20 0" fill="none" stroke="${hex(l.facialHairColor, "#4a2f1b")}" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>
</svg>`;
}

const OUTCOME = { cleared: "Cleared", retreat: "Retreat", live: "In the dungeon", stalled: "Stalled" } as const;
function dungeon(d: Dungeon) {
  const xp = d.outcome === "live" ? `+${n(d.pending)} XP at the end` : d.outcome === "cleared" ? `+${n(d.xp)} XP` : "no XP";
  const waves = d.waves ? `, ${d.waves} wave${d.waves > 1 ? "s" : ""}` : "";
  const watch = d.outcome === "live" ? " · ▶ Watch live" : " · ▶ Replay";
  return `<div class="row" role="button" tabindex="0" data-open="${esc(d.id)}" aria-label="${d.outcome === "live" ? "Watch" : "Replay"}: ${esc(d.title)}"><span class="badge ${d.outcome}">${OUTCOME[d.outcome]}</span>
  <span class="t" title="${esc(d.title)}">${esc(d.title)}</span>
  <span class="m">${esc(d.project)} · ${esc(d.skill)} · ${d.stages.length} stages, ${d.monsters} monsters${waves}${d.boss ? ", boss" : ""}${watch}</span>
  <span class="x">${xp}</span></div>`;
}

const emblem = (g: Guild) => { const u = art(`guild-${g.id}`); return u ? `<img class="emblem" src="${u}" alt="">` : ""; };
// Move a learned skill to another guild: the keyboard way (the town has dragging).
const mover = (s: Skill, g: Guild) => `<label class="mv"><span class="sr">Move ${esc(s.name)} to another guild</span><select data-move="${esc(s.id)}"><option value="">Move to…</option>${(last?.guilds ?? []).filter((x) => x.id !== g.id).map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></label>`;
function guild(g: Guild) {
  const learned = g.skills.filter((s) => s.learned), left = g.skills.length - learned.length;
  if (!g.founded)
    return `<article class="panel guild locked" id="g-${esc(g.id)}"><header>${emblem(g)}<h3>${esc(g.name)}</h3><span>Not founded</span></header>
    <p class="blurb">${esc(g.blurb)}</p><p class="more">Clear a dungeon in this field to found it. ${g.skills.length} skills to learn.</p></article>`;
  return `<article class="panel guild" id="g-${esc(g.id)}"><header>${emblem(g)}<h3>${esc(g.name)}</h3><span>Level ${n(g.level)}</span></header>
  <p class="blurb">${esc(g.blurb)}</p>${bar(g)}<p class="xpn">${n(g.into)} / ${n(g.need)} XP to level ${n(g.level + 1)}</p>
  <ul class="skills">${learned.map((s) => `<li><span>${esc(s.name)} <small>· ${n(s.runs)} run${s.runs === 1 ? "" : "s"}</small></span><b>Lv ${n(s.level)}</b>${bar(s)}${mover(s, g)}</li>`).join("")}</ul>
  ${left ? `<p class="more">${left} more skill${left === 1 ? "" : "s"} to learn.</p>` : ""}</article>`;
}

function draw(s: State) {
  last = s;
  artFiles = Array.isArray(s.art) ? s.art : [];
  const back = art("backdrop"), veil = "color-mix(in srgb,var(--bg) 78%,transparent)";
  document.body.style.background = back ? `linear-gradient(${veil},${veil}),url("${back}") center/cover fixed` : "";
  const c = s.character, t = s.totals, live = s.dungeons.filter((d) => d.outcome === "live"), past = s.dungeons.filter((d) => d.outcome !== "live");
  root.innerHTML = `
  <div class="panel hero">${portrait(s.game.look)}<div>
    <h2 style="margin:0 0 4px">The hero</h2><p class="name">${esc(c.name)}</p>
    <p class="lvl">Level<b>${n(c.level)}</b></p>${bar(c)}
    <p class="xpn">${n(c.into)} / ${n(c.need)} XP to level ${n(c.level + 1)} · ${n(c.xp)} XP in all</p>
    <div class="stats"><span><b>${n(t.cleared)}</b>dungeons cleared</span><span><b>${n(t.retreat)}</b>retreats</span><span><b>${n(t.live)}</b>in the dungeon now</span></div>
    <button class="visit" type="button" data-town>Visit the town</button> <button class="visit" type="button" data-hero>Make your hero</button>
  </div></div>
  ${live.length ? `<section><div class="panel"><h2>In the dungeon now</h2><div class="log">${live.map(dungeon).join("")}</div></div></section>` : ""}
  <section><h2>Guilds</h2><div class="guilds">${s.guilds.map(guild).join("")}</div></section>
  <section><div class="panel"><h2>Dungeon log</h2><div class="log">${past.length ? past.map(dungeon).join("") : `<p class="empty">No runs yet. Start one and it becomes your first dungeon.</p>`}</div></div></section>`;
  root.removeAttribute("aria-busy");
  sync();
}

// ---- the dungeon panel: web/dungeon.ts (three.js) is fetched the first time one is opened ----
type Mount = { update(d: Dungeon): boolean; replay(): void; pause(on: boolean): boolean; destroy(): void };
type Kz = { mount(host: HTMLElement, d: Dungeon, paused?: boolean, art?: string[], look?: Record<string, unknown>): Mount | null };
type TownMount = { update(g: Guild[]): void; select(id: string | null): void; hover(id: string | null): void; idAt(x: number, y: number): string | null; destroy(): void };
type KzT = { mount(host: HTMLElement, g: Guild[], o: { onPick(id: string): void; art?: string[] }): TownMount | null };
const panel = document.getElementById("dungeon")!, dgBody = document.getElementById("dg-body")!, dgTitle = document.getElementById("dg-title")!;
const dgPause = document.getElementById("dg-pause") as HTMLButtonElement, dgReplay = document.getElementById("dg-replay") as HTMLButtonElement;
let openId = "", wantPause = false, handle: Mount | null = null, loading: Promise<Kz> | null = null;
const kz = () => (window as unknown as { KzDungeon?: Kz }).KzDungeon;
const kzt = () => (window as unknown as { KzTown?: KzT }).KzTown;
// /scenes.js holds both scenes and one copy of three.js; it is fetched the first time either opens.
const loadScene = () => loading ??= new Promise<Kz>((ok, no) => {
  if (kz()) return ok(kz()!);
  const el = document.createElement("script");
  el.src = "/scenes.js"; el.onload = () => (kz() ? ok(kz()!) : no(new Error("scene missing"))); el.onerror = () => { loading = null; no(new Error("scene failed to load")); };
  document.head.append(el);
});
const text = (d: Dungeon, why: string) => `<p class="empty">${esc(why)}</p><ul class="dg-text">${d.stages.map((x) => `<li>${esc(x.name)}: ${x.monsters} monster${x.monsters === 1 ? "" : "s"}</li>`).join("")}</ul>`;
function stop() { handle?.destroy(); handle = null; }
async function show(d: Dungeon) {
  stop(); dgBody.innerHTML = "";
  dgTitle.textContent = d.title;
  dgReplay.hidden = d.outcome === "live";
  dgPause.textContent = "Pause";
  try {
    const k = await loadScene();
    if (openId !== d.id) return;
    handle = k.mount(dgBody, d, wantPause, last?.scenes?.installed, last?.game.look as unknown as Record<string, unknown>);
    if (!handle) dgBody.innerHTML = text(d, "This browser cannot draw the dungeon (no WebGL). Here is its shape instead.");
    else if (wantPause || matchMedia("(prefers-reduced-motion: reduce)").matches) { wantPause = true; dgPause.textContent = "Play"; } // a rebuild keeps your Pause
  } catch (e) { dgBody.innerHTML = text(d, `The dungeon scene could not load (${e instanceof Error ? e.message : e}).`); }
}
function open(id: string) {
  const d = last?.dungeons.find((x) => x.id === id);
  if (!d) return;
  if (id !== openId) wantPause = false;
  closeTown(); closeCreator();
  openId = id; panel.hidden = false; panel.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  void show(d);
  syncScenes();
}
function close() { openId = ""; wantPause = false; stop(); panel.hidden = true; syncScenes(); }
// ---- the hero creator (web/creator.ts, in /scenes.js)
type CreatorMount = { update(look: Record<string, unknown>): void; destroy(): void };
type KzC = { mount(host: HTMLElement, o: { look: Record<string, unknown>; art: string[]; onSave(look: Record<string, unknown>): Promise<string | null> }): CreatorMount | null };
const kzc = () => (window as unknown as { KzCreator?: KzC }).KzCreator;
const crPanel = document.getElementById("creator")!, crBody = document.getElementById("cr-body")!;
let creator: CreatorMount | null = null, creatorOpen = false;
async function mountCreatorNow() {
  await loadScene();
  if (!creatorOpen || creator) return;
  creator = kzc()?.mount(crBody, {
    look: (last?.game.look ?? {}) as unknown as Record<string, unknown>, art: last?.scenes?.installed ?? [],
    onSave: async (look) => { const r = await post("/game/look", { look }); if (!r.ok) return String(r.error ?? "could not save"); await fresh(); return null; },
  }) ?? null;
  if (!creator) crBody.innerHTML = `<p class="empty">This browser cannot draw the hero (no WebGL).</p>`;
}
async function openCreator() {
  close(); closeTown();
  creatorOpen = true; crPanel.hidden = false;
  crPanel.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  try { await mountCreatorNow(); } catch (e) { crBody.innerHTML = `<p class="empty">The hero creator could not load (${esc(e instanceof Error ? e.message : e)}).</p>`; }
  syncScenes();
}
function closeCreator() { creatorOpen = false; creator?.destroy(); creator = null; crPanel.hidden = true; crBody.innerHTML = ""; syncScenes(); }
document.getElementById("cr-close")!.onclick = closeCreator;
root.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("[data-hero]")) void openCreator(); });

// The realistic scenes are a download the user asks for: a bar offers it while a scene is open and any is missing.
const scenesBar = document.getElementById("scenes")!;
let downloading = false;
function syncScenes() {
  if (downloading) return;
  const show = (last?.scenes?.missing.length ?? 0) > 0 && (openId !== "" || townOpen || creatorOpen);
  scenesBar.hidden = !show;
  if (show && !scenesBar.querySelector("#get-scenes")) scenesBar.innerHTML = `The realistic 3D scenes are not downloaded (about 17 MB, from the kaizen release). <button type="button" id="get-scenes">Download</button>`;
}
scenesBar.addEventListener("click", async (e) => {
  if (!(e.target as HTMLElement).closest("#get-scenes") || downloading) return;
  downloading = true; scenesBar.textContent = "Downloading the scenes…";
  const r = await post("/game/assets", {});
  downloading = false;
  if (!r.ok) { scenesBar.innerHTML = `Could not download the scenes: ${esc(r.error ?? "unknown error")}. <button type="button" id="get-scenes">Try again</button>`; return; }
  scenesBar.hidden = true; scenesBar.innerHTML = "";
  await fresh();
  const d = last?.dungeons.find((x) => x.id === openId);
  if (d) void show(d);
  if (townOpen) { town?.destroy(); town = null; twBody.innerHTML = ""; void mountTownNow(); }
  if (creatorOpen) { creator?.destroy(); creator = null; crBody.innerHTML = ""; void mountCreatorNow(); }
});
// A refresh keeps the scene running: the same run moves it, a run that grew a stage rebuilds it.
function sync() {
  syncScenes();
  syncTown();
  if (!openId) return;
  const d = last?.dungeons.find((x) => x.id === openId);
  if (!d) return close();
  dgTitle.textContent = d.title; dgReplay.hidden = d.outcome === "live";
  if (handle && !handle.update(d)) void show(d);
}
root.addEventListener("click", (e) => { const r = (e.target as HTMLElement).closest<HTMLElement>("[data-open]"); if (r) open(r.dataset.open!); });
root.addEventListener("keydown", (e) => { const r = (e.target as HTMLElement).closest<HTMLElement>("[data-open]"); if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(r.dataset.open!); } });
document.getElementById("dg-close")!.onclick = close;
dgPause.onclick = () => { if (handle) { wantPause = handle.pause(dgPause.textContent === "Pause"); dgPause.textContent = wantPause ? "Play" : "Pause"; } };
dgReplay.onclick = () => { handle?.replay(); wantPause = false; dgPause.textContent = "Pause"; };
addEventListener("keydown", (e) => { if (e.key === "Escape" && openId) close(); });

// ---- the guild town: web/town.ts; moving and founding are the game's only writes -------------
const townPanel = document.getElementById("town")!, twBody = document.getElementById("tw-body")!, twInfo = document.getElementById("tw-info")!, toast = document.getElementById("toast")!;
let town: TownMount | null = null, townOpen = false, picked: string | null = null;
function say(html: string) { toast.innerHTML = html; toast.hidden = !html; }
async function post(path: string, body: unknown): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  try {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await r.json().catch(() => ({ error: `${r.status}` }))) as { ok: boolean; error?: string };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
const guildName = (id: string) => last?.guilds.find((g) => g.id === id)?.name ?? id;
const skillName = (id: string) => last?.guilds.flatMap((g) => g.skills).find((s) => s.id === id)?.name ?? id;
async function moveTo(skill: string, to: string) {
  const r = await post("/game/move", { skill, guild: to });
  if (!r.ok) return say(esc(r.error ?? "could not move it"));
  const from = String(r.from ?? ""), noop = r.noop === true;
  await fresh();
  say(noop ? `${esc(skillName(skill))} is already in ${esc(guildName(to))}.` : `Moved ${esc(skillName(skill))} to ${esc(guildName(to))}. <button type="button" data-undo="${esc(skill)}|${esc(from)}">Undo</button>`);
}
let infoHtml = "";
function info() {
  if (drag) return; // a refresh must not replace the chip being dragged
  const g = last?.guilds.find((x) => x.id === picked);
  const learned = g ? g.skills.filter((s) => s.learned) : [];
  const html = !g ? `<p>Click a building to see its skills. Drag a skill chip onto another building to move it there.</p>` : `<h3>${esc(g.name)}</h3><p>${g.founded ? `Level ${n(g.level)}, ${learned.length} skill${learned.length === 1 ? "" : "s"} learned.` : "Not founded yet. Drag a learned skill here to found it, or clear a dungeon in this field."}
    <button class="link" type="button" data-card="${esc(g.id)}">Show its guild card</button></p>
    ${learned.length ? `<div class="chips">${learned.map((s) => `<span class="chip" data-skill="${esc(s.id)}" data-from="${esc(g.id)}">${esc(s.name)}</span>`).join("")}</div><p>Drag a skill onto another building to move it. The guild cards have a Move menu for the keyboard.</p>` : ""}`;
  if (html !== infoHtml) { infoHtml = html; twInfo.innerHTML = html; }
}
function fallbackList() {
  twBody.innerHTML = `<p class="empty">This browser cannot draw the town (no WebGL). Here are your guilds instead.</p><ul class="tw-list">${(last?.guilds ?? []).map((g) => `<li>${esc(g.name)}: ${g.founded ? `level ${n(g.level)}` : "not founded"}</li>`).join("")}</ul>`;
}
async function openTown() {
  close(); closeCreator();
  townOpen = true; townPanel.hidden = false;
  townPanel.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  info();
  try {
    await mountTownNow();
  } catch (e) { twBody.innerHTML = `<p class="empty">The town scene could not load (${esc(e instanceof Error ? e.message : e)}).</p>`; }
  syncScenes();
}
async function mountTownNow() {
  await loadScene();
  if (!townOpen || town) return;
  town = kzt()?.mount(twBody, last?.guilds ?? [], { onPick: (id) => { picked = id; town?.select(id); info(); }, art: last?.scenes?.installed }) ?? null;
  if (!town) fallbackList(); else town.select(picked);
}
function closeTown() { townOpen = false; town?.destroy(); town = null; townPanel.hidden = true; twBody.innerHTML = ""; syncScenes(); }
function syncTown() { if (!townOpen) return; if (town) town.update(last?.guilds ?? []); else if (twBody.querySelector(".tw-list")) fallbackList(); info(); }

// Dragging a skill chip onto a building (pointer events, so a finger works too). The listeners
// sit on the window while a drag lasts, so a redraw under the pointer cannot cut it short.
let drag: { skill: string; from: string; ghost: HTMLElement } | null = null;
function endDrag() {
  drag?.ghost.remove(); drag = null; town?.hover(null);
  removeEventListener("pointermove", dragMove); removeEventListener("pointerup", dragUp); removeEventListener("pointercancel", endDrag);
}
function dragMove(e: PointerEvent) {
  if (!drag) return;
  drag.ghost.style.left = e.clientX + "px"; drag.ghost.style.top = e.clientY + "px";
  const over = town?.idAt(e.clientX, e.clientY) ?? null;
  town?.hover(over && over !== drag.from ? over : null);
}
function dragUp(e: PointerEvent) {
  if (!drag) return;
  const { skill, from } = drag, over = town?.idAt(e.clientX, e.clientY) ?? null;
  endDrag();
  if (over && over !== from) void moveTo(skill, over);
}
twInfo.addEventListener("pointerdown", (e) => {
  const c = (e.target as HTMLElement).closest<HTMLElement>(".chip[data-skill]");
  if (!c || !town || e.button > 0 || drag) return;
  e.preventDefault();
  const ghost = document.createElement("div");
  ghost.className = "chip ghost"; ghost.textContent = c.textContent; ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px";
  document.body.append(ghost);
  drag = { skill: c.dataset.skill!, from: c.dataset.from!, ghost };
  addEventListener("pointermove", dragMove); addEventListener("pointerup", dragUp); addEventListener("pointercancel", endDrag);
});
addEventListener("keydown", (e) => { if (e.key === "Escape" && drag) endDrag(); });

document.getElementById("tw-close")!.onclick = closeTown;
document.getElementById("found")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target as HTMLFormElement, name = (f.elements.namedItem("name") as HTMLInputElement).value, skills = (f.elements.namedItem("skills") as HTMLInputElement).value.split(",").map((x) => x.trim()).filter(Boolean);
  const r = await post("/game/found", { name, skills });
  if (!r.ok) return say(esc(r.error ?? "could not found it"));
  f.reset();
  picked = String(r.id ?? "");
  await fresh();
  say(`Founded ${esc(guildName(picked))}${skills.length ? ` with ${skills.length} skill${skills.length === 1 ? "" : "s"}` : ""}.`);
});
toast.addEventListener("click", (e) => {
  const u = (e.target as HTMLElement).closest<HTMLElement>("[data-undo]");
  if (u) { const [skill, from] = u.dataset.undo!.split("|"); if (skill && from) void moveTo(skill, from); }
});
twInfo.addEventListener("click", (e) => {
  const c = (e.target as HTMLElement).closest<HTMLElement>("[data-card]");
  if (c) document.getElementById("g-" + c.dataset.card)?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
});
root.addEventListener("change", (e) => {
  const sel = (e.target as HTMLElement).closest<HTMLSelectElement>("select[data-move]");
  if (sel && sel.value) { const skill = sel.dataset.move!, to = sel.value; sel.blur(); void moveTo(skill, to); }
});
// A menu left without a choice: the page catches up with what it skipped meanwhile.
root.addEventListener("focusout", (e) => { if (e.target instanceof HTMLSelectElement) setTimeout(() => void load(), 50); });
root.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("[data-town]")) void openTown(); });

let busy = false;
// True when this call did the fetch; false when one was already under way.
async function load(): Promise<boolean> {
  if (busy) return false;
  busy = true;
  try {
    const r = await fetch("/game/state");
    if (!r.ok) throw new Error(`${r.status}`);
    const next = (await r.json()) as State;
    // A menu that is open stays: the page is redrawn when the choice is made or the menu closes.
    if (last && document.activeElement instanceof HTMLSelectElement && root.contains(document.activeElement)) { last = next; sync(); return true; }
    draw(next);
  } catch (e) {
    if (root.getAttribute("aria-busy")) root.innerHTML = `<p class="empty">The realm is out of reach (${esc(e instanceof Error ? e.message : e)}). Is kaizen web running?</p>`;
  } finally { busy = false; }
  return true;
}
// After a write: a fetch that starts after it. A refresh already under way may have asked before the
// write, so wait for it to end and then ask again.
async function fresh() { while (!(await load())) await new Promise((ok) => setTimeout(ok, 40)); }

// Theme: the board's own choice (kz-theme) is followed; the button flips it.
const doc = document.documentElement, dark = matchMedia("(prefers-color-scheme: dark)");
try { const t = localStorage.getItem("kz-theme"); if (t) doc.dataset.theme = t; } catch { /* no storage */ }
const paint = () => { (document.getElementById("theme") as HTMLElement).textContent = (doc.dataset.theme ? doc.dataset.theme === "dark" : dark.matches) ? "☀" : "☾"; };
document.getElementById("theme")!.onclick = () => {
  const next = (doc.dataset.theme ? doc.dataset.theme === "dark" : dark.matches) ? "light" : "dark";
  doc.dataset.theme = next;
  try { localStorage.setItem("kz-theme", next); } catch { /* no storage */ }
  paint();
};
paint();

// Runs change on the board's /events stream; otherwise look again every 10 s.
new EventSource("/events").onmessage = () => void load();
setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10_000);
void load();
