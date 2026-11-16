// What the board's "Add a project" sheet lets a web page ask for: clone a repository,
// create a folder, branch off a base. Everything here is a pure check or an argv call,
// so each refusal can be tested without a board. No shell string anywhere.
import { appendFileSync, existsSync, lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, basename, dirname, join, parse, resolve, sep } from "node:path";
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
  // A relative name is under home: nativePath alone would resolve it against the working folder.
  const full = t.startsWith("~") ? home + t.slice(1) : t;
  const p = resolve(home, isAbsolute(full) || /^\/[a-zA-Z](\/|$)/.test(full) ? nativePath(full) : full);
  try { if (lstatSync(p).isSymbolicLink()) return { error: "that folder is a symbolic link; name the real folder" }; } catch { /* absent */ }
  const dir = existsSync(p) ? canonPath(p) : join(canonPath(dirname(p)), basename(p)), h = canonPath(home);
  if (parse(dir).root === dir || dir === h) return { error: "choose a folder of its own, not the root or your home" };
  const parts = dir.toLowerCase().split(/[\\/]/), kz = join(h, ".kaizen").toLowerCase(), low = dir.toLowerCase();
  if (low === kz || low.startsWith(kz + sep) || parts.includes(".git") || parts.includes(".kaizen")) return { error: "that folder is kaizen's or git's own" };
  if (winBad(basename(dir))) return { error: `${basename(dir)} cannot be a folder name on Windows` };
  const under = (r: string) => !!r && (dir === canonPath(r) || dir.startsWith(canonPath(r) + sep));
  if (!under(h) && !under(projects)) return { error: "choose a folder inside your home, or set Settings → General → Folders → Projects folder (board.projects_dir) to allow another place" };
  const proj = projects ? canonPath(projects) : "";
  for (let a = dirname(dir); ; a = dirname(a)) {
    if (known.includes(a)) return { error: `that folder is inside the project ${a}` };
    if (a === h || (proj && a === proj)) break;
    if (existsSync(join(a, ".kaizen"))) return { error: `that folder is inside the project ${a}` };
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

/** The rule agents follow when a plain message fits a kaizen skill: offer it, start it on a yes. One copy, used by the project note and Home Chat. */
export const OFFER = `When what the person asks is what one of the kaizen skills does, and they did not name the skill, offer it before doing anything: say in one line which skill fits and what it does, then ask. Start it only on a yes; on a no, do the work directly. Never offer for a question about how something works, an explanation, reading code or a one-line fix. When they name a skill (\`/kaizen-explore\`, "use kaizen video"), start it.

- build, add or change something that is not small: \`kaizen\` (plan, you approve, build, independent review)
- research, or a decision between options ("should we use X or Y", "which is better", "is it worth it", "before we build"), or an idea they are unsure about: \`kaizen-explore\`
- design options, mockups or variations before a build: \`kaizen-concept\`
- a video, promo or explainer, or editing footage: \`kaizen-video\`
- a pitch deck: \`kaizen-deck\`; a book, ebook or manuscript: \`kaizen-book\`; a browser game: \`kaizen-game\`
- keep something for later (a link, an idea, a client request): the icebox, \`kaizen icebox add --file <path>\``;

/** Every earlier wording of the skills paragraph that kaizen shipped, trimmed. When `OFFER` changes, add its old text here so projects get the new one. */
const PREVIOUS = [
  "When a request is what one of the kaizen skills does, invoke that skill first instead\nof doing the work inline: `kaizen-concept` for concepts, mockups or design options\nbefore a build; `kaizen-explore` to question an idea before planning; `kaizen-deck`,\n`kaizen-video`, `kaizen-book` and `kaizen-game` for a pitch deck, a video, a book or\na game. The skill holds the steps and the quality bar the work needs.",
];

// The "Kaizen workflow" section of CLAUDE.md and AGENTS.md. Claude Code loads a skill by matching its description, so an
// ordinary request ("add a discount cap") does not reach kaizen unless the project says what to offer.
const block = () => `\n## Kaizen workflow\n\nNon-trivial work in this repository follows the staged workflow in\n\`.kaizen/spec.md\`: plan, human approval, build, independent review, bounded fix\nloop. When the person agrees to a run, invoke the \`kaizen\` skill for it — do not\ncarry the stages out inline.\n\n${OFFER}\n\nA run costs several times what the same change costs in one session, so spend it\nwhere being wrong is expensive: money, data loss, a migration or anything else hard\nto undo, work a customer sees, or a part of the system nobody has read in a year.\n\nWork where being wrong is cheap and obvious does not start a run. Answering a\nquestion, reading code, a one-line fix, a rename the compiler checks — do those\ndirectly. When it is genuinely unclear, ask rather than assuming the expensive path.\n\nBefore non-trivial work, run \`kaizen recall --track <track> --query "<topic>"\` and\ntreat what it returns as past experience from other projects to verify, not as rules.\n\nAfter you change something a person can look at (a page, an app screen, a UI), show it\nbefore saying done: start the app\'s dev server if it is not running, then run\n\`kaizen preview <localhost url>\` (or \`kaizen preview <screenshot.png>\` for a static result).\nA page opens in the kaizen board\'s Browser tab and a screenshot in its Preview tab, never a new browser window.\n\nWhen the person asks for a file on their phone (or another device), send it with\n\`kaizen send <file>...\` (\`--to <device name | address>\` for a device other than their\ndefault). It goes through LocalSend; they tap Accept on the device.\n\nWhen the person asks for a file on their WhatsApp, send it with\n\`kaizen send --whatsapp <file>...\` (\`--to <chat name>\`, \`--text \"<caption>\"\`); with no\n\`--to\` it goes to their own message-yourself chat. Use it instead of LocalSend or any\nother route. If it says WhatsApp is not linked, tell them to link it in the board:\nSettings → Phone → WhatsApp Bridge.\n\nRun state lives in \`.kaizen/runs/<id>/\`. Read \`state.json\` first and continue from\nthe stage it names; never advance a run whose \`awaiting\` field is non-null without a\nrecorded human decision.\n`;

/**
 * Writes the note into `dir`'s CLAUDE.md, and AGENTS.md where an agent that reads it (Codex and the others) is installed
 * or the file exists. Only the "## Kaizen workflow" section is added or brought up to date; the rest of a file is never touched.
 * `create: false` only brings an existing section up to date (a folder that was set up before), never adds one.
 * Returns what it did, one line each.
 */
export function writePointer(dir: string, agents: string[] = [], create = true): string[] {
  const done: string[] = [];
  const b = block();
  for (const name of ["CLAUDE.md", "AGENTS.md"]) {
    const f = join(dir, name);
    const current = existsSync(f) ? readFileSync(f, "utf8") : "";
    if (current.includes("## Kaizen workflow")) {
      // Projects set up before a paragraph existed get it on the next init; the old skills-first line is replaced by the offer rule.
      for (const [label, marker, from, to] of [
        ["preview", "kaizen preview", "After you change something", "Run state lives"],
        ["send", "kaizen send", "When the person asks for a file", "Run state lives"],
        ["WhatsApp send", "kaizen send --whatsapp", "When the person asks for a file on their WhatsApp", "Run state lives"],
      ]) {
        const now = readFileSync(f, "utf8");
        if (now.includes(marker) || !now.includes("\nRun state lives in")) continue;
        writeFileSync(f, now.replace("\nRun state lives in", "\n" + b.slice(b.indexOf(from), b.indexOf(to)) + "Run state lives in"));
        done.push(`added the ${label} line to ${name}`);
      }
      // The skills paragraph sits between the workflow line and "A run costs": the old skills line (or an earlier wording of the
      // rule, PREVIOUS) becomes the current rule; a paragraph the person wrote or edited is theirs and stays; none at all is added.
      const now = readFileSync(f, "utf8");
      const end = now.indexOf("A run costs several"), anchor = now.indexOf("the stages out inline.\n\n");
      const from = anchor >= 0 ? anchor + "the stages out inline.\n\n".length : -1;
      const region = from >= 0 && end > from ? now.slice(from, end).trim() : null;
      if (region === null) { if (end >= 0) { writeFileSync(f, now.slice(0, end) + OFFER + "\n\n" + now.slice(end)); done.push(`added the offer rule to ${name}`); } }
      else if (!region) { writeFileSync(f, now.slice(0, from) + OFFER + "\n\n" + now.slice(end)); done.push(`added the offer rule to ${name}`); }
      else if (PREVIOUS.includes(region)) { writeFileSync(f, now.slice(0, from) + OFFER + "\n\n" + now.slice(end)); done.push(`updated the skills rule in ${name}`); }
      continue;
    }
    if (!create) continue;
    // AGENTS.md is for agents other than Claude Code: not made for a Claude-only user, never emptied or rewritten.
    if (!current && name === "AGENTS.md" && !agents.some((a) => a !== "claude")) continue;
    appendFileSync(f, current ? (current.endsWith("\n") ? "" : "\n") + b : b.slice(1));
    done.push(`${current ? "added to" : "wrote"} ${name} — kaizen now offers its skills when you ask for something`);
  }
  return done;
}
