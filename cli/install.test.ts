// `kaizen uninstall` against throwaway folders only. Every path it may delete comes
// from the env built here (HOME, KAIZEN_HOME, TMPDIR all scratch), never from the
// real environment: on 2026-10-01 an uninstall pointed at a checkout deleted it.
// Skipped on Windows: there uninstall also walks every drive (searchRoots) and
// strips kaizen links from real projects, whatever HOME says.
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, symlinkSync, cpSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const script = join(dirname(import.meta.path), "install.ts");
const it = test.skipIf(process.platform === "win32");
const REPO = "https://github.com/hfadhlullah/kaizen.git";

// `custom` sets KAIZEN_HOME to a folder outside HOME; otherwise it is unset and the
// install is the scratch home's own ~/kaizen.
const uninstall = (make: (k: string) => void, custom = false) => {
  const root = mkdtempSync(join(tmpdir(), "kz-uninstall-"));
  const home = join(root, "home"), k = custom ? join(root, "kaizen") : join(home, "kaizen");
  mkdirSync(home);
  make(k);
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home, TMPDIR: root };
  if (custom) env.KAIZEN_HOME = k;
  const p = Bun.spawnSync([process.execPath, script, "uninstall", "--yes"], { cwd: home, env });
  const left = existsSync(k), out = p.stdout.toString();
  rmSync(root, { recursive: true, force: true });
  if (p.exitCode !== 0) throw new Error(p.stderr.toString());
  return { left, out };
};
const kaizenFiles = (k: string) => { mkdirSync(join(k, "cli"), { recursive: true }); writeFileSync(join(k, "cli", "install.ts"), ""); };
// A clone without the network: an empty repository whose origin is `url`.
const clone = (url: string, dirty = false, more?: (k: string) => void) => (k: string) => {
  mkdirSync(k, { recursive: true });
  Bun.spawnSync(["git", "init", "-q", k]);
  Bun.spawnSync(["git", "-C", k, "remote", "add", "origin", url]);
  if (dirty) writeFileSync(join(k, "mine.txt"), "uncommitted");
  more?.(k);
};
// The clone used as a project: its .kaizen/ is ignored, so `status --porcelain` alone reads clean.
const runs = (k: string) => {
  writeFileSync(join(k, ".git", "info", "exclude"), ".kaizen/\n");
  mkdirSync(join(k, ".kaizen", "runs", "r1"), { recursive: true });
  writeFileSync(join(k, ".kaizen", "runs", "r1", "state.json"), "{}");
};
const commit = (k: string) => {
  Bun.spawnSync(["git", "-C", k, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "mine"]);
};

it("uninstall leaves a KAIZEN_HOME other than ~/kaizen, git checkout or not", () => {
  const r = uninstall((k) => { kaizenFiles(k); mkdirSync(join(k, ".git")); }, true);
  expect(r.left).toBe(true);
  expect(r.out).toContain("KAIZEN_HOME is not ~/kaizen");
  expect(uninstall(kaizenFiles, true).left).toBe(true);
  // ~/kaizen is a link to the checkout KAIZEN_HOME names: same realpath, still refused.
  const linked = uninstall((k) => { kaizenFiles(k); mkdirSync(join(k, ".git")); symlinkSync(k, join(dirname(k), "home", "kaizen")); }, true);
  expect(linked.left).toBe(true);
  expect(linked.out).toContain("KAIZEN_HOME is not ~/kaizen");
});

it("uninstall leaves a ~/kaizen that is not a kaizen install", () => {
  const r = uninstall((k) => { mkdirSync(k); writeFileSync(join(k, "notes.txt"), "mine"); });
  expect(r.left).toBe(true);
  expect(r.out).toContain("not a kaizen install");
});

it("uninstall still removes the copy kaizen made without git", () => {
  expect(uninstall(kaizenFiles).left).toBe(false);
});

