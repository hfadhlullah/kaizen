// The skill store on Settings → Skills: search skills.sh, read each result's three security audits, and install or
// remove a skill with the registry's own CLI (`npx skills`, pinned). kaizen keeps its own record of what it installed
// (~/.kaizen/skills-store.json) and removes only those. Nothing here runs a shell: argv arrays only, and a source or
// name outside the patterns below is refused before any process starts.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SKILL_HOMES } from "./skills.ts";
import { scanFolders, type Scan } from "./skill-scan.ts";
import { run as runCmd, type Run } from "./rea.ts";

export const SKILLS_CLI = "skills@1.9.0";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
// Each part starts with a letter or digit, so a source can't be a path ("../x", "./x") and a name can't be a flag ("-a").
export const SOURCE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
export const NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
// KAIZEN_SKILLS_SH points both at a local stand-in in tests; nothing else sets it.
const SH = process.env.KAIZEN_SKILLS_SH;
const SEARCH_URL = (SH ?? "https://skills.sh") + "/api/search";
const AUDIT_URL = (SH ?? "https://www.skills.sh") + "/tele/audit";

export type Risk = "safe" | "low" | "medium" | "high" | "critical" | "unknown";
export type Audit = { gen: Risk; socket: Risk; snyk: Risk; socketScore?: number };
export type Hit = { source: string; name: string; installs: number; audit: Audit; clean: boolean; installed: boolean };
type Rec = { source: string; hash?: string; path?: string; md?: string; at: number };

// ---- what kaizen installed
const recFile = (home: string) => join(home, ".kaizen", "skills-store.json");
// A map with no prototype, so a name like "constructor" or "__proto__" is never found unless it was recorded.
export function storeRecord(home: string): Record<string, Rec> {
  const out: Record<string, Rec> = Object.create(null);
  try {
    const j = JSON.parse(readFileSync(recFile(home), "utf8"));
    if (j && typeof j === "object" && !Array.isArray(j))
      for (const [k, v] of Object.entries(j)) if (NAME.test(k) && v && typeof (v as Rec).source === "string") out[k] = v as Rec;
  } catch { /* none yet */ }
  return out;
}
export const recorded = (rec: Record<string, Rec>, name: string) => Object.hasOwn(rec, name);
// The SKILL.md kaizen installed, so a skill of the same name the user put there later is never taken for it.
const fingerprint = (dir?: string) => {
  try { return dir ? createHash("sha256").update(readFileSync(join(dir, "SKILL.md"))).digest("hex") : ""; } catch { return ""; }
};
function saveRecord(home: string, rec: Record<string, Rec>) {
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  const tmp = recFile(home) + ".tmp";
  writeFileSync(tmp, JSON.stringify(rec, null, 2) + "\n");
  renameSync(tmp, recFile(home));
}

// ---- audits: all three safe or low is clean; anything else, missing or unread, asks twice
const RISKS = ["safe", "low", "medium", "high", "critical"];
const risk = (v: unknown): Risk => (typeof v === "string" && RISKS.includes(v) ? (v as Risk) : "unknown");
export function readAudit(j: any): Audit {
  const score = j?.socket?.score;
  return { gen: risk(j?.ath?.risk), socket: risk(j?.socket?.risk), snyk: risk(j?.snyk?.risk), ...(typeof score === "number" ? { socketScore: score } : {}) };
}
export const isClean = (a: Audit) => [a.gen, a.socket, a.snyk].every((r) => r === "safe" || r === "low");

// ---- the network, with short timeouts and small caches; a failure is "unknown", never a throw
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
async function getJson(url: string, ms: number, f: Fetch): Promise<any> {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await f(url, { signal: ctl.signal, headers: { accept: "application/json" } });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}
const searchCache = new Map<string, { at: number; hits: { source: string; name: string; installs: number }[] }>();
const auditCache = new Map<string, { at: number; audit: Audit }>();
export const forgetStore = () => { searchCache.clear(); auditCache.clear(); };

export async function audits(source: string, names: string[], f: Fetch = fetch, now = Date.now()): Promise<Record<string, Audit>> {
  const out: Record<string, Audit> = {}, want: string[] = [];
  for (const n of names) {
    const c = auditCache.get(`${source}/${n}`);
    if (c && now - c.at < 3_600_000) out[n] = c.audit; else want.push(n);
  }
  if (want.length && SOURCE.test(source)) {
    const j = await getJson(`${AUDIT_URL}?${new URLSearchParams({ source, skills: want.join(",") })}`, 5_000, f);
    for (const n of want) {
      const a = readAudit(j?.[n]);
      out[n] = a;
      // An unread answer is not cached, so the next look tries again.
      if (j) auditCache.set(`${source}/${n}`, { at: now, audit: a });
    }
  }
  for (const n of names) out[n] ??= readAudit(null);
  return out;
}

