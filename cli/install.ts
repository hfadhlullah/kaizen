#!/usr/bin/env bun
import { symlinkSync, mkdirSync, readdirSync, lstatSync, readlinkSync, unlinkSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";

const repo = dirname(import.meta.dir);
const home = homedir();

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
const root = args.has("--project") ? process.cwd() : home;
const base = join(root, ".claude");

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
if (bad) process.exit(1);
