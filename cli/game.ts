// The Game page's engine (`GET /game/state`): the user's real kaizen runs, read as an RPG.
// A run is a dungeon, a finding a monster, the review the boss, a fix round a wave. Every
// number is recomputed from the run files on each call, so the game cannot disagree with
// the runs. Nothing here writes under any project's .kaizen/runs/; the only file written is
// ~/.kaizen/game.json, which holds what the player chose (looks, hand-founded guilds, skill
// moves) and is created with defaults on first read.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { homedir } from "node:os";
import { changedPaths, knownProjects, reviewFindings } from "./state.ts";
import { runStat } from "./stats.ts";

const read = (f: string) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
const mtime = (f: string) => { try { return statSync(f).mtimeMs; } catch { return 0; } };

// ---- levels ---------------------------------------------------------------------------
// Going from level n to n+1 costs round(100 * n^1.5) XP. Levels never cap.
export const stepCost = (n: number) => Math.round(100 * Math.pow(n, 1.5));
export function levelOf(xp: number): { level: number; into: number; need: number } {
  let left = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0, level = 1;
  while (left >= stepCost(level)) left -= stepCost(level++);
  return { level, into: left, need: stepCost(level) };
}

// ---- catalog --------------------------------------------------------------------------
export type Skill = { id: string; name: string; keywords: string[]; exts: string[] };
export type Guild = { id: string; name: string; blurb: string; skills: Skill[]; byHand?: boolean };
const sk = (id: string, name: string, keywords: string[], exts: string[] = []): Skill => ({ id, name, keywords, exts });
const general = (guild: string): Skill => sk(`${guild}-general`, "General practice", []);

// A guild is a family of skills that make a field work. The `-general` skill of each guild
// takes runs that name nothing more specific, by their track.
export const CATALOG: Guild[] = [
  { id: "code", name: "Guild of Code", blurb: "Languages, frameworks and the craft of making software run.", skills: [
    sk("typescript", "TypeScript", ["typescript", "tsconfig", "bun", "types"], [".ts", ".tsx"]),
    sk("javascript", "JavaScript", ["javascript", "node", "react", "vue", "svelte", "frontend", "browser"], [".js", ".jsx", ".mjs"]),
    sk("python", "Python", ["python", "django", "flask", "pytest", "pip"], [".py"]),
    sk("php", "PHP & Laravel", ["php", "laravel", "artisan", "composer"], [".php"]),
    sk("web-ui", "Web interfaces", ["html", "css", "page", "layout", "button", "responsive", "dark mode", "tab", "screen"], [".html", ".css", ".scss"]),
    sk("backend", "Backends & data", ["api", "endpoint", "server", "route", "database", "sql", "migration", "query"], [".sql"]),
    sk("testing", "Testing", ["test", "tests", "coverage", "regression", "flaky"]),
    sk("cli", "Command lines", ["cli", "command", "flag", "terminal", "tui"], [".sh"]),
    general("code"),
  ] },
  { id: "arts", name: "Guild of Arts", blurb: "Every design skill: interface, brand, illustration and 3D.", skills: [
    sk("ui-design", "Interface design", ["design", "ui", "ux", "mockup", "concept", "prototype", "figma", "palette", "typography", "theme"]),
    sk("branding", "Branding", ["logo", "brand", "identity", "mascot", "icon"], [".svg"]),
    sk("illustration", "Illustration", ["illustration", "drawing", "sketch", "image", "poster", "banner"], [".png", ".jpg", ".webp"]),
    sk("3d", "3D modelling", ["3d", "blender", "model", "mesh", "render", "texture", "character"], [".blend", ".glb", ".gltf", ".obj", ".fbx"]),
    general("arts"),
  ] },
  { id: "writing", name: "Guild of Writing", blurb: "Documents, copy and long form: words that others will read.", skills: [
    sk("docs", "Documentation", ["docs", "documentation", "readme", "guide", "notes", "changelog"], [".md", ".mdx"]),
    sk("copywriting", "Copywriting", ["copy", "landing", "blog", "email", "newsletter", "caption", "headline"]),
    sk("book", "Book writing", ["book", "chapter", "novel", "manuscript", "ebook", "story", "memoir"]),
    general("writing"),
  ] },
  { id: "research", name: "Guild of Research", blurb: "Finding out what is true before building on it.", skills: [
    sk("analysis", "Analysis", ["research", "analyze", "analyse", "analysis", "compare", "investigate", "audit", "study", "evaluate"]),
    sk("data", "Data & metrics", ["data", "metrics", "stats", "statistics", "csv", "dashboard", "report"], [".csv"]),
    sk("reverse-engineering", "Reverse engineering", ["reverse", "decompile", "binary", "apk", "rea"]),
    general("research"),
  ] },
  { id: "operations", name: "Guild of Operations", blurb: "Shipping, running and securing what was built.", skills: [
    sk("devops", "DevOps", ["deploy", "docker", "vps", "systemd", "ci", "pipeline", "tunnel", "server setup", "release", "publish"], [".yml", ".yaml", ".toml"]),
    sk("security", "Security", ["security", "auth", "token", "vulnerability", "permission", "secret", "encryption"]),
    sk("git", "Source control", ["git", "branch", "merge", "commit", "worktree", "rebase", "pull request"]),
    general("operations"),
  ] },
  { id: "media", name: "Guild of Media", blurb: "Video, sound and slides: stories told on a screen.", skills: [
    sk("video", "Video editing", ["video", "film", "tiktok", "reels", "shorts", "footage", "subtitle", "hyperframes"], [".mp4", ".mov", ".srt"]),
    sk("audio", "Audio", ["audio", "voice", "voiceover", "music", "sound", "tts", "podcast"], [".mp3", ".wav"]),
    sk("slides", "Decks & slides", ["deck", "slides", "presentation", "pitch", "pptx"], [".pptx"]),
    general("media"),
  ] },
  { id: "commerce", name: "Guild of Commerce", blurb: "Offers, customers and money.", skills: [
    sk("marketing", "Marketing", ["marketing", "campaign", "audience", "positioning", "seo", "social", "ads", "launch"]),
    sk("sales", "Sales & pricing", ["pricing", "price", "payment", "invoice", "customer", "sales", "client", "billing", "subscription"]),
    sk("product", "Product", ["product", "feature request", "roadmap", "onboarding", "users", "feedback"]),
    general("commerce"),
  ] },
  { id: "craft", name: "Guild of Craft", blurb: "Tools, automation and the agents that do the work.", skills: [
    sk("automation", "Automation", ["script", "automate", "automation", "cron", "bot", "scheduled", "workflow"]),
    sk("agents", "Agents & prompts", ["agent", "agents", "skill", "prompt", "mcp", "llm", "claude", "subagent", "kaizen"]),
    sk("tooling", "Tooling", ["config", "settings", "install", "plugin", "extension", "setup", "installer", "upgrade"]),
    general("craft"),
  ] },
];

