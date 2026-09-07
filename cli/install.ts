#!/usr/bin/env bun
import {
  symlinkSync, mkdirSync, readdirSync, lstatSync, readlinkSync, unlinkSync,
  existsSync, copyFileSync, readFileSync, appendFileSync, rmSync, writeFileSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";

const home = homedir();
const REPO_URL = "https://github.com/hfadhlullah/kaizen.git";
const args = new Set(Bun.argv.slice(2));
const upgrade = args.has("upgrade") || args.has("--upgrade");
const wantSettings = args.has("settings") || args.has("config");
const check = args.has("--check");
const force = args.has("--force");
const verbose = args.has("--verbose");
const interactive = process.stdin.isTTY && !check && !upgrade && !args.has("--yes");

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
};

// Where each agent reads skills from. The skill folders follow the open Agent
// Skills standard, so every one of these can run the workflow; agents/ and
// commands/ are Claude Code's own formats and go nowhere else.
const AGENTS = [
  { name: "Claude Code", dir: ".claude", cmd: "claude", full: true,
    docs: "https://docs.claude.com/en/docs/claude-code" },
  { name: "Codex", dir: ".codex", cmd: "codex", full: false,
    docs: "https://github.com/openai/codex" },
  { name: "Antigravity", dir: ".agents", cmd: "agy", full: false,
    docs: "https://antigravity.google" },
  { name: "OpenCode", dir: ".opencode", cmd: "opencode", full: false,
    docs: "https://opencode.ai" },
  { name: "Cursor", dir: ".cursor", cmd: "cursor", full: false,
    docs: "https://cursor.com" },
  { name: "Gemini CLI", dir: ".gemini", cmd: "gemini", full: false,
    docs: "https://github.com/google-gemini/gemini-cli" },
];

// An agent counts as present if it has a directory or a command. The directory
// alone misses someone who installed the agent and has not run it yet; the command
// alone misses one that is not on this shell's PATH.
const onPath = new Set(
  AGENTS.filter((a) => Bun.which(a.cmd)).map((a) => a.dir),
);
const found = (r: string) =>
  AGENTS.filter((a) => existsSync(join(r, a.dir)) || onPath.has(a.dir));

// Nothing to install into. kaizen is a workflow an agent runs; on its own it does
// nothing, so send them to the agent first rather than laying out files no reader
// will ever load.
if (!found(home).length && !args.has("--force")) {
  await noAgent();
  process.exit(0);
}

async function noAgent() {
  console.log(`  ${c.bold("No AI coding agent found on this machine.")}\n`);
  console.log(`  ${c.dim("kaizen is a workflow that an agent runs — it plans, you approve, it builds,")}`);
  console.log(`  ${c.dim("and a second agent reviews. So an agent has to be installed first.")}\n`);

  if (!interactive) {
    for (const a of AGENTS) console.log(`    ${a.name.padEnd(14)} ${a.docs}`);
    console.log(`\n  ${c.dim("Install one, then run this again.")}`);
    return;
  }

  const pick = await select("Which one would you like to install?", [
    ...AGENTS.map((a) => ({ label: a.name, hint: a.docs, value: a as (typeof AGENTS)[number] | null })),
    { label: "None of these — just show me the list", hint: "", value: null },
  ]);

  if (!pick) {
    for (const a of AGENTS) console.log(`    ${a.name.padEnd(14)} ${a.docs}`);
    console.log(`\n  ${c.dim("Install one, then run this again.")}`);
    return;
  }

  console.log(`  ${c.bold(pick.name)}`);
  console.log(`  ${c.cyan(pick.docs)}\n`);
  const opened = await openUrl(pick.docs);
  console.log(opened
    ? `  ${c.dim("Opened in your browser. Install it, then run")} ${c.cyan("kaizen")} ${c.dim("again.")}`
    : `  ${c.dim("Open that page to install it, then run")} ${c.cyan("kaizen")} ${c.dim("again.")}`);
}

// Best effort: a headless box or a locked-down desktop has no opener, and the URL
// is printed either way.
async function openUrl(url: string) {
  const opener = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start" : "xdg-open";
  if (!Bun.which(opener)) return false;
  try { await Bun.$`${opener} ${url}`.quiet(); return true; } catch { return false; }
}

if (wantSettings) {
  const { settings } = await import("./settings.ts");
  await settings(await resolveRepoQuietly());
  process.exit(0);
}

