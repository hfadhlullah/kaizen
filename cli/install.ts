#!/usr/bin/env bun
import {
  symlinkSync, mkdirSync, readdirSync, lstatSync, readlinkSync, unlinkSync,
  existsSync, copyFileSync, readFileSync, appendFileSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";

const home = homedir();
const REPO_URL = "https://github.com/hfadhlullah/kaizen.git";
const args = new Set(Bun.argv.slice(2));
const check = args.has("--check");
const force = args.has("--force");
const verbose = args.has("--verbose");
const interactive = process.stdin.isTTY && !check && !args.has("--yes");

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
};

if (!check) await welcome();

async function welcome() {
  const rgb = (r: number, g: number, b: number, s: string) =>
    `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;

  // Fuji: snow on the peak, deepening blue down the slope.
  const peak = ["▄█▄", "▄█████▄", "▄█▀▀▀▀▀▀▀█▄"];
  const slope = [
    "▄█▀         ▀█▄",
    "▄█▀             ▀█▄",
    "▄█▀                 ▀█▄",
    "▄█▀                     ▀█▄",
    "▄█▀                         ▀█▄",
    "▄█▀                             ▀█▄",
  ];
  const WIDTH = 45; // the wordmark's width; everything centers on it
  const mid = (line: string) => " ".repeat(Math.max(0, Math.round((WIDTH - line.length) / 2))) + line;

  console.log();
  for (const [i, line] of peak.entries()) {
    const t = i / peak.length;                       // snow, barely tinted
    console.log("  " + rgb(255 - Math.round(t * 18), 255 - Math.round(t * 10), 255, mid(line)));
  }
  for (const [i, line] of slope.entries()) {
    const t = (i + 1) / slope.length;                // slope into deep water blue
    console.log("  " + rgb(
      Math.round(150 - t * 105), Math.round(190 - t * 110), Math.round(245 - t * 80), mid(line)));
  }

  const word = [
    "██╗  ██╗ █████╗ ██╗███████╗███████╗███╗   ██╗",
    "██║ ██╔╝██╔══██╗██║╚══███╔╝██╔════╝████╗  ██║",
    "█████╔╝ ███████║██║  ███╔╝ █████╗  ██╔██╗ ██║",
    "██╔═██╗ ██╔══██║██║ ███╔╝  ██╔══╝  ██║╚██╗██║",
    "██║  ██╗██║  ██║██║███████╗███████╗██║ ╚████║",
    "╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝  ╚═══╝",
  ];
  console.log();
  for (const [i, line] of word.entries()) {
    const t = i / (word.length - 1);
    console.log("  " + rgb(
      Math.round(214 - t * 150), Math.round(232 - t * 130), Math.round(255 - t * 45), line));
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
const base = join(root, ".claude");

// ---------------------------------------------------------------- repo

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
  return select("Install kaizen for", [
    { label: "Every project", hint: tilde(join(home, ".claude")), value: home },
    { label: "This project only", hint: join(".claude"), value: process.cwd() },
  ]);
}

// ---------------------------------------------------------------- linking

function dirEntries(sub: string) {
  return readdirSync(join(repo, sub))
    .filter((f) => f.startsWith("kaizen-") && f.endsWith(".md"))
    .map((f) => join(repo, sub, f));
}

const links = [
  ...["kaizen", "kaizen-help"].map((n) => [join(repo, "skills", n), "skills"] as const),
  ...dirEntries("agents").map((f) => [f, "agents"] as const),
  ...dirEntries("commands").map((f) => [f, "commands"] as const),
];

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
  const dir = join(base, sub);
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

step(
  wrote && already ? `linked ${wrote} new, ${already} already in place`
  : wrote ? `linked ${wrote} skills, agents, and commands into ${tilde(base)}`
  : `already installed in ${tilde(base)} ${c.dim("(nothing to change)")}`,
);

// ---------------------------------------------------------------- repo setup

const inGitRepo = existsSync(join(process.cwd(), ".git"));
const kaizenDir = join(process.cwd(), ".kaizen");

if (inGitRepo && !existsSync(kaizenDir)) {
  const now = interactive
    ? await select(`Set up ${basename(process.cwd())}/ for kaizen now`, [
        { label: "Yes", hint: "writes .kaizen/ — spec, config, gitignore entry", value: true },
        { label: "Not now", hint: "run /kaizen-init in the repo later", value: false },
      ])
    : false;
  if (now) initRepo();
} else if (existsSync(kaizenDir)) {
  step(`${basename(process.cwd())}/.kaizen already set up`);
}

function initRepo() {
  mkdirSync(kaizenDir, { recursive: true });
  for (const f of readdirSync(join(repo, "skills/kaizen")).filter((f) => f.startsWith("spec"))) {
    copyFileSync(join(repo, "skills/kaizen", f), join(kaizenDir, f));
  }
  copyFileSync(join(repo, "skills/kaizen/config.default.yml"), join(kaizenDir, "config.yml"));

  // Run state is local; the workflow itself is shared, so those files stay tracked.
  const rules = ".kaizen/*\n!.kaizen/spec*.md\n!.kaizen/config.yml\n";
  const gi = join(process.cwd(), ".gitignore");
  const current = existsSync(gi) ? readFileSync(gi, "utf8") : "";
  if (!current.includes(".kaizen/*")) {
    appendFileSync(gi, (current && !current.endsWith("\n") ? "\n" : "") + "\n# kaizen run state\n" + rules);
  }
  step("wrote .kaizen/ and the gitignore entry");
}

// ---------------------------------------------------------------- done

console.log(`
  ${c.bold("Next")}
    1  restart Claude Code ${c.dim("— skills load live, slash commands only at session start")}
    2  ${c.cyan("/kaizen-init")} ${c.dim("in any repo you want to use it on")}
    3  ${c.cyan("/kaizen-plan <what you want done>")}

  ${c.dim("/kaizen-help lists every command.")}
`);
if (blocked) process.exit(1);

// ---------------------------------------------------------------- helpers

function step(msg: string) { console.log(`  ${c.green("+")} ${msg}`); }
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
