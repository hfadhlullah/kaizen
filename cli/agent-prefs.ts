// How each agent starts, per user: ~/.kaizen/agents.json, never config.yml, which is
// committed and differs by project while a command path differs by machine. No file
// means every launch stays as it was. Values may be hand-edited, so reads check them too.
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type Permissions = "all" | "own" | "bypass";
export type AgentPref = { enabled?: boolean; permissions?: Permissions; command?: string; args?: string[]; env?: Record<string, string> };
export type Prefs = { permissions: "own" | "bypass"; agents: Record<string, AgentPref> };
export type PrefPatch = { permissions?: unknown; agent?: unknown; enabled?: unknown; agentPermissions?: unknown; command?: unknown; args?: unknown; envName?: unknown; envValue?: unknown; envRemove?: unknown };

export const prefsFile = () => process.env.KAIZEN_AGENT_PREFS ?? join(homedir(), ".kaizen", "agents.json");

// The manual command joins these unquoted, so a shell-free argv is not enough.
const plainCommand = (s: string) => s.length <= 512 && /^[A-Za-z0-9_./\\:+@-]+$/.test(s) && !s.startsWith("-");
const plainArg = (s: string) => s.length <= 512 && /^[A-Za-z0-9_./\\:+@=,%-]+$/.test(s);
// Bypass has one road, the Permissions setting, which the card's mark follows.
// ponytail: known flags only; extend when an agent adds another spelling.
export const bypassArg = (s: string) => /^(--dangerously|--yolo$|--auto$|-y$|--full-auto$|--approval-mode|--permission-mode|--sandbox|--ask-for-approval|-a$)/.test(s);
const envName = (s: string) => /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(s) && !/^(PATH|HOME|SHELL|IFS|ENV|BASH_ENV|NODE_OPTIONS|LD_.*|DYLD_.*)$/i.test(s);
const envValue = (s: string) => s.length <= 8192 && !/[\0\r\n]/.test(s);

function clean(raw: any): Prefs {
  const agents: Prefs["agents"] = {};
  for (const [cmd, p] of Object.entries<any>(raw?.agents && typeof raw.agents === "object" ? raw.agents : {})) {
    if (!p || typeof p !== "object") continue;
    const a: AgentPref = {};
    if (p.enabled === false) a.enabled = false;
    if (p.permissions === "own" || p.permissions === "bypass") a.permissions = p.permissions;
    if (typeof p.command === "string" && plainCommand(p.command)) a.command = p.command;
    if (Array.isArray(p.args)) { const v = p.args.filter((x: unknown) => typeof x === "string" && plainArg(x) && !bypassArg(x)); if (v.length) a.args = v; }
    if (p.env && typeof p.env === "object") {
      const v = Object.fromEntries(Object.entries(p.env).filter(([k, x]) => envName(k) && typeof x === "string" && envValue(x))) as Record<string, string>;
      if (Object.keys(v).length) a.env = v;
    }
    agents[cmd] = a;
  }
  return { permissions: raw?.permissions === "bypass" ? "bypass" : "own", agents };
}

export function readPrefs(file = prefsFile()): Prefs {
  try { return clean(JSON.parse(readFileSync(file, "utf8"))); } catch { return clean(null); }
}

export const agentEnabled = (cmd: string, p = readPrefs()) => p.agents[cmd]?.enabled !== false;
export const commandOf = (cmd: string, p = readPrefs()) => p.agents[cmd]?.command ?? cmd;
export const argsOf = (cmd: string, p = readPrefs()) => p.agents[cmd]?.args ?? [];
export const prefersBypass = (cmd: string, p = readPrefs()) => {
  const own = p.agents[cmd]?.permissions;
  return own === "bypass" || (own !== "own" && p.permissions === "bypass");
};
// Through env, so a value is never read by a shell. Windows has no env(1): the page says so.
export const withEnv = (argv: string[], cmd: string, p = readPrefs(), win = process.platform === "win32") => {
  const e = Object.entries(p.agents[cmd]?.env ?? {});
  return e.length && !win ? ["env", ...e.map(([k, v]) => `${k}=${v}`), ...argv] : argv;
};

// What the page may see: an environment value never leaves this file.
export function publicPref(cmd: string, p = readPrefs()) {
  const a = p.agents[cmd] ?? {};
  return { enabled: a.enabled !== false, permissions: a.permissions ?? "all", command: a.command ?? "", args: (a.args ?? []).join(" "), env: Object.keys(a.env ?? {}) };
}

// Applies one change; the error never quotes an environment value.
export function savePrefs(patch: PrefPatch, known: string[], file = prefsFile()): { ok: true } | { error: string } {
  const p = readPrefs(file);
  if (patch.permissions !== undefined) {
    if (patch.permissions !== "own" && patch.permissions !== "bypass") return { error: "unknown permission mode" };
    p.permissions = patch.permissions;
  }
  if (patch.agent !== undefined) {
    const cmd = String(patch.agent);
    if (!known.includes(cmd)) return { error: "unknown agent" };
    const a = (p.agents[cmd] ??= {});
    if (patch.enabled !== undefined) { if (patch.enabled) delete a.enabled; else a.enabled = false; }
    if (patch.agentPermissions !== undefined) {
      if (patch.agentPermissions === "all") delete a.permissions;
      else if (patch.agentPermissions === "own" || patch.agentPermissions === "bypass") a.permissions = patch.agentPermissions;
      else return { error: "unknown permission mode" };
    }
    if (patch.command !== undefined) {
      const c = String(patch.command).trim();
      if (c && !plainCommand(c)) return { error: "A command is one program name or path, with no spaces or shell characters" };
      if (c) a.command = c; else delete a.command;
    }
    if (patch.args !== undefined) {
      const v = String(patch.args).trim().split(/\s+/).filter(Boolean);
      if (!v.every(plainArg)) return { error: "Arguments can't hold quotes or shell characters" };
      if (v.some(bypassArg)) return { error: "Use Permissions for bypass, so the card can show it" };
      if (v.length) a.args = v; else delete a.args;
    }
    if (patch.envName !== undefined) {
      const k = String(patch.envName), v = String(patch.envValue ?? "");
      if (!envName(k)) return { error: "That variable name isn't allowed" };
      if (!envValue(v)) return { error: "An environment value can't hold line breaks" };
      // Blank keeps a saved value.
      if (v || a.env?.[k] === undefined) (a.env ??= {})[k] = v;
    }
    if (patch.envRemove !== undefined && a.env) delete a.env[String(patch.envRemove)];
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(p, null, 2) + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  return { ok: true };
}