export async function search(q: string, home: string, f: Fetch = fetch, now = Date.now()): Promise<{ hits: Hit[]; error?: string }> {
  const query = q.replace(/[\0-\x1f]/g, " ").trim().slice(0, 100);
  if (!query) return { hits: [] };
  let base = searchCache.get(query.toLowerCase());
  if (!base || now - base.at > 600_000) {
    const j = await getJson(`${SEARCH_URL}?${new URLSearchParams({ q: query, limit: "20" })}`, 10_000, f);
    if (!j || !Array.isArray(j.skills)) return { hits: [], error: "skills.sh did not answer. Try again in a moment." };
    const hits = j.skills
      .map((s: any) => ({ source: String(s?.source ?? ""), name: String(s?.skillId ?? s?.name ?? ""), installs: Number(s?.installs) || 0 }))
      .filter((s: any) => SOURCE.test(s.source) && NAME.test(s.name));
    base = { at: now, hits };
    searchCache.set(query.toLowerCase(), base);
  }
  const bySource = new Map<string, string[]>();
  for (const h of base.hits) bySource.set(h.source, [...(bySource.get(h.source) ?? []), h.name]);
  const found = new Map<string, Audit>();
  await Promise.all([...bySource].map(async ([source, names]) => {
    const a = await audits(source, names, f, now);
    for (const n of names) found.set(`${source}/${n}`, a[n]!);
  }));
  const rec = storeRecord(home);
  return {
    hits: base.hits.map((h) => {
      const audit = found.get(`${h.source}/${h.name}`) ?? readAudit(null);
      return { ...h, audit, clean: isClean(audit), installed: recorded(rec, h.name) };
    }),
  };
}

// ---- install and remove through the registry's own CLI, pinned. `-a` names only the agents kaizen sees on this
// computer: left to itself the CLI also links agents whose config folder merely exists (it put the skill in
// ~/.config/devin and ~/.config/goose in a trial), and `-a '*'` made folders for about 60 agents. The CLI always keeps
// its copy in ~/.agents/skills, which kaizen's Antigravity reads. No telemetry from kaizen's runs.
const CLI_AGENT: Record<string, string> = { ".claude": "claude-code", ".codex": "codex", ".gemini": "gemini-cli", ".cursor": "cursor", ".opencode": "opencode" };
export const cliAgents = (home: string) =>
  SKILL_HOMES.filter((h) => CLI_AGENT[h.dir] && existsSync(join(home, h.dir))).map((h) => CLI_AGENT[h.dir]!);
export const installArgv = (source: string, name: string, agents: string[]) =>
  [npx, "-y", SKILLS_CLI, "add", source, "--skill", name, "-g", "-y", "--json", "-a", ...agents];
export const removeArgv = (name: string) => [npx, "-y", SKILLS_CLI, "remove", name, "-g", "-y"];

// `npx skills add --json` prints progress, then one JSON array; take the array.
export function parseInstall(out: string): any[] | null {
  const at = out.search(/^\s*\[/m);
  if (at < 0) return null;
  try { const j = JSON.parse(out.slice(at)); return Array.isArray(j) ? j : null; } catch { return null; }
}

export type Done = { ok: true; name: string; path?: string; agents?: string[] } | { ok: false; why: string };
export async function install(home: string, source: string, name: string, sh: Run = withEnv(runCmd)): Promise<Done> {
  if (!SOURCE.test(source) || !NAME.test(name)) return { ok: false, why: "not a skills.sh skill name" };
  const agents = cliAgents(home);
  if (!agents.length) return { ok: false, why: "no agent found on this computer to give the skill to" };
  const r = await sh(installArgv(source, name, agents), 3 * 60_000);
  const res = parseInstall(r.out)?.find((x: any) => x?.name === name);
  if (!r.ok || !res || res.status === "failed")
    return { ok: false, why: (r.err || r.out || "npx skills failed").trim().split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 300) };
  const rec = storeRecord(home);
  // The CLI's own global copy is ~/.agents/skills/<name>; used when its answer names no path.
  const fallback = join(home, ".agents", "skills", name);
  const path = typeof res.path === "string" ? res.path : existsSync(fallback) ? fallback : undefined;
  rec[name] = { source, ...(typeof res.hash === "string" ? { hash: res.hash } : {}), ...(path ? { path, md: fingerprint(path) } : {}), at: Date.now() };
  saveRecord(home, rec);
  return { ok: true, name, path: res.path, agents: Array.isArray(res.agents) ? res.agents.map(String) : [] };
}