// Bare `kaizen` on a machine where it is already installed is not an install --
// show what the project is doing instead, and offer the things you would have
// opened a terminal for.
if (interactive && !upgrade && Bun.argv.length === 2) {
  const repoDir = await resolveRepoQuietly();
  const here = found(home);
  const linked = here.length > 0 && here.every((a) =>
    ["kaizen", "kaizen-help"].every((n) => existsSync(join(home, a.dir, "skills", n))));
  if (linked) {
    const { dashboard } = await import("./dashboard.ts");
    await dashboard(repoDir, here.map((a) => a.name), async (action) => {
      if (action === "settings") {
        const { settings } = await import("./settings.ts");
        await settings(repoDir, false);
      } else if (action === "upgrade") {
        return await runUpgrade(repoDir);
      } else if (action === "init") {
        const out = await Bun.$`bun run ${join(repoDir, "cli/install.ts")} --yes`.text();
        return clean(out);
      }
    });
    process.exit(0);
  }
}

if (upgrade) await clearBunxCache();
if (!check && !upgrade) await welcome();

async function welcome() {
  const rgb = (r: number, g: number, b: number, s: string) =>
    `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;

  // Fuji: snow on the peak, deepening blue down the slope.
  const WORD = [
    "██╗  ██╗ █████╗ ██╗███████╗███████╗███╗   ██╗",
    "██║ ██╔╝██╔══██╗██║╚══███╔╝██╔════╝████╗  ██║",
    "█████╔╝ ███████║██║  ███╔╝ █████╗  ██╔██╗ ██║",
    "██╔═██╗ ██╔══██║██║ ███╔╝  ██╔══╝  ██║╚██╗██║",
    "██║  ██╗██║  ██║██║███████╗███████╗██║ ╚████║",
    "╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝  ╚═══╝",
  ];
  const W = 69, C = 34, SNOW = 3;
  // One constant slope, three columns per row, all the way down. The rows behind
  // the wordmark keep the same rate, so the edge that goes in above the letters
  // comes out below them on the same line -- vary it and the cone reads broken.
  const H = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];

  // Anything that would wrap is worse than the smaller thing that fits: the
  // mountain needs the full width, the wordmark needs 47, below that use words.
  const cols = process.stdout.columns || 80;
  const wide = cols >= W + 4;
  if (cols < 49) {
    console.log(`\n  ${c.bold("kaizen")}`);
  } else {

  const cell: string[][] = H.map(() => Array(W).fill(" "));
  const isWord: boolean[][] = H.map(() => Array(W).fill(false));

  if (wide) {
    for (const [i, h] of H.entries()) {
      const l = C - h, r = C + h;
      if (i < SNOW) {                       // solid cap
        cell[i]![l] = "▄"; cell[i]![r] = "▄";
        for (let x = l + 1; x < r; x++) cell[i]![x] = "█";
      } else {                              // slope, drawn as two edges
        // Below the wordmark's top row the letters own the middle, so draw an
        // edge only where all three of its characters clear them.
        const band = i >= H.length - WORD.length;
        const gap = Math.floor((W - 45) / 2) - 2;
        if (!band || l + 2 < gap) {
          cell[i]![l] = "▄"; cell[i]![l + 1] = "█"; cell[i]![l + 2] = "▀";
          cell[i]![r - 2] = "▀"; cell[i]![r - 1] = "█"; cell[i]![r] = "▄";
        }
      }
    }
  }

  const top = H.length - WORD.length, left = Math.floor((W - 45) / 2);
  for (let r = top; r < H.length; r++)      // air around the letters
    for (let x = left - 2; x < left + 47; x++) if (x >= 0 && x < W) cell[r]![x] = " ";
  for (const [r, line] of WORD.entries())
    for (const [x, ch] of [...line].entries())
      if (ch !== " ") { cell[top + r]![left + x] = ch; isWord[top + r]![left + x] = true; }

  console.log();
  for (const [i, row] of cell.entries()) {
    if (!wide && i < top) continue;          // no mountain to draw, no blank rows
    const slope = Math.max(0, i - SNOW) / (H.length - SNOW);
    const mountain: [number, number, number] = i < SNOW
      ? [255 - i * 8, 255 - i * 5, 255]
      : [Math.round(150 - slope * 105), Math.round(190 - slope * 110), Math.round(245 - slope * 80)];

    // With no mountain there is nothing to sit under, so drop its left margin.
    const off = wide ? 0 : left;
    const chars = row.slice(off), flags = isWord[i]!.slice(off);

    let out = "  ", run = "", runWord = flags[0]!;
    const flush = () => {
      if (!run) return;
      const t = (i - top) / (WORD.length - 1);
      const col: [number, number, number] = runWord
        ? [Math.round(214 - t * 150), Math.round(232 - t * 130), Math.round(255 - t * 45)]
        : mountain;
      out += rgb(col[0], col[1], col[2], run);
      run = "";
    };
    for (const [x, ch] of chars.entries()) {
      if (flags[x] !== runWord) { flush(); runWord = flags[x]!; }
      run += ch;
    }
    flush();
    console.log(out.replace(/\s+$/, ""));
  }
  if (wide) console.log("  " + rgb(38, 66, 130, "▀".repeat(W)));
  }

  console.log(`
  ${c.bold("改善")}  ${c.dim("kaizen — continuous improvement")}

  ${c.dim("A staged workflow for AI agents — code, writing, research, operations:")}
  ${c.dim("plan  ->  you approve  ->  build  ->  independent review  ->  bounded fix loop")}
`);

  if (interactive) await anyKey();
}

// A pause before anything touches the filesystem, and the place to back out.
async function anyKey() {
  const { stdin, stdout } = process;
  stdout.write(`  ${c.dim("press")} ${c.cyan("enter")} ${c.dim("to install, or")} ${c.cyan("ctrl-c")} ${c.dim("to leave")}`);
  stdin.setRawMode(true);
  stdin.resume();
  await new Promise<void>((resolve) => {
    const onData = (chunk: Buffer) => {
      if (chunk.toString().includes("\x03")) { stdout.write("\n\n  nothing installed\n"); process.exit(130); }
      stdin.off("data", onData);
      resolve();
    };
    stdin.on("data", onData);
  });
  stdin.setRawMode(false);
  stdin.pause();
  stdout.write("\r\x1b[2K");
}

const repo = await resolveRepo();
const root = await chooseRoot();
const targets = found(root);

// ---------------------------------------------------------------- repo

// Settings only needs the clone's default config, not a pull.
async function resolveRepoQuietly() {
  const here = dirname(import.meta.dir);
  if (existsSync(join(here, ".git"))) return here;
  return process.env.KAIZEN_HOME ?? join(home, "kaizen");
}

async function resolveRepo() {
  const here = dirname(import.meta.dir);
  if (existsSync(join(here, ".git"))) return here;

  const dest = process.env.KAIZEN_HOME ?? join(home, "kaizen");
  if (existsSync(join(dest, ".git"))) {
    // A pull can refuse for reasons that have nothing to do with linking -- local
    // edits, a detached head, no network. Linking the checkout already on disk
    // still works, so say what happened and carry on.
    try {
      await Bun.$`git -C ${dest} pull --ff-only`.quiet();
      step(`updated ${tilde(dest)}`);
    } catch {
      step(`kept ${tilde(dest)} ${c.dim("(could not pull)")}`);
    }
    return dest;
  }
  step(`cloning into ${tilde(dest)}`);
  await Bun.$`git clone --quiet ${REPO_URL} ${dest}`;
  return dest;
}

async function chooseRoot() {
  if (args.has("--project")) return process.cwd();
  if (args.has("--global") || !interactive) return home;
  // A project install only means something in a project. Standing in the home
  // directory it is the global install under another name; any other folder is
  // a project worth installing into, git repository or not.
  const cwd = process.cwd();
  if (cwd === home) return home;

  const names = (r: string) => found(r).map((a) => a.name).join(", ");
  return select("Install kaizen for", [
    { label: "Globally", hint: `every project \u2014 ${names(home)}`, value: home },
    { label: "This project only", hint: `${basename(cwd)}/ \u2014 ${names(cwd)}`, value: cwd },
  ]);
}

// ---------------------------------------------------------------- linking

function dirEntries(sub: string) {
  return readdirSync(join(repo, sub))
    .filter((f) => f.startsWith("kaizen-") && f.endsWith(".md"))
    .map((f) => join(repo, sub, f));
}

const links = targets.flatMap((a) => [
  ...["kaizen", "kaizen-help"].map((n) => [join(repo, "skills", n), join(a.dir, "skills")] as const),
  ...(a.full ? [
    ...dirEntries("agents").map((f) => [f, join(a.dir, "agents")] as const),
    ...dirEntries("commands").map((f) => [f, join(a.dir, "commands")] as const),
  ] : []),
]);

function linkState(src: string, dest: string) {
  try {
    const st = lstatSync(dest);
    if (!st.isSymbolicLink()) return "occupied";
    return readlinkSync(dest) === src ? "linked" : "stale";
  } catch {
    return "missing";
  }
}

let blocked = 0, wrote = 0, already = 0;
for (const [src, sub] of links) {
  const dir = join(root, sub);
  const dest = join(dir, basename(src));
  const state = linkState(src, dest);
  const name = `${sub}/${basename(src)}`;

  if (check) {
    if (state !== "linked") blocked++;
    console.log(`${state === "linked" ? "ok  " : "MISS"} ${name}${state === "linked" ? "" : ` (${state})`}`);
    continue;
  }
  if (state === "linked") { already++; if (verbose) console.log(c.dim(`  ok    ${name}`)); continue; }
  if (state === "occupied" && !force) {
    console.log(`  ${c.bold("skip")}  ${name} — real file present, use --force`);
    blocked++;
    continue;
  }
  mkdirSync(dir, { recursive: true });
  if (state !== "missing") unlinkSync(dest);
  symlinkSync(src, dest);
  wrote++;
  if (verbose) console.log(c.dim(`  link  ${name}`));
}

if (check) {
  console.log(blocked ? `\n${blocked} link(s) missing — run: bunx kaizen-agent` : "\nall linked");
  process.exit(blocked ? 1 : 0);
}

const into = targets.map((a) => a.name).join(", ");
step(
  wrote && already ? `linked ${wrote} new, ${already} already in place — ${into}`
  : wrote ? `linked ${wrote} files into ${into}`
  : `already installed for ${into} ${c.dim("(nothing to change)")}`,
);
if (targets.length === 1) {
  console.log(`    ${c.dim("Codex, Antigravity, OpenCode, Cursor and Gemini CLI get it too,")}`);
  console.log(`    ${c.dim("if their directory exists when you install.")}`);
}

// ---------------------------------------------------------------- repo setup

if (!args.has("--project")) installLauncher();

// bunx runs from a temp copy and leaves nothing behind, so there is no `kaizen` to
// type afterwards. A launcher pointed at the clone gives one, and keeps working
// after the clone updates.
function installLauncher() {
  const binDir = join(home, ".local", "bin");
  const bin = join(binDir, "kaizen");
  const script = `#!/bin/sh\n# kaizen launcher -- installed by kaizen-agent\nexec bun run ${join(repo, "cli/install.ts")} "$@"\n`;
  try {
    if (existsSync(bin) && readFileSync(bin, "utf8") === script) return;
    mkdirSync(binDir, { recursive: true });
    writeFileSync(bin, script, { mode: 0o755 });
    const onPath = (process.env.PATH ?? "").split(":").includes(binDir);
    step(onPath
      ? `${c.cyan("kaizen upgrade")} is now on your PATH`
      : `wrote ${tilde(bin)} ${c.dim("— add ~/.local/bin to PATH to use it")}`);
  } catch {
    /* a read-only home is not worth failing the install over */
  }
}

