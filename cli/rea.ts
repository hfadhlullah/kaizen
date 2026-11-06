// REA (npm `rea-agents`, github.com/morluto/rea): reverse-engineering tools as an MCP server,
// turned on from Settings → Skills. Kaizen never writes an agent's config itself: REA's own
// `setup`, `uninstall` and `doctor` do, through `npx` pinned to an exact version. Kaizen keeps
// only its switch in ~/.kaizen/rea.json and reads agent configs to see what is registered.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SKILL_HOMES } from "./skills.ts";

export type Run = (argv: string[]) => Promise<{ ok: boolean; out: string }>;
export type Reg = { client: string; version: string | null };
export type Saved = { on: boolean; version: string; clients: string[] };

const VERSION = /^\d+\.\d+\.\d+$/;
export const okVersion = (v: unknown): v is string => typeof v === "string" && VERSION.test(v);

// The agent home folders kaizen knows (SKILL_HOMES) and their REA client ids.
const CLIENT: Record<string, string> = { ".claude": "claude_code", ".codex": "codex", ".agents": "antigravity", ".opencode": "opencode", ".cursor": "cursor", ".gemini": "gemini_cli" };
export const reaClients = (home: string) => SKILL_HOMES.filter((h) => existsSync(join(home, h.dir)) && CLIENT[h.dir]).map((h) => ({ agent: h.name, client: CLIENT[h.dir]! }));

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const pkg = (version: string) => `rea-agents@${version}`;

// Up to 5 minutes: a first npx run downloads REA (about 50 MB). A missing npx is a failure, not a throw.
export const run: Run = async (argv) => {
  try {
    const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore", windowsHide: true });
    const timer = setTimeout(() => p.kill(), 5 * 60_000);
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    clearTimeout(timer);
    return { ok: code === 0, out: out || err };
  } catch (e: any) { return { ok: false, out: `${argv[0]} not found: ${e?.message ?? e}` }; }
};

// REA prints one JSON document with --json; anything before it is noise.
export function parse(out: string): any {
  const at = out.indexOf("{");
  try { return JSON.parse(at < 0 ? out : out.slice(at)); } catch { return null; }
}

// The files a setup plan names: any string under a path-like key, deduplicated.
export function planFiles(j: any): string[] {
  const found = new Set<string>();
  const walk = (v: any, key = "") => {
    if (typeof v === "string") { if (/(^|_)(path|file|target|config)s?$/i.test(key) && /[\\/]/.test(v)) found.add(v); return; }
    if (Array.isArray(v)) return v.forEach((x) => walk(x, key));
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(j);
  return [...found];
}

// What doctor says is missing: every check object that failed, by its name or message.
export function doctorMissing(j: any): string[] {
  const out = new Set<string>();
  const walk = (v: any) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const bad = v.ok === false || v.passed === false || /^(fail|failed|error|missing)$/i.test(String(v.status ?? ""));
    if (bad && (v.name || v.id || v.message)) out.add(String(v.name ?? v.id ?? v.message).slice(0, 80));
    for (const x of Object.values(v)) if (x && typeof x === "object") walk(x);
  };
  if (j) for (const k of ["scope_checks", "informational_checks", "providerInspections", "checks"]) walk(j[k]);
  return [...out];
}