const TRACK_GUILD: Record<string, string> = { code: "code", writing: "writing", communication: "commerce", research: "research", operations: "operations" };

// ---- what the player chose (the one file the game owns) --------------------------------
export type Look = { hair: string; eyes: string; mouth: string; body: string; height: number; hairColor: string; facialHairColor: string; skinColor: string; eyeColor: string };
export type GameFile = {
  version: 1;
  name: string;
  look: Look;
  // Guilds the player founded by hand: they hold skills the player names, and count as founded at once.
  guilds: { id: string; name: string; skills: { id: string; name: string; keywords?: string[] }[] }[];
  // A skill moved to another guild: { skillId: guildId }.
  moves: Record<string, string>;
  // A run sorted by hand: { runId: skillId }. Wins over the keywords.
  runs: Record<string, string>;
};
export const defaultGame = (): GameFile => ({
  version: 1, name: "Adventurer",
  look: { hair: "short", eyes: "round", mouth: "smile", body: "average", height: 1, hairColor: "#4a2f1b", facialHairColor: "#4a2f1b", skinColor: "#e0ac8a", eyeColor: "#3b6b8f" },
  guilds: [], moves: {}, runs: {},
});
export const gameFile = (home = homedir()) => join(home, ".kaizen", "game.json");
// Reads game.json; a missing one is created with the defaults, a broken one is read as the
// defaults and left alone for the user to fix.
export function readGame(home = homedir()): GameFile {
  const f = gameFile(home), text = read(f);
  const d = defaultGame();
  if (!text) {
    try { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(d, null, 2) + "\n"); } catch { /* read-only home: the defaults still serve */ }
    return d;
  }
  try {
    const g = JSON.parse(text);
    return { ...d, ...g, look: { ...d.look, ...(g.look ?? {}) }, guilds: Array.isArray(g.guilds) ? g.guilds : [], moves: g.moves ?? {}, runs: g.runs ?? {} };
  } catch { return d; }
}

