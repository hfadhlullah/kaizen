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
};
type Look = { hair: string; skinColor: string; hairColor: string; eyeColor: string; facialHairColor: string; height: number };
type State = {
  art: string[];
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
  return `<div class="row"><span class="badge ${d.outcome}">${OUTCOME[d.outcome]}</span>
  <span class="t" title="${esc(d.title)}">${esc(d.title)}</span>
  <span class="m">${esc(d.project)} · ${esc(d.skill)} · ${d.stages.length} stages, ${d.monsters} monsters${waves}${d.boss ? ", boss" : ""}</span>
  <span class="x">${xp}</span></div>`;
}

const emblem = (g: Guild) => { const u = art(`guild-${g.id}`); return u ? `<img class="emblem" src="${u}" alt="">` : ""; };
function guild(g: Guild) {
  const learned = g.skills.filter((s) => s.learned), left = g.skills.length - learned.length;
  if (!g.founded)
    return `<article class="panel guild locked"><header>${emblem(g)}<h3>${esc(g.name)}</h3><span>Not founded</span></header>
    <p class="blurb">${esc(g.blurb)}</p><p class="more">Clear a dungeon in this field to found it. ${g.skills.length} skills to learn.</p></article>`;
  return `<article class="panel guild"><header>${emblem(g)}<h3>${esc(g.name)}</h3><span>Level ${n(g.level)}</span></header>
  <p class="blurb">${esc(g.blurb)}</p>${bar(g)}<p class="xpn">${n(g.into)} / ${n(g.need)} XP to level ${n(g.level + 1)}</p>
  <ul class="skills">${learned.map((s) => `<li><span>${esc(s.name)} <small>· ${n(s.runs)} run${s.runs === 1 ? "" : "s"}</small></span><b>Lv ${n(s.level)}</b>${bar(s)}</li>`).join("")}</ul>
  ${left ? `<p class="more">${left} more skill${left === 1 ? "" : "s"} to learn.</p>` : ""}</article>`;
}

function draw(s: State) {
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
  </div></div>
  ${live.length ? `<section><div class="panel"><h2>In the dungeon now</h2><div class="log">${live.map(dungeon).join("")}</div></div></section>` : ""}
  <section><h2>Guilds</h2><div class="guilds">${s.guilds.map(guild).join("")}</div></section>
  <section><div class="panel"><h2>Dungeon log</h2><div class="log">${past.length ? past.map(dungeon).join("") : `<p class="empty">No runs yet. Start one and it becomes your first dungeon.</p>`}</div></div></section>`;
  root.removeAttribute("aria-busy");
}

let busy = false;
async function load() {
  if (busy) return;
  busy = true;
  try {
    const r = await fetch("/game/state");
    if (!r.ok) throw new Error(`${r.status}`);
    draw((await r.json()) as State);
  } catch (e) {
    if (root.getAttribute("aria-busy")) root.innerHTML = `<p class="empty">The realm is out of reach (${esc(e instanceof Error ? e.message : e)}). Is kaizen web running?</p>`;
  } finally { busy = false; }
}

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