const inProject = process.cwd() !== home;
const kaizenDir = join(process.cwd(), ".kaizen");

// A .kaizen/ in a parent already owns this folder's state, and setting up a child
// would shadow it, hiding the parent's runs and leaving the child out of the root
// .gitignore. Deliberately not shared with cli/dashboard.ts locate(): that one
// resolves which state directory to read and so falls back to a global ~/.kaizen,
// while this one decides whether a folder is already owned and must stop *before*
// $HOME — a global ~/.kaizen would otherwise suppress the setup offer for every
// non-repo folder under the home directory. Do not re-sync the two walks.
function kaizenAbove() {
  let dir = process.cwd();
  for (;;) {
    if (dir === home) return false;
    if (existsSync(join(dir, ".kaizen"))) return true;
    if (existsSync(join(dir, ".git"))) return false;
    const up = dirname(dir);
    if (up === dir) return false;
    dir = up;
  }
}

if (inProject && !kaizenAbove()) {
  const now = interactive
    ? await select(`Set up ${basename(process.cwd())}/ for kaizen now`, [
        // "Not now" leads: the offer now appears in any folder outside home, so the
        // safe answer is the one under the cursor.
        { label: "Not now", hint: "the first /kaizen run will do it", value: false },
        { label: "Yes", hint: "writes .kaizen/ and a CLAUDE.md line so it runs by default", value: true },
      ])
    : false;
  if (now) initProject();
} else if (existsSync(kaizenDir)) {
  step(`${basename(process.cwd())}/.kaizen already set up`);
}