// ---- skill sorting ---------------------------------------------------------------------
export type RunText = { title: string; text: string; track: string; exts: string[] };
const words = (s: string) => s.toLowerCase();
const has = (hay: string, kw: string) => new RegExp(`(?:^|[^a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`).test(hay);

// The guilds in play: the catalog, hand-founded guilds, and skills moved between guilds.
export function guildsOf(game: GameFile): Guild[] {
  const all: Guild[] = CATALOG.map((g) => ({ ...g, skills: [...g.skills] }));
  // A hand guild or skill whose id is already taken is skipped: a skill in two guilds would
  // count its XP twice.
  const taken = new Set(all.flatMap((g) => g.skills.map((s) => s.id)));
  for (const c of game.guilds) {
    if (!c?.id || all.some((g) => g.id === c.id)) continue;
    const skills = (Array.isArray(c.skills) ? c.skills : []).filter((s) => s?.id && !taken.has(s.id));
    for (const s of skills) taken.add(s.id);
    all.push({ id: c.id, name: c.name, blurb: "Founded by you.", byHand: true, skills: skills.map((s) => sk(s.id, s.name, s.keywords ?? [])) });
  }
  for (const [skill, to] of Object.entries(game.moves)) {
    const from = all.find((g) => g.skills.some((s) => s.id === skill)), dest = all.find((g) => g.id === to);
    if (!from || !dest || from === dest) continue;
    const s = from.skills.find((x) => x.id === skill)!;
    from.skills = from.skills.filter((x) => x !== s);
    dest.skills.push(s);
  }
  return all;
}

// ---- the game's own writes -------------------------------------------------------------
// The two things the player does: found a guild and move a skill. Both change game.json and
// nothing else; the previous file is kept as game.json.bak, the new one is renamed into place,
// every key already in the file survives, and a file that does not parse is never replaced.
export const MAX_HAND_GUILDS = 12, MAX_START_SKILLS = 8, MAX_NAME = 40;
export type Wrote<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
function cleanName(v: unknown): string | null {
  if (typeof v !== "string" || /[\u0000-\u001f\u007f]/.test(v)) return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t && t.length <= MAX_NAME ? t : null;
}

