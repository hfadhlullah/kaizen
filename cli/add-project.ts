// What the board's "Add a project" sheet lets a web page ask for: clone a repository,
// create a folder, branch off a base. Everything here is a pure check or an argv call,
// so each refusal can be tested without a board. No shell string anywhere.
import { appendFileSync, existsSync, lstatSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, join, parse, resolve, sep } from "node:path";
import { canonPath, nativePath } from "./state.ts";
import { run, type Run } from "./worktree.ts";

// Windows' rules on every platform, so a project made here also opens there: no
// reserved device names (CON, NUL, COM1…), no trailing dot or space.
export const winBad = (n: string) => !n || n === "." || n === ".." || /[\\/:*?"<>|\x00-\x1f]/.test(n) || /[. ]$/.test(n)
  || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(n);

const HOST = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const REPO_PATH = /^[\w.\-~+%@/]+$/;

/**
 * A git URL the board will clone: https:// or ssh:// or user@host:path, one token, no
 * option-like start, no credentials in an https URL. Refuses ext::, file:, git://, http://
 * and local paths. `name` is the repository's folder name.
 */
export function gitUrl(raw: unknown): { url: string; name: string } | { error: string } {
  const s = typeof raw === "string" ? raw.trim() : "";
  const no = (why = "use an https:// or ssh git URL, e.g. https://github.com/owner/repo.git") => ({ error: why });
  if (!s) return no("paste a git URL");
  if (s.length > 500 || s.startsWith("-") || /[\s\x00-\x1f\x7f]/.test(s)) return no();
  let host = "", path = "";
  const u = s.match(/^(https|ssh):\/\/(?:([\w][\w.-]*)@)?([^/:@]+)(?::\d{1,5})?\/(.+)$/i);
  const scp = s.match(/^\w[\w.-]*@([^/:@]+):(?!\/)(.+)$/);
  if (u) {
    if (u[1]!.toLowerCase() === "https" && u[2]) return no("leave credentials out of the URL");
    [host, path] = [u[3]!, u[4]!];
  } else if (scp) [host, path] = [scp[1]!, scp[2]!];
  else return no();
  if (!HOST.test(host) || !REPO_PATH.test(path) || path.split("/").includes("..")) return no();
  const name = path.replace(/\/+$/, "").split("/").pop()!.replace(/\.git$/i, "");
  return winBad(name) ? no("that URL does not name a repository") : { url: s, name };
}

/**
 * A folder the board may create or register, from what the page typed (~ allowed,
 * relative to home). Refuses the root, home itself, anything inside ~/.kaizen or a .git
 * or .kaizen folder, a `..` in the text, a name Windows cannot hold, and a place below an
 * existing project: a second .kaizen there would shadow the first one's runs. An existing
 * symlink at the folder is refused and an existing folder is canonicalised first, so a link
 * cannot smuggle a write into a project. Outside home only under `projects` (the Projects
 * folder setting): the board never writes to /usr/local or another user's directory.
 */
export function destDir(raw: unknown, home: string, known: string[] = [], projects = ""): { dir: string } | { error: string } {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t || t.length > 1000 || t.includes("\0")) return { error: "name a folder" };
  if (t.split(/[\\/]/).includes("..")) return { error: "a folder path cannot contain .." };
  const p = resolve(home, nativePath(t.startsWith("~") ? home + t.slice(1) : t));
  try { if (lstatSync(p).isSymbolicLink()) return { error: "that folder is a symbolic link; name the real folder" }; } catch { /* absent */ }
  const dir = existsSync(p) ? canonPath(p) : join(canonPath(dirname(p)), basename(p)), h = canonPath(home);
  if (parse(dir).root === dir || dir === h) return { error: "choose a folder of its own, not the root or your home" };
  const parts = dir.toLowerCase().split(/[\\/]/), kz = join(h, ".kaizen").toLowerCase(), low = dir.toLowerCase();
  if (low === kz || low.startsWith(kz + sep) || parts.includes(".git") || parts.includes(".kaizen")) return { error: "that folder is kaizen's or git's own" };
  if (winBad(basename(dir))) return { error: `${basename(dir)} cannot be a folder name on Windows` };
  const under = (r: string) => !!r && (dir === canonPath(r) || dir.startsWith(canonPath(r) + sep));
  if (!under(h) && !under(projects)) return { error: "choose a folder inside your home, or set Settings → Projects folder (board.projects_dir) to allow another place" };
  for (let a = dirname(dir); ; a = dirname(a)) {
    if (known.includes(a) || (a !== h && existsSync(join(a, ".kaizen")))) return { error: `that folder is inside the project ${a}` };
    if (dirname(a) === a) break;
  }
  return { dir };
}

