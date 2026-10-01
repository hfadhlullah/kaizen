// `kaizen uninstall` against throwaway folders only. Every path it may delete comes
// from the env built here (HOME, KAIZEN_HOME, TMPDIR all scratch), never from the
// real environment: on 2026-10-01 an uninstall pointed at a checkout deleted it.
// Skipped on Windows: there uninstall also walks every drive (searchRoots) and
// strips kaizen links from real projects, whatever HOME says.
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
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