function loadStrict(home: string): { raw: Record<string, any>; game: GameFile } | string {
  const text = read(gameFile(home));
  if (!text) { const d = defaultGame(); return { raw: { ...d }, game: d }; }
  let raw: any;
  try { raw = JSON.parse(text); } catch { return "game.json cannot be read as JSON; fix or remove it first (nothing was written)"; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "game.json is not an object; fix or remove it first (nothing was written)";
  const d = defaultGame();
  return { raw, game: { ...d, ...raw, look: { ...d.look, ...(raw.look ?? {}) }, guilds: Array.isArray(raw.guilds) ? raw.guilds : [], moves: raw.moves ?? {}, runs: raw.runs ?? {} } };
}
function writeGame(home: string, raw: Record<string, any>) {
  const f = gameFile(home);
  mkdirSync(dirname(f), { recursive: true });
  if (existsSync(f)) copyFileSync(f, f + ".bak");
  const tmp = f + ".tmp";
  writeFileSync(tmp, JSON.stringify(raw, null, 2) + "\n");
  renameSync(tmp, f);
  resetGameCache();
}

export function foundGuild(name: unknown, skillNames: unknown = [], home = homedir()): Wrote<{ id: string; skills: string[] }> {
  const l = loadStrict(home);
  if (typeof l === "string") return { ok: false, error: l };
  const title = cleanName(name);
  if (!title) return { ok: false, error: `a guild needs a name of 1 to ${MAX_NAME} characters with no control characters` };
  const id = slug(title);
  if (!id) return { ok: false, error: "the name needs at least one letter or digit" };
  const all = guildsOf(l.game), hand = Array.isArray(l.raw.guilds) ? l.raw.guilds : [];
  if (all.some((g) => g.id === id || g.name.toLowerCase() === title.toLowerCase()) || hand.some((g: any) => g?.id === id)) return { ok: false, error: `a guild called "${title}" already exists` };
  // A guild id that is also a skill id would make "testing" mean two things.
  if (all.some((g) => g.skills.some((x) => x.id === id))) return { ok: false, error: `"${title}" is the name of a skill; pick another name` };
  if (hand.length >= MAX_HAND_GUILDS) return { ok: false, error: `you can found at most ${MAX_HAND_GUILDS} guilds by hand` };
  const names = Array.isArray(skillNames) ? skillNames : [];
  if (names.length > MAX_START_SKILLS) return { ok: false, error: `a new guild starts with at most ${MAX_START_SKILLS} skills` };
  const taken = new Set(all.flatMap((g) => g.skills.map((x) => x.id))), guildIds = new Set([...all.map((g) => g.id), id]), skills: { id: string; name: string }[] = [];
  for (const n of names) {
    const t = cleanName(n), sid = t ? slug(t) : "";
    if (!t || !sid) return { ok: false, error: `a skill needs a name of 1 to ${MAX_NAME} characters with a letter or digit, no control characters` };
    if (taken.has(sid) || guildIds.has(sid)) return { ok: false, error: `the skill "${t}" already exists, or is the name of a guild` };
    taken.add(sid); skills.push({ id: sid, name: t });
  }
  writeGame(home, { ...l.raw, guilds: [...hand, { id, name: title, skills }] });
  return { ok: true, id, skills: skills.map((x) => x.id) };
}

export function moveSkill(skill: unknown, guild: unknown, home = homedir()): Wrote<{ from: string; to: string; noop?: boolean }> {
  const l = loadStrict(home);
  if (typeof l === "string") return { ok: false, error: l };
  if (typeof skill !== "string" || typeof guild !== "string") return { ok: false, error: "a skill and a guild are needed" };
  const all = guildsOf(l.game), from = all.find((g) => g.skills.some((x) => x.id === skill)), dest = all.find((g) => g.id === guild);
  if (!from) return { ok: false, error: "no such skill" };
  if (!dest) return { ok: false, error: "no such guild" };
  if (from === dest) return { ok: true, from: from.id, to: dest.id, noop: true };
  // Back to where the skill started: the move is forgotten instead of recorded.
  const start = guildsOf({ ...l.game, moves: {} }).find((g) => g.skills.some((x) => x.id === skill))?.id;
  const moves: Record<string, string> = { ...(l.raw.moves && typeof l.raw.moves === "object" ? l.raw.moves : {}) };
  if (dest.id === start) delete moves[skill]; else moves[skill] = dest.id;
  writeGame(home, { ...l.raw, moves });
  return { ok: true, from: from.id, to: dest.id };
}

// The skill a run trained: the player's own sort first, then keywords in the title (x3) and
// text (x1) and changed-file extensions (x2 each), then the track's general skill.
export function skillOf(run: RunText, guilds: Guild[] = CATALOG, runId = "", sorted: Record<string, string> = {}): { guild: string; skill: string } {
  const by = sorted[runId];
  if (by) for (const g of guilds) if (g.skills.some((s) => s.id === by)) return { guild: g.id, skill: by };
  const title = words(run.title), text = words(run.text);
  let best: { guild: string; skill: string; score: number } | null = null;
  for (const g of guilds) for (const s of g.skills) {
    let score = 0;
    for (const kw of s.keywords) score += (has(title, kw) ? 3 : 0) + (has(text, kw) ? 1 : 0);
    for (const e of new Set(run.exts)) if (s.exts.includes(e)) score += 2;
    if (score > (best?.score ?? 0)) best = { guild: g.id, skill: s.id, score };
  }
  if (best) return { guild: best.guild, skill: best.skill };
  const guild = guilds.find((g) => g.id === (TRACK_GUILD[run.track] ?? "craft")) ?? guilds[0]!;
  return { guild: guild.id, skill: (guild.skills.find((s) => s.id.endsWith("-general")) ?? guild.skills[0]!).id };
}

// ---- dungeons --------------------------------------------------------------------------
export type Outcome = "cleared" | "retreat" | "live" | "stalled";
export type Dungeon = {
  id: string; title: string; project: string; guild: string; skill: string; outcome: Outcome;
  stages: { name: string; monsters: number; ms: number | null }[];
  waves: number; monsters: number; boss: boolean; files: number; length: number; xp: number; pending: number;
  stage: string;                           // the run's own stage: plan, build, review, done, abandoned
  work: { done: number; items: number } | null; // Work-list items ticked in progress.md; null when the run kept none
};
export const LIVE_MS = 2 * 3600_000; // a run in plan, build or review that moved within this is live, else stalled

// 3 stages plus one per fix round; monsters are plan steps (build) and review findings
// (review), at least one per stage; the boss is the review.
export function dungeonXp(monsters: number, waves: number, files: number) {
  return 50 + 10 * monsters + 25 * waves + Math.round(5 * Math.log2(1 + files));
}

function planSteps(plan: string): number {
  const sect = (h: RegExp) => { const m = plan.split(/^## /m).find((p) => h.test(p.split("\n")[0]!)); return m ? m.split("\n").slice(1) : []; };
  const work = sect(/^work list/i).filter((l) => /^\s*[-*]\s+\S/.test(l)).length;
  return work || sect(/^steps/i).filter((l) => /^\s*\d+\.\s+\S/.test(l)).length;
}

// progress.md has one line per Work-list item: `- done: ...`, `- doing: ...` or `- todo: ...`.
export function workOf(progress: string): { done: number; items: number } | null {
  const lines = progress.split("\n").map((l) => /^\s*[-*]\s+(done|doing|todo)\s*:/i.exec(l)?.[1]?.toLowerCase()).filter(Boolean);
  return lines.length ? { done: lines.filter((x) => x === "done").length, items: lines.length } : null;
}

export function dungeonOf(state: string, project: string, id: string, game: GameFile = defaultGame(), now = Date.now()): Dungeon | null {
  const dir = join(state, "runs", id);
  let s: any;
  try { s = JSON.parse(read(join(dir, "state.json"))); } catch { return null; }
  const st = runStat(state, id);
  const request = read(join(dir, "00-request.md")).trim();
  const title = (request.split("\n").find((l) => l.trim()) ?? id).replace(/^#+\s*/, "").slice(0, 90);
  const files = changedPaths(read(join(dir, "03-impl.md")), project);
  const track = st?.track ?? "";
  const { guild, skill } = skillOf({ title, text: request.slice(0, 2500), track, exts: files.map((f) => extname(f).toLowerCase()) }, guildsOf(game), id, game.runs);

  let iters: string[] = [];
  try { iters = readdirSync(join(dir, "05-iterations")); } catch { /* no fix rounds */ }
  const waves = new Set(iters.map((f) => /^(\d+)-fix/.exec(f)?.[1]).filter(Boolean)).size;
  const reviewed = existsSync(join(dir, "04-review.md"));
  const findings = reviewed ? reviewFindings(state, id).length : 0;
  const stages = [
    { name: "plan", monsters: 1, ms: st?.plan ?? null },
    { name: "build", monsters: Math.max(1, planSteps(read(join(dir, "01-plan.md")))), ms: st?.build ?? null },
    { name: "review", monsters: Math.max(1, findings), ms: st?.review ?? null },
    ...Array.from({ length: waves }, (_, i) => ({ name: `wave ${i + 1}`, monsters: 1, ms: null })),
  ];
  const monsters = stages.reduce((n, x) => n + x.monsters, 0);
  const stage = String(s.stage ?? "");
  const moved = Math.max(mtime(join(dir, "state.json")), mtime(join(dir, "progress.md")));
  const outcome: Outcome = stage === "done" ? "cleared" : stage === "abandoned" ? "retreat" : now - moved <= LIVE_MS ? "live" : "stalled";
  const xp = dungeonXp(monsters, waves, files.length);
  return {
    id, title, project, guild, skill, outcome, stages, waves, monsters, boss: reviewed, files: files.length,
    stage, work: workOf(read(join(dir, "progress.md"))),
    length: Math.round(3 + 2 * Math.log2(1 + files.length)),
    xp: outcome === "cleared" ? xp : 0, pending: outcome === "live" ? xp : 0,
  };
}

// ---- roll-up ---------------------------------------------------------------------------
export const LEARN_XP = 50;  // a skill's first cleared dungeon: learning it
export const FOUND_XP = 100; // a guild with a learned skill, or founded by hand

const stateDirs = (projects: string[], home: string) => {
  const dirs = [...projects.map((p) => ({ project: p, state: join(p, ".kaizen") })), { project: home, state: join(home, ".kaizen") }];
  return dirs.filter((d, i) => existsSync(join(d.state, "runs")) && dirs.findIndex((x) => x.state === d.state) === i);
};

export function gameState(opts: { home?: string; projects?: string[]; now?: number } = {}) {
  const t0 = Date.now(), home = opts.home ?? homedir(), now = opts.now ?? t0;
  const game = readGame(home), guilds = guildsOf(game);
  const dungeons: Dungeon[] = [];
  for (const { project, state } of stateDirs(opts.projects ?? knownProjects(), home)) {
    let ids: string[] = [];
    try { ids = readdirSync(join(state, "runs")); } catch { continue; }
    const name = project.split(/[\\/]/).filter(Boolean).pop() ?? project;
    for (const id of ids) { const d = dungeonOf(state, project, id, game, now); if (d) dungeons.push({ ...d, project: name }); }
  }
  const skillXp = new Map<string, { xp: number; runs: number }>();
  for (const d of dungeons) {
    const e = skillXp.get(d.skill) ?? { xp: 0, runs: 0 };
    if (d.outcome === "cleared") { e.xp += d.xp; e.runs++; }
    skillXp.set(d.skill, e);
  }
  const out = guilds.map((g) => {
    const skills = g.skills.map((s) => {
      const e = skillXp.get(s.id), learned = !!e && e.runs > 0;
      const xp = learned ? e!.xp + LEARN_XP : 0;
      return { id: s.id, name: s.name, learned, runs: e?.runs ?? 0, xp, ...levelOf(xp), level: learned ? levelOf(xp).level : 0 };
    });
    const learnedAny = skills.some((s) => s.learned), byHand = !!g.byHand;
    const founded = learnedAny || byHand;
    const xp = skills.reduce((n, s) => n + s.xp, 0) + (founded ? FOUND_XP : 0);
    return { id: g.id, name: g.name, blurb: g.blurb, founded, xp, ...levelOf(xp), level: founded ? levelOf(xp).level : 0, skills: skills.sort((a, b) => b.xp - a.xp) };
  });
  const xp = out.reduce((n, g) => n + g.xp, 0);
  const live = dungeons.filter((d) => d.outcome === "live");
  const rest = dungeons.filter((d) => d.outcome !== "live").sort((a, b) => b.id.localeCompare(a.id)).slice(0, 30);
  return {
    game, character: { name: game.name, xp, ...levelOf(xp) }, guilds: out,
    dungeons: [...live.sort((a, b) => b.id.localeCompare(a.id)), ...rest],
    totals: { runs: dungeons.length, cleared: dungeons.filter((d) => d.outcome === "cleared").length, retreat: dungeons.filter((d) => d.outcome === "retreat").length, live: live.length, stalled: dungeons.filter((d) => d.outcome === "stalled").length },
    ms: Date.now() - t0,
  };
}

// ---- cache -----------------------------------------------------------------------------
// `/game/state` is asked on every board event. Reading every run costs ~300 ms on a long
// history, while stat-ing the files a dungeon is built from costs a few. So the last result
// is kept until one of those files (or game.json, or the project list) changes, or a minute
// passes: a live run turns stalled by the clock alone.
const RUN_FILES = ["state.json", "progress.md", "00-request.md", "01-plan.md", "03-impl.md", "04-review.md", "stages.log", "05-iterations"];
export const CACHE_MS = 60_000;
let cache: { key: string; at: number; value: ReturnType<typeof gameState> } | null = null;
export const resetGameCache = () => { cache = null; }; // after a write: the file's time may not have moved yet

export function stateKey(home: string, projects: string[]) {
  const parts = [String(mtime(gameFile(home)))];
  for (const { state } of stateDirs(projects, home)) {
    let ids: string[] = [];
    try { ids = readdirSync(join(state, "runs")).sort(); } catch { continue; }
    parts.push(state);
    for (const id of ids) parts.push(id + ":" + RUN_FILES.map((f) => mtime(join(state, "runs", id, f))).join(","));
  }
  return parts.join("|");
}

export function cachedGameState(opts: { home?: string; projects?: string[]; now?: number } = {}) {
  const home = opts.home ?? homedir(), projects = opts.projects ?? knownProjects(), now = opts.now ?? Date.now();
  readGame(home); // creates game.json first, so its mtime is in the key from the first call
  const key = stateKey(home, projects);
  if (cache && cache.key === key && now - cache.at < CACHE_MS) return cache.value;
  const value = gameState({ home, projects, now });
  cache = { key, at: now, value };
  return value;
}