function initProject() {
  mkdirSync(kaizenDir, { recursive: true });
  for (const f of readdirSync(join(repo, "skills/kaizen")).filter((f) => f.startsWith("spec"))) {
    copyFileSync(join(repo, "skills/kaizen", f), join(kaizenDir, f));
  }
  copyFileSync(join(repo, "skills/kaizen/config.default.yml"), join(kaizenDir, "config.yml"));

  // Run state is local; the workflow itself is shared, so those files stay tracked.
  // Nothing to ignore where there is no git, so a plain folder gets no .gitignore.
  let ignored = false;
  if (existsSync(join(process.cwd(), ".git"))) {
    const rules = ".kaizen/*\n!.kaizen/spec*.md\n!.kaizen/config.yml\n";
    const gi = join(process.cwd(), ".gitignore");
    const current = existsSync(gi) ? readFileSync(gi, "utf8") : "";
    if (!current.includes(".kaizen/*")) {
      appendFileSync(gi, (current && !current.endsWith("\n") ? "\n" : "") + "\n# kaizen run state\n" + rules);
      ignored = true;
    }
  }
  step(ignored ? "wrote .kaizen/ and the gitignore entry" : "wrote .kaizen/");
  writePointer();
}

// Claude Code loads a skill by matching its description, so an ordinary request
// ("add a discount cap") does not reach kaizen unless the project says it should.
// One line in the agent instructions is what makes it the default here.
function writePointer() {
  const block = `\n## Kaizen workflow\n\nNon-trivial work in this repository follows the staged workflow in\n\`.kaizen/spec.md\`: plan, human approval, build, independent review, bounded fix\nloop. Invoke the \`kaizen\` skill for it — do not carry the stages out inline.\n\nNon-trivial means work worth a plan: a change across more than one file, anything\nwith a migration or a rollback, or a document someone else will act on. Answering a\nquestion, reading code, or a one-line fix is not, and should not start a run.\n\nRun state lives in \`.kaizen/runs/<id>/\`. Read \`state.json\` first and continue from\nthe stage it names; never advance a run whose \`awaiting\` field is non-null without a\nrecorded human decision.\n`;

  for (const name of ["CLAUDE.md", "AGENTS.md"]) {
    const f = join(process.cwd(), name);
    const current = existsSync(f) ? readFileSync(f, "utf8") : "";
    if (current.includes("## Kaizen workflow")) continue;
    if (!current && name === "AGENTS.md") continue;   // do not create one that was never there
    const text = current ? (current.endsWith("\n") ? "" : "\n") + block : block.slice(1);
    appendFileSync(f, text);
    step(`${existsSync(f) && current ? "added to" : "wrote"} ${name} ${c.dim("— kaizen now runs without being asked for")}`);
  }
}

