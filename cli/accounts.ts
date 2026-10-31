// Named logins for Claude and Codex. Each has its own folder, which the tool itself fills:
// kaizen stores no token. ~/.kaizen/accounts.json lists them. No accounts means every launch
// stays on the normal login. A chosen account that can't be used refuses the launch: falling
// back would run the work, and bill it, under another account.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Tool = "claude" | "codex";
export type Account = { id: string; tool: Tool; name: string };
export type Accounts = { accounts: Account[]; default: Partial<Record<Tool, string>> };

export const ACCOUNT_VAR: Record<Tool, string> = { claude: "CLAUDE_CONFIG_DIR", codex: "CODEX_HOME" };
const root = () => process.env.KAIZEN_ACCOUNTS_HOME ?? join(homedir(), ".kaizen");
const file = () => join(root(), "accounts.json");
const validId = (id: string) => /^[a-z0-9]{8,32}$/.test(id);
export const accountDir = (id: string) => join(root(), "accounts", id);
const isTool = (t: unknown): t is Tool => t === "claude" || t === "codex";

export function readAccounts(): Accounts {
  try {
    const r = JSON.parse(readFileSync(file(), "utf8"));
    const accounts = (Array.isArray(r.accounts) ? r.accounts : []).filter((a: any) => a && validId(a.id) && isTool(a.tool) && typeof a.name === "string");
    return { accounts, default: r.default && typeof r.default === "object" ? r.default : {} };
  } catch { return { accounts: [], default: {} }; }
}

function save(a: Accounts) {
  mkdirSync(root(), { recursive: true });
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify(a, null, 2) + "\n", { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file());
}

// Kaizen's own links, copied from the normal login's folder, so a run works under the account.
export function linkKaizen(dir: string, tool: Tool, from = join(homedir(), tool === "claude" ? ".claude" : ".codex")) {
  for (const sub of tool === "claude" ? ["skills", "agents", "commands"] : ["skills"]) {
    let names: string[] = [];
    try { names = readdirSync(join(from, sub)).filter((n) => n.startsWith("kaizen")); } catch { continue; }
    mkdirSync(join(dir, sub), { recursive: true });
    for (const n of names) {
      const to = join(dir, sub, n);
      try { lstatSync(to); continue; } catch { /* free */ }
      try { symlinkSync(realpathSync(join(from, sub, n)), to, process.platform === "win32" ? "junction" : undefined); } catch { /* the run says what's missing */ }
    }
  }
}

const cleanName = (v: unknown) => String(v ?? "").replace(/[\0-\x1f\x7f]/g, "").trim();

export function renameAccount(id: string, name: unknown): string | null {
  const n = cleanName(name), a = readAccounts(), me = a.accounts.find((x) => x.id === id);
  if (!me) return "unknown account";
  if (!n || n.length > 60) return "Name it, in 60 characters or fewer";
  if (a.accounts.some((x) => x !== me && x.tool === me.tool && x.name === n)) return "That name is taken";
  me.name = n;
  save(a);
  return null;
}

export function addAccount(tool: unknown, name: unknown): { id: string } | { error: string } {
  if (!isTool(tool)) return { error: "unknown tool" };
  const a = readAccounts();
  // No name: the tool's, numbered. It can be renamed after sign-in.
  const base = tool === "claude" ? "Claude" : "Codex";
  let auto = base;
  for (let i = 2; a.accounts.some((x) => x.tool === tool && x.name === auto); i++) auto = `${base} ${i}`;
  const n = cleanName(name) || auto;
  if (n.length > 60) return { error: "Keep the name to 60 characters" };
  if (a.accounts.some((x) => x.tool === tool && x.name === n)) return { error: "That name is taken" };
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16), dir = accountDir(id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  linkKaizen(dir, tool);
  a.accounts.push({ id, tool, name: n });
  save(a);
  return { id };
}

// The folder holds the login and that account's conversations, so it goes only when asked.
// Whether the tool has saved a login here. The file is only looked at, never read.
export const signedIn = (dir: string, tool: Tool) => existsSync(join(dir, tool === "claude" ? ".credentials.json" : "auth.json"));

export function removeAccount(id: string, deleteFolder = false): string | null {
  const a = readAccounts();
  if (!validId(id) || !a.accounts.some((x) => x.id === id)) return "unknown account";
  a.accounts = a.accounts.filter((x) => x.id !== id);
  for (const t of Object.keys(a.default) as Tool[]) if (a.default[t] === id) delete a.default[t];
  save(a);
  if (deleteFolder) rmSync(accountDir(id), { recursive: true, force: true });
  return null;
}

export function setDefaultAccount(tool: unknown, id: string): string | null {
  const a = readAccounts();
  if (!isTool(tool)) return "unknown tool";
  if (id && !a.accounts.some((x) => x.id === id && x.tool === tool)) return "unknown account";
  if (id) a.default[tool] = id; else delete a.default[tool];
  save(a);
  return null;
}

// `wanted`: an id, "" for the normal login, undefined for the tool's default.
export type Resolved = { account?: Account; dir?: string; envVar?: string; error?: string };
export function resolveAccount(cmd: string, wanted?: string, win = process.platform === "win32"): Resolved {
  if (!isTool(cmd) || wanted === "") return {};
  const a = readAccounts(), id = wanted ?? a.default[cmd];
  if (!id) return {};
  const account = a.accounts.find((x) => x.id === id && x.tool === cmd);
  if (!account) return { error: "That account no longer exists. Pick another in Settings → AI Provider Accounts." };
  if (win) return { error: "Accounts aren't supported on Windows yet." };
  const dir = accountDir(id);
  if (!existsSync(dir)) return { error: `The folder for ${account.name} is missing.` };
  return { account, dir, envVar: ACCOUNT_VAR[cmd] };
}