// Where each client keeps REA's entry. Read only, to show the switch and the installed
// version without running npx; REA itself writes them. A missing file is simply "not here".
const CONFIGS: Record<string, (home: string) => string[]> = {
  claude_code: (h) => [join(process.env.CLAUDE_CONFIG_DIR ?? h, ".claude.json")],
  codex: (h) => [join(process.env.CODEX_HOME ?? join(h, ".codex"), "config.toml")],
  gemini_cli: (h) => [join(h, ".gemini", "settings.json")],
  antigravity: (h) => [join(h, ".gemini", "antigravity", "mcp_config.json")],
  cursor: (h) => [join(h, ".cursor", "mcp.json")],
  opencode: (h) => [join(h, ".config", "opencode", "opencode.json"), join(h, ".config", "opencode", "opencode.jsonc")],
};
export function reaRegistered(home: string): Reg[] {
  return reaClients(home).flatMap(({ client }) => {
    for (const f of CONFIGS[client]!(home)) {
      let t: string;
      try { t = readFileSync(f, "utf8"); } catch { continue; }
      const v = /rea-agents@(\d+\.\d+\.\d+)/.exec(t)?.[1];
      // A pinned npx entry gives the version; a global install (`"command": "rea"`) only the
      // server's key: a JSON `"rea": {` or a TOML `[mcp_servers.rea]`.
      if (v || /["']rea["']\s*:\s*\{/.test(t) || /^\[mcp_servers\.rea\]/m.test(t)) return [{ client, version: v ?? null }];
    }
    return [];
  });
}

const file = (home: string) => join(home, ".kaizen", "rea.json");
export function reaSaved(home: string): Saved | null {
  try {
    const j = JSON.parse(readFileSync(file(home), "utf8"));
    return j && j.on === true && okVersion(j.version) && Array.isArray(j.clients) ? { on: true, version: j.version, clients: j.clients.filter((c: unknown) => typeof c === "string") } : null;
  } catch { return null; }
}
function save(home: string, s: Saved | null) {
  if (!s) return rmSync(file(home), { force: true });
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  writeFileSync(file(home) + ".tmp", JSON.stringify(s, null, 2));
  renameSync(file(home) + ".tmp", file(home));
}

const validClients = (home: string, clients: string[]) => {
  const known = new Set(reaClients(home).map((c) => c.client));
  return clients.length > 0 && clients.every((c) => known.has(c));
};
const clientArgs = (clients: string[]) => clients.flatMap((c) => ["--client", c]);
// REA's own words when a step did not go through: its message, else the first line it printed.
const reason = (j: any, out: string) => String(j?.message ?? j?.error ?? j?.reason ?? (out.trim().split("\n")[0] || "REA did not answer")).slice(0, 300);

export async function reaLatest(sh: Run = run): Promise<string | null> {
  const r = await sh([npm, "view", "rea-agents", "version"]);
  const v = r.out.trim().split("\n").pop()?.trim();
  return r.ok && okVersion(v) ? v : null;
}

// The dry run: what `setup` would change, nothing written.
export async function reaPlan(home: string, version: string, clients: string[], sh: Run = run) {
  if (!okVersion(version) || !validClients(home, clients)) return { ok: false as const, why: "no REA version or agent to set up" };
  const r = await sh([npx, "-y", pkg(version), "setup", ...clientArgs(clients), "--dry-run", "--json"]);
  const j = parse(r.out);
  if (!r.ok || !j || j.status !== "planned") return { ok: false as const, why: reason(j, r.out) };
  return { ok: true as const, version, clients, files: planFiles(j) };
}

// Applies a plan the user saw. Saved only when REA says it is done.
export async function reaApply(home: string, version: string, clients: string[], sh: Run = run) {
  if (!okVersion(version) || !validClients(home, clients)) return { ok: false as const, why: "no REA version or agent to set up" };
  const r = await sh([npx, "-y", pkg(version), "setup", ...clientArgs(clients), "--yes", "--json"]);
  const j = parse(r.out);
  if (!r.ok || !j || /^(needs_confirmation|needs_human|cancelled|planned)$/.test(String(j.status)) || j.reason === "conflict") return { ok: false as const, why: reason(j, r.out) };
  save(home, { on: true, version, clients });
  return { ok: true as const, version };
}

// Off: REA's own uninstall, whoever set REA up. What it leaves (a Claude local or profile
// registration, which REA does not touch) is named with the command that removes it.
export async function reaRemove(home: string, sh: Run = run) {
  const version = reaSaved(home)?.version ?? reaRegistered(home).find((r) => r.version)?.version ?? (await reaLatest(sh));
  if (!okVersion(version)) return { ok: false as const, why: "can't tell which REA to run: npm is unreachable" };
  const r = await sh([npx, "-y", pkg(version), "uninstall", "--json"]);
  if (!r.ok) return { ok: false as const, why: reason(parse(r.out), r.out) };
  save(home, null);
  const left = reaRegistered(home).map((x) => x.client);
  return { ok: true as const, left, ...(left.includes("claude_code") ? { hint: "claude mcp remove --scope user rea" } : {}) };
}

// Doctor runs npx, so it is cached and never awaited by the page: the first look starts it.
const doctorCache = new Map<string, { at: number; p: Promise<{ healthy: boolean; missing: string[] } | null>; v?: { healthy: boolean; missing: string[] } | null }>();
export function reaDoctor(version: string, sh: Run = run, now = Date.now()) {
  const hit = doctorCache.get(version);
  if (hit && now - hit.at < 10 * 60_000) return hit.v;
  const entry: { at: number; p: Promise<any>; v?: any } = { at: now, p: Promise.resolve(null) };
  entry.p = sh([npx, "-y", pkg(version), "doctor", "--json"]).then((r) => {
    const j = parse(r.out);
    entry.v = j ? { healthy: j.healthy === true, missing: doctorMissing(j) } : null;
    return entry.v;
  });
  doctorCache.set(version, entry);
  return hit?.v;
}
export const forgetDoctor = () => doctorCache.clear();

const latestCache = { at: 0, v: null as string | null, p: null as Promise<string | null> | null };
function cachedLatest(sh: Run, now: number) {
  if (now - latestCache.at > 60 * 60_000 && !latestCache.p) {
    latestCache.p = reaLatest(sh).then((v) => { latestCache.v = v; latestCache.at = Date.now(); latestCache.p = null; return v; });
  }
  return latestCache.v;
}
export const forgetLatest = () => { latestCache.at = 0; latestCache.v = null; latestCache.p = null; };

const newer = (a: string, b: string) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
  return false;
};

// The row on Settings → Skills. Off and never set up: no npx, no npm, nothing run.
export function reaRow(home: string, sh: Run = run, now = Date.now()) {
  const saved = reaSaved(home), reg = reaRegistered(home);
  const on = !!saved || reg.length > 0;
  const installed = saved?.version ?? reg.find((r) => r.version)?.version ?? null;
  const latest = on ? cachedLatest(sh, now) : null;
  const doc = on && installed ? reaDoctor(installed, sh, now) : null;
  const regd = new Set(reg.map((r) => r.client));
  const note = !on ? undefined
    : `REA ${installed ?? "(version unknown)"}${!saved ? " · set up outside kaizen" : ""}${latest && installed && newer(latest, installed) ? ` · ${latest} available` : ""}${doc === undefined ? " · checking what it needs…" : ""}`;
  return {
    id: "rea", title: "Reverse engineering (REA)", group: "optional", offByDefault: true, status: "beta",
    description: "Lets agents study apps, binaries, packages and file formats whose source isn't here, through REA's MCP tools.",
    off: !on, needs: (doc?.missing ?? []).map((name) => ({ name, found: false })),
    agents: reaClients(home).map((c) => ({ agent: c.agent, state: regd.has(c.client) ? "installed" : "missing" })),
    ...(note ? { note } : {}),
    rea: { installed, latest, update: !!(latest && installed && newer(latest, installed)), outside: on && !saved, clients: reaClients(home).map((c) => c.client) },
  };
}