// ---------------------------------------------------------------- done

if (upgrade) {
  let version = "";
  try { version = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).version; } catch {}
  console.log(`
  ${c.bold("Up to date")}${version ? c.dim(`  —  kaizen ${version}`) : ""}
  ${c.dim("Restart Claude Code to pick up any new slash commands.")}
`);
} else {
  console.log(`
  ${c.bold("Next")}
    1  restart Claude Code ${c.dim("— skills load live, slash commands only at session start")}
    2  ${c.cyan("/kaizen <what you want done>")} ${c.dim("in any project — it sets itself up on first run")}

  ${c.dim("/kaizen-help lists every command.  kaizen upgrade updates all of this.")}
`);
}
if (blocked) process.exit(1);

// ---------------------------------------------------------------- helpers

function step(msg: string) { console.log(`  ${c.green("+")} ${msg}`); }

// Runs the upgrade and reports what it actually did, version to version, so the
// dashboard can show a result rather than the user wondering whether it worked.
async function runUpgrade(repoDir: string) {
  const before = versionOf(repoDir);
  const out = await Bun.$`bun run ${join(repoDir, "cli/install.ts")} upgrade`.text().catch(() => "");
  const after = versionOf(repoDir);
  const latest = await npmLatest();

  const lines = [
    before === after
      ? `${c.bold("Already up to date")}  ${c.dim(after)}`
      : `${c.bold("Upgraded")}  ${c.dim(before)} → ${c.green(after)}`,
    "",
    // Only the step lines: the captured run's own heading and restart notice
    // repeat what this panel already says above them.
    ...clean(out)
      .filter((l) => l.trim().startsWith("+") || l.trim().startsWith("skip"))
      .map((l) => c.dim(l.trim())),
  ];
  if (latest && latest !== after) {
    lines.push("", c.dim(`npm publishes ${latest}; this install follows the git clone.`));
  }
  lines.push("", c.dim("Restart your agent to pick up new slash commands."));
  return lines;
}

