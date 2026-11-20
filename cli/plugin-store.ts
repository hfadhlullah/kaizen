// Claude Code plugins in the skill store: the plugins in Anthropic's official marketplace (a public file on GitHub;
// Claude Code's own plugin cache is undocumented and is not read). Before an install kaizen downloads the plugin's
// files into a temp folder, lists what it brings (hooks and MCP servers run code; commands, agents and skills are
// instructions) and scans its skills, then deletes the folder. Install and uninstall go through `claude plugin`, argv
// only. kaizen records the plugins it installed in ~/.kaizen/plugins-store.json and uninstalls only those.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { run as runCmd, type Run } from "./rea.ts";
import { scanFolders, type Scan } from "./skill-scan.ts";
import { NAME, spawnIn, type Spawn } from "./skills-store.ts";

export const MARKET = "claude-plugins-official";
export const MARKET_REPO = "anthropics/claude-plugins-official";
const MARKET_URL = (process.env.KAIZEN_PLUGINS_MARKET ?? `https://raw.githubusercontent.com/${MARKET_REPO}/main`) + "/.claude-plugin/marketplace.json";
const REPO_URL = `https://github.com/${MARKET_REPO}.git`;

export type Source = { url: string; path: string; rev: string };
export type Plugin = { name: string; description: string; author: string; category: string; homepage: string; source: Source | null };
export type Brings = { hooks: string[]; mcp: string[]; commands: string[]; agents: string[]; skills: string[]; read: boolean; skillDirs?: string[] };

// ---- the marketplace, cached an hour
const GIT_URL = /^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*?(\.git)?$/;
const REV = /^[A-Za-z0-9][A-Za-z0-9_./-]{0,99}$/;
const SUBPATH = /^[A-Za-z0-9_][A-Za-z0-9_./-]{0,199}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\0-\x1f]/g, " ").trim().slice(0, max) : "");
// Where a marketplace entry's files live: a folder of the marketplace repo, a whole repo, or a folder of another repo.
// Anything else (an npm package, a command) is not inspected or offered.
export function readSource(src: unknown): Source | null {
  const safePath = (p: string) => (p === "" || (SUBPATH.test(p) && !p.split("/").includes("..")) ? p : null);
  if (typeof src === "string") {
    const p = safePath(src.replace(/^\.\//, ""));
    return p ? { url: REPO_URL, path: p, rev: "" } : null;
  }
  const s = src as any;
  if (!s || typeof s.url !== "string" || !GIT_URL.test(s.url)) return null;
  const rev = typeof s.sha === "string" && /^[0-9a-f]{40}$/.test(s.sha) ? s.sha : typeof s.ref === "string" && REV.test(s.ref) ? s.ref : "";
  if (s.source === "url") return { url: s.url, path: "", rev };
  if (s.source === "git-subdir") { const p = safePath(str(s.path, 200)); return p === null ? null : { url: s.url, path: p, rev }; }
  return null;
}
export function readMarket(j: any): Plugin[] {
  return (Array.isArray(j?.plugins) ? j.plugins : [])
    .map((p: any) => ({
      name: str(p?.name, 100), description: str(p?.description, 400),
      author: str(p?.author?.name ?? p?.author, 100), category: str(p?.category, 40),
      homepage: /^https:\/\//.test(p?.homepage ?? "") ? str(p.homepage, 300) : "", source: readSource(p?.source),
    }))
    .filter((p: Plugin) => NAME.test(p.name) && !p.name.includes(":") && p.source);
}
let cache: { at: number; list: Plugin[] } | null = null;
export const forgetMarket = () => { cache = null; };
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export async function market(f: Fetch = fetch, now = Date.now()): Promise<Plugin[] | null> {
  if (cache && now - cache.at < 3_600_000) return cache.list;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 10_000);
  try {
    const r = await f(MARKET_URL, { signal: ctl.signal });
    if (!r.ok) return cache?.list ?? null;
    cache = { at: now, list: readMarket(await r.json()) };
    return cache.list;
  } catch { return cache?.list ?? null; } finally { clearTimeout(timer); }
}
export async function searchPlugins(q: string, home: string, f: Fetch = fetch) {
  const list = await market(f);
  if (!list) return { hits: [], error: "The plugin list did not load. Try again in a moment." };
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const rec = pluginRecord(home);
  const hits = list
    .filter((p) => words.every((w) => `${p.name} ${p.description} ${p.category} ${p.author}`.toLowerCase().includes(w)))
    .slice(0, 30)
    .map(({ source: _s, ...p }) => ({ ...p, installed: Object.hasOwn(rec, p.name) }));
  return { hits };
}

const readJson = (file: string): any => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } };

