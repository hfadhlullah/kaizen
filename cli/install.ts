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

  console.log(`\n  1  every project   ${join(home, ".claude")}`);
  console.log(`  2  this one only   ${join(process.cwd(), ".claude")}\n`);
  const answer = prompt("Install where? [1]") ?? "";
  return answer.trim() === "2" ? process.cwd() : home;
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