export type Spawned = { stderr: unknown; exited: Promise<number>; kill: () => void; pid?: number };
type Spawn = (cmd: string[], o: Record<string, unknown>) => Spawned;
const spawn: Spawn = (cmd, o) => Bun.spawn(cmd, o as any) as unknown as Spawned;

/** Bytes in <d>/.git/objects/pack (incl. git's incoming tmp_pack files): a few stats, no tree walk. */
export function dirSize(d: string): number {
  const p = join(d, ".git", "objects", "pack");
  let n = 0;
  try { for (const e of readdirSync(p)) try { n += lstatSync(join(p, e)).size; } catch { /* gone */ } } catch { /* not there yet */ }
  return n;
}

/**
 * `git clone -- url to`, argv only. GIT_ALLOW_PROTOCOL keeps a redirect or submodule from
 * reaching ext:: or file:; never prompts; gives up after `ms` or once the folder passes
 * `cap` bytes (checked every `tick` ms). git runs in its own process group so the kill
 * reaches its ssh or remote-helper child too. A folder this call made is removed when the
 * clone fails. `url` and `to` are already checked by gitUrl and destDir.
 * The rest of the arguments are for tests.
 */
export async function cloneInto(url: string, to: string, sp: Spawn = spawn, protocols = "https:ssh", ms = 300_000, cap = 2 * 1024 ** 3, tick = 2000, size = dirSize): Promise<{ ok: true } | { ok: false; why: string }> {
  const existed = existsSync(to);
  const p = sp(["git", "clone", "--", url, to], {
    stdin: "ignore", stdout: "ignore", stderr: "pipe", windowsHide: true, detached: process.platform !== "win32",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: protocols, GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes" },
  });
  let stopped = "";
  const stop = (why: string) => {
    stopped ||= why;
    try { if (p.pid && process.platform !== "win32") process.kill(-p.pid, "SIGKILL"); else p.kill(); } catch { p.kill(); }
  };
  const timer = setTimeout(() => stop("git clone timed out"), ms);
  const watch = setInterval(() => { if (size(to) > cap) stop(`the repository is larger than ${Math.round(cap / 1024 ** 2)} MB`); }, tick);
  let code = 1, err = "";
  try { [err, code] = await Promise.all([new Response(p.stderr as any).text(), p.exited]); }
  catch (e) { err = (e as Error).message; }
  clearTimeout(timer); clearInterval(watch);
  if (code === 0 && !stopped) return { ok: true };
  if (!existed) rmSync(to, { recursive: true, force: true });
  return { ok: false, why: stopped || err.trim().split("\n").filter(Boolean).pop() || "git clone failed" };
}

/** The .gitignore rules for a project's .kaizen/ (run state local, workflow files tracked), once. True when written. */
export function ignoreKaizen(dir: string): boolean {
  const rules = ".kaizen/*\n!.kaizen/spec*.md\n!.kaizen/config.yml\n!.kaizen/notes/\n.kaizen/notes/*\n!.kaizen/notes/Project/\n";
  const gi = join(dir, ".gitignore");
  const current = existsSync(gi) ? readFileSync(gi, "utf8") : "";
  if (current.includes(".kaizen/*")) return false;
  appendFileSync(gi, (current && !current.endsWith("\n") ? "\n" : "") + "\n# kaizen run state\n" + rules);
  return true;
}

export type Branches = { current: string; def: string; branches: string[] };
/** Local and origin branches of a project, its current one and the one a new workspace starts from. */
export function branchesOf(project: string, sh: Run = run): Branches {
  const g = (...a: string[]) => sh(["git", ...a], project);
  if (!g("rev-parse", "--is-inside-work-tree").ok) return { current: "", def: "", branches: [] };
  const branches = g("for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes/origin").out.split("\n")
    .filter((b) => b && b !== "origin" && b !== "origin/HEAD");
  const current = g("symbolic-ref", "--short", "HEAD").out;
  const head = g("symbolic-ref", "--short", "refs/remotes/origin/HEAD").out;
  const def = [head, "main", "master", current].find((b) => b && branches.includes(b)) ?? current;
  return { current, def, branches };
}
