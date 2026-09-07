#!/usr/bin/env bun
import { symlinkSync, mkdirSync, readdirSync, lstatSync, readlinkSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";

const home = homedir();
const REPO_URL = "https://github.com/hfadhlullah/kaizen.git";

// Links point back at the clone, so the clone has to be somewhere permanent. Run
// from a git checkout and that checkout is it; run through `bunx`, and the package
// lives in a temp cache that gets evicted, so clone to KAIZEN_HOME first.
const repo = await resolveRepo();

async function resolveRepo() {
  const here = dirname(import.meta.dir);
  if (existsSync(join(here, ".git"))) return here;

  const dest = process.env.KAIZEN_HOME ?? join(home, "kaizen");
  if (existsSync(join(dest, ".git"))) {
    // A pull can refuse for reasons that have nothing to do with linking — local
    // edits, a detached head, no network. Linking the checkout that is already
    // there still works, so say what happened and carry on rather than failing
    // the install over it.
    try {
      await Bun.$`git -C ${dest} pull --ff-only`.quiet();
      console.log(`update ${dest}`);
    } catch {
      console.log(`skip   ${dest} — could not pull, linking what is there`);
    }
    return dest;
  }
  console.log(`clone  ${REPO_URL} -> ${dest}`);
  await Bun.$`git clone --quiet ${REPO_URL} ${dest}`;
  return dest;
}

// Each entry: source path in the repo -> directory it is linked into.
const links = [
  ...["kaizen", "kaizen-help"].map((n) => [join(repo, "skills", n), "skills"] as const),
  ...dirEntries("agents").map((f) => [f, "agents"] as const),
  ...dirEntries("commands").map((f) => [f, "commands"] as const),
];

function dirEntries(sub: string) {
  return readdirSync(join(repo, sub))
    .filter((f) => f.startsWith("kaizen-") && f.endsWith(".md"))
    .map((f) => join(repo, sub, f));
}

function linkState(src: string, dest: string) {
  try {
    const st = lstatSync(dest);
    if (!st.isSymbolicLink()) return "occupied";
    return readlinkSync(dest) === src ? "linked" : "stale";
  } catch {
    return "missing";
  }
}

const args = new Set(Bun.argv.slice(2));
const check = args.has("--check");
const force = args.has("--force");
const base = join(await chooseRoot(), ".claude");

async function chooseRoot() {
  if (args.has("--project")) return process.cwd();
  if (args.has("--global") || check) return home;

  // Only ask when there is someone to answer. Piped, scripted, or CI runs take the
  // global install silently rather than hanging on a prompt nobody sees.
  if (!process.stdin.isTTY) return home;

  const choice = await select("Install where?", [
    { label: "Every project", hint: join(home, ".claude"), value: home },
    { label: "This one only", hint: join(process.cwd(), ".claude"), value: process.cwd() },
  ]);
  return choice;
}

// Arrow-key picker. Raw mode delivers keys unbuffered, one escape sequence at a
// time; the alternative is a dependency for forty lines of escape codes.
async function select<T>(question: string, options: { label: string; hint: string; value: T }[]) {
  const { stdin, stdout } = process;
  let active = 0;

  const draw = (first: boolean) => {
    if (!first) stdout.write(`\x1b[${options.length}A`); // back up over the list
    for (const [i, o] of options.entries()) {
      const on = i === active;
      stdout.write(
        `\x1b[2K  ${on ? "\x1b[36m>\x1b[0m" : " "} ${on ? "\x1b[1m" : "\x1b[2m"}${o.label}\x1b[0m` +
          `  \x1b[2m${o.hint}\x1b[0m\n`,
      );
    }
  };

  stdout.write(`\n\x1b[1m${question}\x1b[0m  \x1b[2m(arrows, enter)\x1b[0m\n`);
  stdout.write("\x1b[?25l"); // hide cursor
  draw(true);
  stdin.setRawMode(true);
  stdin.resume();

  try {
    outer: for await (const chunk of stdin) {
      // A chunk can hold more than one keypress -- an arrow and the enter behind
      // it arrive together when input is piped -- so walk it rather than
      // comparing the whole thing to one key.
      const keys = chunk.toString();
      for (let i = 0; i < keys.length; i++) {
        const rest = keys.slice(i);
        if (rest.startsWith("\x03")) {                  // ctrl-c
          stdout.write("\ncancelled\n");
          process.exit(130);
        }
        if (rest.startsWith("\r") || rest.startsWith("\n")) break outer;
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
    }
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write("\x1b[?25h\n"); // show cursor again
  }
  return options[active]!.value;
}

let bad = 0;
for (const [src, sub] of links) {
  const dir = join(base, sub);
  const dest = join(dir, basename(src));
  const state = linkState(src, dest);

  if (check) {
    if (state !== "linked") bad++;
    console.log(`${state === "linked" ? "ok  " : "MISS"} ${sub}/${basename(src)}${state === "linked" ? "" : ` (${state})`}`);
    continue;
  }
  if (state === "linked") { console.log(`ok   ${sub}/${basename(src)}`); continue; }
  if (state === "occupied" && !force) {
    console.log(`skip ${sub}/${basename(src)} — real file present, use --force`);
    bad++;
    continue;
  }
  mkdirSync(dir, { recursive: true });
  if (state !== "missing") unlinkSync(dest);
  symlinkSync(src, dest);
  console.log(`link ${sub}/${basename(src)}`);
}

if (check) {
  console.log(bad ? `\n${bad} link(s) missing — run: bun run ${repo}/cli/install.ts` : "\nall linked");
  process.exit(bad ? 1 : 0);
}
console.log(`\nInstalled into ${base}. Restart Claude Code: skills load live, slash commands only on session start.`);
console.log(`Then, in a repository you want to use it on: /kaizen-init`);
if (bad) process.exit(1);
