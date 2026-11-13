// Named logins for Claude, Codex and Gemini CLI. Each has its own folder, which the tool itself fills:
// kaizen stores no token. ~/.kaizen/accounts.json lists them. No accounts means every launch
// stays on the normal login. A chosen account that can't be used refuses the launch: falling
// back would run the work, and bill it, under another account.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Tool = "claude" | "codex" | "gemini";
export type Account = { id: string; tool: Tool; name: string };
export type Accounts = { accounts: Account[]; default: Partial<Record<Tool, string>> };

// Gemini CLI's GEMINI_CLI_HOME stands in for the home folder: it keeps its login in <that>/.gemini.
export const ACCOUNT_VAR: Record<Tool, string> = { claude: "CLAUDE_CONFIG_DIR", codex: "CODEX_HOME", gemini: "GEMINI_CLI_HOME" };
export const TOOL_NAME: Record<Tool, string> = { claude: "Claude", codex: "Codex", gemini: "Gemini" };
// Gemini CLI keeps its login in the system keychain under one fixed name ("gemini-cli-oauth" /
// "main-account"), whatever GEMINI_CLI_HOME says: an account signing in there would replace the
// normal login. Forced to file storage, it keeps each account's login in <folder>/.gemini instead.
export const ACCOUNT_EXTRA: Partial<Record<Tool, string[]>> = { gemini: ["GEMINI_FORCE_FILE_STORAGE=true"] };
// The tool's own folder for an account folder, or for the normal login (dir undefined).
const toolDir = (tool: Tool, dir?: string, home = homedir()) =>
  tool === "gemini" ? join(dir ?? home, ".gemini") : dir ?? join(home, tool === "claude" ? ".claude" : ".codex");