// ---- what a plugin brings, read from its files (never run). Every file is read only when its real path (links
// resolved) is inside the plugin's folder; a declared file that can't be read that way makes `read` false, so the
// dialog says it may run hooks or MCP servers rather than "nothing".
const inside = (root: string, file: string) => {
  try { const r = realpathSync(root), f = realpathSync(file); return f === r || f.startsWith(r + sep); } catch { return false; }
};
export function brings(dir: string): Brings {
  let complete = true;
  const json = (file: string, declared = false): any => {
    if (!existsSync(file)) { if (declared) complete = false; return null; }
    if (!inside(dir, file)) { complete = false; return null; }
    try { return JSON.parse(readFileSync(file, "utf8")); } catch { complete = false; return null; }
  };
  const names = (sub: string, ext = "") => {
    if (!existsSync(join(dir, sub)) || !inside(dir, join(dir, sub))) return [];
    try { return readdirSync(join(dir, sub)).filter((n) => !ext || n.endsWith(ext)).map((n) => (ext ? n.slice(0, -ext.length) : n)).sort(); } catch { return []; }
  };
  // A manifest's `hooks` or `mcpServers` may be the thing itself, a path to a JSON file, or a list of either.
  const refs = (v: unknown): any[] => {
    if (Array.isArray(v)) return v.flatMap(refs);
    if (typeof v === "string") {
      const f = resolve(dir, v.replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/?/g, ""));
      return [json(f, true)].filter(Boolean);
    }
    return v && typeof v === "object" ? [v] : [];
  };
  const manifest = json(join(dir, ".claude-plugin", "plugin.json")) ?? {};
  const hookEvents = (h: any) => (h && typeof h === "object" ? Object.keys(h.hooks && typeof h.hooks === "object" ? h.hooks : h) : []);
  const servers = (m: any) => {
    const s = m && typeof m === "object" ? (m.mcpServers && typeof m.mcpServers === "object" ? m.mcpServers : m) : {};
    return Object.entries(s).map(([k, v]: [string, any]) => `${k}${typeof v?.command === "string" ? ` (runs ${[v.command, ...(Array.isArray(v.args) ? v.args : [])].join(" ").slice(0, 120)})` : typeof v?.url === "string" ? ` (${String(v.url).slice(0, 120)})` : ""}`);
  };
  const hookSets = [json(join(dir, "hooks", "hooks.json")), ...refs(manifest.hooks)];
  const mcpSets = [json(join(dir, ".mcp.json")), ...refs(manifest.mcpServers)];
  // `commands`, `agents` and `skills` may also name other folders or files in the manifest; those are listed too.
  const extra = (v: unknown, ext: string): string[] =>
    (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).flatMap((x) => {
      if (typeof x !== "string") return [];
      const rel = x.replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/?/g, ""), f = resolve(dir, rel);
      if (!existsSync(f) || !inside(dir, f)) { complete = false; return []; }
      if (statSync(f).isFile()) return [basename(f, ext)];
      return names(relative(dir, f), ext === "/" ? "" : ext);
    });
  // Skill folders: each folder with a SKILL.md under skills/ or under a folder the manifest names (or that folder
  // itself), real paths inside the plugin only. The scan gets these paths.
  const skillRoots = [join(dir, "skills"), ...(Array.isArray(manifest.skills) ? manifest.skills : typeof manifest.skills === "string" ? [manifest.skills] : [])
    .filter((x: unknown) => typeof x === "string").map((x: string) => resolve(dir, x.replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/?/g, "")))];
  const skillDirs = [...new Set(skillRoots.flatMap((root) => {
    if (!existsSync(root) || !inside(dir, root)) { if (root !== join(dir, "skills")) complete = false; return []; }
    if (existsSync(join(root, "SKILL.md"))) return [root];
    try { return readdirSync(root).map((n) => join(root, n)).filter((d) => existsSync(join(d, "SKILL.md")) && inside(dir, d)); } catch { return []; }
  }))].slice(0, 40);
  return {
    hooks: [...new Set(hookSets.flatMap(hookEvents))].map((e) => e.slice(0, 60)),
    mcp: [...new Set(mcpSets.flatMap(servers))].slice(0, 20),
    commands: [...new Set([...names("commands", ".md"), ...extra(manifest.commands, ".md")])].slice(0, 40),
    agents: [...new Set([...names("agents", ".md"), ...extra(manifest.agents, ".md")])].slice(0, 40),
    skills: skillDirs.map((d) => basename(d)),
    skillDirs,
    read: complete,
  };
}