// Only a skill kaizen installed can be removed from the board: a folder the user made, or a link to something else,
// is theirs.
export async function remove(home: string, name: string, sh: Run = withEnv(runCmd)): Promise<Done> {
  const rec = storeRecord(home);
  if (!NAME.test(name) || !recorded(rec, name)) return { ok: false, why: "kaizen did not install this skill, so it does not remove it" };
  // The folder must still be the one kaizen installed: same place, same SKILL.md.
  if (!rec[name]!.path || !rec[name]!.md || fingerprint(rec[name]!.path) !== rec[name]!.md)
    return { ok: false, why: "this skill was changed or replaced since kaizen installed it, so kaizen leaves it alone" };
  const r = await sh(removeArgv(name), 60_000);
  const still = existsSync(rec[name]!.path!);
  if (!r.ok || still) return { ok: false, why: (r.err || r.out || "npx skills remove failed").trim().split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 300) };
  delete rec[name];
  saveRecord(home, rec);
  return { ok: true, name };
}

// The CLI reports installs to skills.sh unless told not to; kaizen's runs don't.
function withEnv(sh: Run): Run {
  return (argv, ms) => {
    const before = { d: process.env.DISABLE_TELEMETRY, n: process.env.DO_NOT_TRACK };
    process.env.DISABLE_TELEMETRY = "1";
    process.env.DO_NOT_TRACK = "1";
    // Bun.spawn copies the environment when it starts, so restoring it right after is safe.
    const p = sh(argv, ms);
    if (before.d === undefined) delete process.env.DISABLE_TELEMETRY; else process.env.DISABLE_TELEMETRY = before.d;
    if (before.n === undefined) delete process.env.DO_NOT_TRACK; else process.env.DO_NOT_TRACK = before.n;
    return p;
  };
}

// ---- inspect before install: the CLI copies the skill into an empty temp folder (project scope, its HOME pointed at
// the same temp folder so nothing of the user's is touched), kaizen scans that copy, and the folder is deleted.
export type Spawn = (argv: string[], opts: { cwd: string; env: Record<string, string | undefined> }, ms: number) => Promise<{ ok: boolean; out: string }>;
export const spawnIn: Spawn = async (argv, { cwd, env }, ms) => {
  try {
    const p = Bun.spawn(argv, { cwd, env, stdout: "pipe", stderr: "pipe", stdin: "ignore", windowsHide: true });
    const timer = setTimeout(() => p.kill(), ms);
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    clearTimeout(timer);
    return { ok: code === 0, out: out || err };
  } catch (e: any) { return { ok: false, out: `${argv[0]} not found: ${e?.message ?? e}` }; }
};
export const copyArgv = (source: string, name: string) => [npx, "-y", SKILLS_CLI, "add", source, "--skill", name, "-y", "--copy", "-a", "claude-code"];

export async function inspectSkill(source: string, name: string, deps: { spawn?: Spawn; scan?: (dirs: string[]) => Promise<Scan> } = {}): Promise<Scan> {
  if (!SOURCE.test(source) || !NAME.test(name)) return { ran: false, careful: true, why: "not a skills.sh skill name" };
  const tmp = mkdtempSync(join(tmpdir(), "kz-skill-"));
  try {
    const env = { ...process.env, HOME: tmp, USERPROFILE: tmp, DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1" };
    // The npm cache stays the user's own, so the pinned CLI is not downloaded again for every look.
    if (!env.npm_config_cache && process.env.HOME) env.npm_config_cache = join(process.env.HOME, ".npm");
    const r = await (deps.spawn ?? spawnIn)(copyArgv(source, name), { cwd: tmp, env }, 3 * 60_000);
    const dir = join(tmp, ".claude", "skills", name);
    if (!r.ok || !existsSync(join(dir, "SKILL.md"))) return { ran: false, careful: true, why: "could not download the skill to look at it" };
    return await (deps.scan ?? scanFolders)([dir]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