const root = () => process.env.KAIZEN_ACCOUNTS_HOME ?? join(homedir(), ".kaizen");
const file = () => join(root(), "accounts.json");
const validId = (id: string) => /^[a-z0-9]{8,32}$/.test(id);
export const accountDir = (id: string) => join(root(), "accounts", id);
const isTool = (t: unknown): t is Tool => t === "claude" || t === "codex" || t === "gemini";

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
export function linkKaizen(dir: string, tool: Tool, from = toolDir(tool)) {
  if (tool === "gemini") dir = join(dir, ".gemini");
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
  const base = TOOL_NAME[tool];
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
// Gemini: its file storage (gemini-credentials.json, encrypted) or the older oauth_creds.json.
export const signedIn = (dir: string, tool: Tool) =>
  tool === "gemini"
    ? ["gemini-credentials.json", "oauth_creds.json"].some((f) => existsSync(join(dir, ".gemini", f)))
    : existsSync(join(dir, tool === "claude" ? ".credentials.json" : "auth.json"));
// Whether the system keychain holds an entry, by its existence only: the lookup's output (the
// secret) goes to /dev/null and never reaches kaizen.
async function keychainHas(service: string, account: string, attr = "account"): Promise<boolean> {
  const argv = process.platform === "darwin"
    ? ["security", "find-generic-password", "-s", service, "-a", account]
    : process.platform === "linux" ? ["secret-tool", "lookup", "service", service, attr, account] : null;
  if (!argv || !Bun.which(argv[0]!)) return false;
  try {
    const p = Bun.spawn(argv, { stdin: "ignore", stdout: "ignore", stderr: "ignore", windowsHide: true, timeout: 3000 });
    return (await p.exited) === 0;
  } catch { return false; }
}
// Antigravity (agy) has no accounts here: only whether its own login is saved, which it keeps in the
// keychain through go-keyring (service "gemini", user "antigravity").
export const agyLogin = async (): Promise<Login> => ({ signedIn: await keychainHas("gemini", "antigravity", "username"), checked: "file" });
// Whether the system keychain holds Gemini CLI's normal login.
const geminiKeychain = () => keychainHas("gemini-cli-oauth", "main-account");

// Who is signed in, as the tool itself says: `claude auth status --json` / `codex login status`,
// pointed at an account folder (`dir`) or at the normal login. kaizen never opens the login
// files; without the CLI (or when it hangs past 5 s) it falls back to whether the file exists.
export type Login = { signedIn: boolean; who?: string; plan?: string; via?: string; checked: "cli" | "file" };
export async function loginStatus(tool: Tool, dir?: string, env: NodeJS.ProcessEnv = process.env, timeoutMs = 5000): Promise<Login> {
  const home = env.HOME || homedir();
  const fallback = (): Login => ({ signedIn: tool === "gemini" ? signedIn(dir ?? home, tool) : signedIn(dir ?? join(home, tool === "claude" ? ".claude" : ".codex"), tool), checked: "file" });
  // Gemini CLI has no status command: the login file's presence, and the address it lists in
  // google_accounts.json (no token there).
  if (tool === "gemini") {
    let who: string | undefined;
    try { const a = JSON.parse(readFileSync(join(toolDir(tool, dir, home), "google_accounts.json"), "utf8"))?.active; if (typeof a === "string" && a.trim()) who = a.trim().slice(0, 120); } catch { /* none */ }
    const f = fallback();
    // The normal login lives in the keychain (Gemini CLI 0.68); an account's, in its folder (forced file storage).
    return { ...f, signedIn: f.signedIn || (!dir && (await geminiKeychain())), who };
  }
  const bin = Bun.which(tool, { PATH: env.PATH ?? "" });
  if (!bin) return fallback();
  const e: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (typeof v === "string") e[k] = v;
  if (dir) e[ACCOUNT_VAR[tool]] = dir; else delete e[ACCOUNT_VAR[tool]];
  let p: ReturnType<typeof Bun.spawn> | null = null, timer: ReturnType<typeof setTimeout> | undefined;
  // Raced against the clock: a killed CLI's own children can keep its output open, so the
  // answer never waits on the pipes past the timeout.
  const late = new Promise<Login>((done) => { timer = setTimeout(() => { try { p?.kill(); } catch { /* gone */ } done(fallback()); }, timeoutMs); });
  const ask = (async (): Promise<Login> => {
    p = Bun.spawn(tool === "claude" ? [bin, "auth", "status", "--json"] : [bin, "login", "status"], { env: e, stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true });
    const [out, err] = await Promise.all([new Response(p.stdout as ReadableStream).text(), new Response(p.stderr as ReadableStream).text()]);
    await p.exited;
    return read(out, err);
  })().catch(fallback);
  try { return await Promise.race([ask, late]); } finally { clearTimeout(timer); }
  function read(out: string, err: string): Login {
    if (tool === "claude") {
      const j = JSON.parse(out);
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : undefined);
      return { signedIn: j?.loggedIn === true, who: str(j?.email), plan: str(j?.subscriptionType) ?? str(j?.planTier), via: str(j?.authMethod), checked: "cli" };
    }
    const txt = (out + "\n" + err).trim();
    const m = /^Logged in using (.+)$/im.exec(txt);
    // "an API key - sk-…": only the method, never a piece of the key.
    if (m) return { signedIn: true, via: m[1]!.split(" - ")[0]!.trim().slice(0, 60), checked: "cli" };
    if (/not logged in/i.test(txt)) return { signedIn: false, checked: "cli" };
    return fallback();
  }
}

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
export type Resolved = { account?: Account; dir?: string; envVar?: string; extra?: string[]; error?: string };
export function resolveAccount(cmd: string, wanted?: string, win = process.platform === "win32"): Resolved {
  if (!isTool(cmd) || wanted === "") return {};
  const a = readAccounts(), id = wanted ?? a.default[cmd];
  if (!id) return {};
  const account = a.accounts.find((x) => x.id === id && x.tool === cmd);
  if (!account) return { error: "That account no longer exists. Pick another in Settings → AI Accounts." };
  if (win) return { error: "Accounts aren't supported on Windows yet." };
  const dir = accountDir(id);
  if (!existsSync(dir)) return { error: `The folder for ${account.name} is missing.` };
  return { account, dir, envVar: ACCOUNT_VAR[cmd], extra: ACCOUNT_EXTRA[cmd] };
}