// ---- download into a temp folder at the pinned revision, read, scan, delete
export const fetchArgv = (rev: string) => ["git", "fetch", "--depth", "1", "--quiet", "origin", rev || "HEAD"];
export type Inspect = { plugin: Omit<Plugin, "source">; brings: Brings; scan: Scan };
export async function inspectPlugin(name: string, deps: { list?: Plugin[] | null; spawn?: Spawn; scan?: (dirs: string[]) => Promise<Scan> } = {}): Promise<Inspect | { error: string }> {
  const list = deps.list === undefined ? await market() : deps.list;
  const p = list?.find((x) => x.name === name);
  if (!p || !p.source) return { error: "not a plugin in Anthropic's official marketplace" };
  const { source: src, ...plugin } = p;
  const none: Brings = { hooks: [], mcp: [], commands: [], agents: [], skills: [], read: false };
  const tmp = mkdtempSync(join(tmpdir(), "kz-plugin-"));
  try {
    const sp = deps.spawn ?? spawnIn, env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
    const steps = [["git", "init", "--quiet"], ["git", "remote", "add", "origin", src.url], fetchArgv(src.rev), ["git", "-c", "advice.detachedHead=false", "checkout", "--quiet", "FETCH_HEAD"]];
    for (const argv of steps) {
      const r = await sp(argv, { cwd: tmp, env }, 2 * 60_000);
      if (!r.ok) return { plugin, brings: none, scan: { ran: false, careful: true, why: "could not download the plugin to look at it" } };
    }
    const dir = resolve(tmp, src.path);
    // Lexically and with links resolved: a link in the repo can't send the reader or the scan outside it.
    if ((dir !== tmp && !dir.startsWith(tmp + sep)) || (existsSync(dir) && !inside(tmp, dir))) return { error: "the plugin's folder is outside its repository" };
    try { if (!statSync(dir).isDirectory()) throw 0; } catch { return { plugin, brings: none, scan: { ran: false, careful: true, why: "the plugin's folder is missing from its repository" } }; }
    const { skillDirs = [], ...b } = brings(dir);
    const scan = await (deps.scan ?? scanFolders)(skillDirs);
    return { plugin, brings: b, scan };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- install and uninstall through Claude Code, recorded
const recFile = (home: string) => join(home, ".kaizen", "plugins-store.json");
export function pluginRecord(home: string): Record<string, { at: number }> {
  const out: Record<string, { at: number }> = Object.create(null);
  try {
    const j = JSON.parse(readFileSync(recFile(home), "utf8"));
    if (j && typeof j === "object" && !Array.isArray(j)) for (const k of Object.keys(j)) if (NAME.test(k)) out[k] = { at: Number(j[k]?.at) || 0 };
  } catch { /* none yet */ }
  return out;
}
function savePlugins(home: string, rec: Record<string, { at: number }>) {
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  writeFileSync(recFile(home) + ".tmp", JSON.stringify(rec, null, 2) + "\n");
  renameSync(recFile(home) + ".tmp", recFile(home));
}
const claude = () => (process.platform === "win32" ? "claude.cmd" : "claude");
// No -y and no --accept-command: a plugin that installs by running a declared command is refused with Claude Code's
// own message rather than accepted on the user's behalf.
export const installPluginArgv = (name: string, haveMarket: boolean) =>
  [claude(), "plugin", "install", `${name}@${MARKET}`, "--scope", "user", "--json", ...(haveMarket ? [] : ["--marketplace", MARKET_REPO])];
export const uninstallPluginArgv = (name: string, market = MARKET) => [claude(), "plugin", "uninstall", `${name}@${market}`, "--scope", "user", "--json"];
const lastLine = (s: string) => s.trim().split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 300);
const haveMarket = (home: string) => { const j = readJson(join(home, ".claude", "plugins", "known_marketplaces.json")); return !!j && Object.hasOwn(j, MARKET); };

// What Claude Code installed: the commit it records for the plugin, when it records one.
export function installedSha(home: string, name: string): string | null {
  const j = readJson(join(home, ".claude", "plugins", "installed_plugins.json"));
  const at = j?.plugins?.[`${name}@${MARKET}`];
  const sha = Array.isArray(at) ? at.find((i: any) => typeof i?.gitCommitSha === "string")?.gitCommitSha : null;
  return typeof sha === "string" ? sha : null;
}
export async function installPlugin(home: string, name: string, list: Plugin[] | null, sh: Run = runCmd) {
  const p = list?.find((x) => x.name === name);
  if (!NAME.test(name) || name.includes(":") || !p) return { ok: false as const, why: "not a plugin in Anthropic's official marketplace" };
  const r = await sh(installPluginArgv(name, haveMarket(home)), 5 * 60_000);
  if (!r.ok) return { ok: false as const, why: lastLine(r.err || r.out || "claude plugin install failed") };
  // Inspect looked at the commit the marketplace pinned. If Claude Code installed a different one (the marketplace
  // moved between the look and the install), it is taken out again rather than kept unseen.
  const want = p.source && /^[0-9a-f]{40}$/.test(p.source.rev) ? p.source.rev : null, got = installedSha(home, name);
  if (want && got && got !== want) {
    const back = await sh(uninstallPluginArgv(name), 2 * 60_000);
    if (back.ok) return { ok: false as const, why: "the plugin changed between kaizen's look and the install, so it was removed again. Try again." };
    // It stays installed: record it, so its Remove button is there, and say so.
    const rec = pluginRecord(home);
    rec[name] = { at: Date.now() };
    savePlugins(home, rec);
    return { ok: false as const, why: "the plugin changed between kaizen's look and the install, and removing it again failed: it is still installed. Remove it in Settings → Skills → My Skills." };
  }
  const rec = pluginRecord(home);
  rec[name] = { at: Date.now() };
  savePlugins(home, rec);
  return { ok: true as const, name };
}
// Uninstalls a plugin Claude Code has installed for the user, from any marketplace, whoever installed it. Only a name
// and marketplace that installed_plugins.json lists with user scope reach `claude plugin uninstall`.
export async function uninstallPlugin(home: string, name: string, market: string = MARKET, sh: Run = runCmd) {
  const key = `${name}@${market}`;
  const reg = readJson(join(home, ".claude", "plugins", "installed_plugins.json"))?.plugins;
  const at = reg && typeof reg === "object" && Object.hasOwn(reg, key) ? reg[key] : null;
  if (!NAME.test(name) || name.includes(":") || !NAME.test(market) || market.includes(":") || !Array.isArray(at) || !at.some((i: any) => i?.scope === "user"))
    return { ok: false as const, why: "this plugin is not installed for your user, so kaizen does not remove it" };
  const r = await sh(uninstallPluginArgv(name, market), 2 * 60_000);
  if (!r.ok) return { ok: false as const, why: lastLine(r.err || r.out || "claude plugin uninstall failed") };
  const rec = pluginRecord(home);
  if (market === MARKET && Object.hasOwn(rec, name)) { delete rec[name]; savePlugins(home, rec); }
  return { ok: true as const, name };
}