function versionOf(dir: string) {
  try { return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version as string; }
  catch { return "?"; }
}

async function npmLatest() {
  try {
    const r = await fetch("https://registry.npmjs.org/kaizen-agent/latest", {
      signal: AbortSignal.timeout(4000),
    });
    return ((await r.json()) as { version?: string }).version ?? null;
  } catch { return null; }        // offline is not an upgrade failure
}

// Captured output still carries its own colour codes, which stop any test on the
// text from matching and would nest inside this panel's own styling.
function clean(out: string) {
  return out.split("\n").map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r$/, "").trimEnd());
}

// bunx keeps an extracted copy per package under the temp directory and reuses it
// without re-resolving, so an upgrade that only pulls the clone still leaves the
// next `bunx kaizen-agent` running whatever was cached the first time.
async function clearBunxCache() {
  const tmp = process.env.TMPDIR ?? "/tmp";
  let removed = 0;
  try {
    for (const name of readdirSync(tmp)) {
      if (/^bunx-.*kaizen-agent/.test(name)) {
        rmSync(join(tmp, name), { recursive: true, force: true });
        removed++;
      }
    }
  } catch { /* an unreadable temp directory is not worth failing an upgrade over */ }
  step(removed ? `cleared ${removed} cached copy of the installer` : "no installer cache to clear");
}
function tilde(p: string) { return p.startsWith(home) ? "~" + p.slice(home.length) : p; }

// Arrow-key picker. Raw mode delivers keys unbuffered; the alternative is a
// dependency for two options and forty lines of escape codes.
async function select<T>(question: string, options: { label: string; hint: string; value: T }[]) {
  const { stdin, stdout } = process;
  let active = 0;

  const draw = (first: boolean) => {
    if (!first) stdout.write(`\x1b[${options.length}A`);
    for (const [i, o] of options.entries()) {
      const on = i === active;
      stdout.write(
        `\x1b[2K    ${on ? c.cyan(">") : " "} ${on ? c.bold(o.label) : c.dim(o.label)}` +
          `  ${c.dim(o.hint)}\n`,
      );
    }
  };

  stdout.write(`\n  ${c.bold(question)}  ${c.dim("(arrows, enter)")}\n`);
  stdout.write("\x1b[?25l");
  draw(true);
  stdin.setRawMode(true);
  stdin.resume();

  // Read via events rather than `for await`: breaking out of an async iterator
  // destroys stdin, and a second prompt would then have no stream to read.
  await new Promise<void>((resolve) => {
    const onData = (chunk: Buffer) => {
      // A chunk can hold more than one keypress -- an arrow and the enter behind
      // it arrive together when input is piped -- so walk it rather than
      // comparing the whole thing to one key.
      const keys = chunk.toString();
      for (let i = 0; i < keys.length; i++) {
        const rest = keys.slice(i);
        if (rest.startsWith("\x03")) { stdout.write("\ncancelled\n"); process.exit(130); }
        if (rest.startsWith("\r") || rest.startsWith("\n")) {
          stdin.off("data", onData);
          return resolve();
        }
        if (rest.startsWith("\x1b[A") || rest.startsWith("\x1b[B")) {
          active = rest[2] === "A"
            ? (active - 1 + options.length) % options.length
            : (active + 1) % options.length;
          i += 2;
        } else if (rest.startsWith("k")) active = (active - 1 + options.length) % options.length;
        else if (rest.startsWith("j")) active = (active + 1) % options.length;
        else continue;
        draw(false);
      }
    };
    stdin.on("data", onData);
  });

  stdin.setRawMode(false);
  stdin.pause();
  stdout.write("\x1b[?25h");
  return options[active]!.value;
}