it.skipIf(!Bun.which("git"))("uninstall removes a clean clone of kaizen and keeps any other", () => {
  expect(uninstall(clone(REPO)).left).toBe(false);
  expect(uninstall(clone(REPO.replace(/\.git$/, ""))).left).toBe(false);
  const dirty = uninstall(clone(REPO, true));
  expect(dirty.left).toBe(true);
  expect(dirty.out).toContain("local changes");
  const other = uninstall(clone("https://example.com/someone/else.git"));
  expect(other.left).toBe(true);
  expect(other.out).toContain("another repository");
  const used = uninstall(clone(REPO, false, runs));
  expect(used.left).toBe(true);
  expect(used.out).toContain("ignored files");
  const unpushed = uninstall(clone(REPO, false, commit));
  expect(unpushed.left).toBe(true);
  expect(unpushed.out).toContain("commits not pushed");
});

// An npm package of this checkout, at a version no real release has: no .git, so its
// installer runs as `bunx kaizen-agent` would. Scratch HOME only; ~/kaizen is a fake.
const fromPackage = (make: (k: string) => void, custom = false) => {
  const root = mkdtempSync(join(tmpdir(), "kz-replace-"));
  const home = join(root, "home"), pkg = join(root, "pkg");
  const k = custom ? join(root, "kaizen") : join(home, "kaizen");
  mkdirSync(home);
  const src = dirname(dirname(import.meta.path));
  for (const d of ["cli", "skills", "agents", "commands", "web", "package.json"]) {
    cpSync(join(src, d), join(pkg, d), { recursive: true, filter: (p) => !p.includes("node_modules") });
  }
  const pj = join(pkg, "package.json");
  writeFileSync(pj, readFileSync(pj, "utf8").replace(/"version": "[^"]*"/, '"version": "9.9.9"'));
  make(k);
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home, TMPDIR: root };
  if (custom) env.KAIZEN_HOME = k;
  const p = Bun.spawnSync([process.execPath, join(pkg, "cli", "install.ts"), "--yes", "--global"], { cwd: home, env });
  const r = {
    out: p.stdout.toString(),
    version: existsSync(join(k, "package.json")) ? JSON.parse(readFileSync(join(k, "package.json"), "utf8")).version : null,
    oldKept: existsSync(join(`${k}.old`, "mine.txt")),
    mineInPlace: existsSync(join(k, "mine.txt")),
  };
  rmSync(root, { recursive: true, force: true });
  return r;
};

it.skipIf(!Bun.which("git"))("an npm package replaces a ~/kaizen clone with local edits, keeping it as .old", () => {
  const r = fromPackage(clone(REPO, true));
  expect(r.version).toBe("9.9.9");
  expect(r.mineInPlace).toBe(false);
  expect(r.oldKept).toBe(true);
  expect(r.out).toContain("replaced");
});

it.skipIf(!Bun.which("git"))("an npm package never replaces a development checkout", () => {
  expect(fromPackage(clone(REPO, true), true).mineInPlace).toBe(true);
  const unpushed = fromPackage(clone(REPO, true, commit));
  expect(unpushed.mineInPlace).toBe(true);
  expect(unpushed.out).toContain("commits not pushed");
});

it("upgrade with npm unreachable says not upgraded, never up to date", () => {
  const root = mkdtempSync(join(tmpdir(), "kz-offline-"));
  const home = join(root, "home");
  mkdirSync(home);
  kaizenFiles(join(home, "kaizen"));
  const env = { PATH: process.env.PATH ?? "", HOME: home, TMPDIR: root, HTTPS_PROXY: "http://127.0.0.1:9", https_proxy: "http://127.0.0.1:9" };
  const p = Bun.spawnSync([process.execPath, script, "upgrade"], { cwd: home, env });
  rmSync(root, { recursive: true, force: true });
  expect(p.exitCode).not.toBe(0);
  expect(p.stdout.toString()).toContain("Not upgraded");
  expect(p.stdout.toString()).not.toContain("Up to date");
});
