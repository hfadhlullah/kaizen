import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lintDocs } from "./docs.ts";

const fixture = (updated = "2026-10-28") => {
  const root = mkdtempSync(join(tmpdir(), "kz-docs-lint-"));
  const vault = join(root, ".kaizen", "notes", "Project");
  mkdirSync(vault, { recursive: true });
  writeFileSync(join(root, "app.ts"), "export const app = 1;\n");
  writeFileSync(join(vault, "Index.md"), `---\ndescription: Index\ntags: [project, index]\nupdated: ${updated}\n---\n# Index\n[[App]]\n`);
  writeFileSync(join(vault, "App.md"), `---\ndescription: App\ntags: [project, app]\nsources: [app.ts]\nupdated: ${updated}\n---\n# App\n`);
  return { root, vault, cleanup: () => rmSync(root, { recursive: true, force: true }) };
};

test("clean vault, nested CLI invocation, and no writes", () => {
  const f = fixture();
  try {
    const nested = join(f.root, "inside"); mkdirSync(nested);
    const before = readFileSync(join(f.vault, "App.md"));
    const p = Bun.spawnSync([process.execPath, join(import.meta.dir, "install.ts"), "docs", "lint"], { cwd: nested });
    expect(p.exitCode).toBe(0);
    expect(p.stdout.toString()).toContain("docs lint: clean");
    expect(readFileSync(join(f.vault, "App.md"))).toEqual(before);
    expect(lintDocs(f.root)).toEqual([]);
  } finally { f.cleanup(); }
});

test("reports links, metadata, missing and uncovered sources, and long Index", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.vault, "Index.md"), `---\ndescription: Index\ntags: [project, index]\nupdated: 2026-10-28\n---\n# Index\n[[App]]\n${"line\n".repeat(54)}`);
    writeFileSync(join(f.vault, "App.md"), "---\ndescription: App\ntags: [project, app]\nsources: [gone.ts]\n---\n# App\n[[Missing]] `[[code]]` [[run:x]]\n");
    writeFileSync(join(f.vault, "Unlisted.md"), "# unlisted\n");
    const found = lintDocs(f.root).join("\n");
    for (const s of ["under 60 lines", "broken link [[Missing]]", "missing updated", "missing source gone.ts", "uncovered: app.ts", "not listed in Index.md", "missing description", "missing sources"]) expect(found).toContain(s);
    expect(found).not.toContain("[[code]]");
    expect(found).not.toContain("[[run:x]]");
  } finally { f.cleanup(); }
});

test("outside git, same-day source mtimes are covered and later ones are stale", () => {
  const f = fixture("2020-01-01");
  try {
    const file = join(f.root, "app.ts");
    utimesSync(file, new Date("2020-01-01T10:00:00"), new Date("2020-01-01T10:00:00"));
    expect(lintDocs(f.root)).toEqual([]);
    utimesSync(file, new Date("2020-01-02T10:00:00"), new Date("2020-01-02T10:00:00"));
    expect(lintDocs(f.root)).toContain("Project/App.md: stale (sources changed after 2020-01-01)");
  } finally { f.cleanup(); }
});

test.skipIf(!Bun.which("git"))("git history detects stale notes; generated and binary files do not require coverage", () => {
  const f = fixture("2020-01-01");
  try {
    const run = (args: string[], env = process.env) => Bun.spawnSync(["git", ...args], { cwd: f.root, env });
    expect(run(["init", "-q"]).exitCode).toBe(0);
    writeFileSync(join(f.root, "app.js"), "built\n");
    writeFileSync(join(f.root, "picture.png"), "binary\n");
    expect(run(["add", "."]).exitCode).toBe(0);
    expect(run(["-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-qm", "initial"], { ...process.env, GIT_AUTHOR_DATE: "2020-01-01T10:00:00+0000", GIT_COMMITTER_DATE: "2020-01-01T10:00:00+0000" }).exitCode).toBe(0);
    expect(lintDocs(f.root)).toEqual([]);
    const nested = join(f.root, "inside"); mkdirSync(nested);
    expect(Bun.spawnSync([process.execPath, join(import.meta.dir, "install.ts"), "docs", "lint"], { cwd: nested }).exitCode).toBe(0);
    const worktree = join(f.root, ".kaizen", "wt", "lint");
    expect(run(["worktree", "add", "-qb", "lint-branch", worktree]).exitCode).toBe(0);
    const worktreeNote = join(worktree, ".kaizen", "notes", "Project", "App.md");
    writeFileSync(worktreeNote, readFileSync(worktreeNote, "utf8") + "[[Broken]]\n");
    const fromWorktree = Bun.spawnSync([process.execPath, join(import.meta.dir, "install.ts"), "docs", "lint"], { cwd: worktree });
    expect(fromWorktree.exitCode).toBe(1);
    expect(fromWorktree.stdout.toString()).toContain("broken link [[Broken]]");
    writeFileSync(join(f.root, "app.ts"), "export const app = 2;\n");
    expect(run(["add", "app.ts"]).exitCode).toBe(0);
    expect(run(["-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-qm", "later"], { ...process.env, GIT_AUTHOR_DATE: "2020-01-02T10:00:00+0000", GIT_COMMITTER_DATE: "2020-01-02T10:00:00+0000" }).exitCode).toBe(0);
    expect(lintDocs(f.root)).toContain("Project/App.md: stale (sources changed after 2020-01-01)");
  } finally { f.cleanup(); }
});

test("missing vault and unsupported CLI arguments fail clearly", () => {
  const root = mkdtempSync(join(tmpdir(), "kz-docs-none-"));
  try {
    expect(lintDocs(root)).toContain("missing Project/Index.md (run /kaizen docs first)");
    mkdirSync(join(root, ".kaizen"));
    const absent = Bun.spawnSync([process.execPath, join(import.meta.dir, "install.ts"), "docs", "lint"], { cwd: root });
    expect(absent.exitCode).toBe(1);
    expect(absent.stdout.toString()).toContain("missing Project/Index.md");
    const p = Bun.spawnSync([process.execPath, join(import.meta.dir, "install.ts"), "docs", "other"], { cwd: root });
    expect(p.exitCode).toBe(1);
    expect(p.stdout.toString()).toContain("kaizen docs lint");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
