import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lintDocs, docsCost } from "./docs.ts";

const fixture = (updated = "2026-10-28") => {
  const root = mkdtempSync(join(tmpdir(), "kz-docs-lint-"));
  const vault = join(root, ".kaizen", "notes", "Project");
  mkdirSync(vault, { recursive: true });
  writeFileSync(join(root, "app.ts"), "export const app = 1;\n");
  writeFileSync(join(vault, "Index.md"), `---\ndescription: Index\ntags: [project, index]\nupdated: ${updated}\n---\n# Index\n[[App]]\n`);
  writeFileSync(join(vault, "App.md"), `---\ndescription: App\ntags: [project, app]\nsources: [app.ts]\nupdated: ${updated}\n---\n# App\n## In plain words\nThe app people open.\n`);
  return { root, vault, cleanup: () => rmSync(root, { recursive: true, force: true }) };
};

test("clean vault, nested CLI invocation, and no writes", () => {
  const f = fixture("2020-01-01");
  try {
    // A source written today would be stale against any fixed date: back-date it.
    utimesSync(join(f.root, "app.ts"), new Date("2020-01-01T10:00:00"), new Date("2020-01-01T10:00:00"));
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

test("note budget, plain words, dead paths, hubs listing their sub-notes, and cost", () => {
  const f = fixture("2020-01-01");
  try {
    const old = new Date("2020-01-01T10:00:00");
    const note = (name: string, body: string) => {
      mkdirSync(join(f.vault, name, ".."), { recursive: true });
      writeFileSync(join(f.vault, `${name}.md`), `---\ndescription: ${name}\ntags: [project]\nsources: [app.ts]\nupdated: 2020-01-01\n---\n# ${name}\n${body}`);
    };
    utimesSync(join(f.root, "app.ts"), old, old);
    mkdirSync(join(f.root, "src"));
    writeFileSync(join(f.root, "src", "here.ts"), "x\n");
    utimesSync(join(f.root, "src", "here.ts"), old, old);
    writeFileSync(join(f.vault, "Index.md"), "---\ndescription: Index\ntags: [project, index]\nupdated: 2020-01-01\n---\n# Index\n[[App]] [[Big]] [[Hub]] [[Plain]] [[Paths]]\n");
    note("Big", `## In plain words\nBig.\n## What it does\n${"x".repeat(17 * 1024)}\n`);
    note("Hub", "## In plain words\nA hub.\n## Topics\n- [[Hub/Topic]] — one part\n");
    note("Hub/Topic", `## In plain words\nOne part.\n## What it does\n${"y".repeat(2048)}\n`);
    note("Hub/Orphan", "## In plain words\nNobody links me.\n");
    note("Plain", "## In plain words\n`a` `b` `c`\n## What it does\nok\n");
    note("Paths", "## In plain words\nPaths.\n## Where it lives\n- `src/here.ts` `src/gone.ts` `./x.ts` `other/y.ts` `src/<name>.ts`\n");
    const found = lintDocs(f.root);
    expect(found).toContain("Project/Big.md: over budget (17 KB > 16 KB): split into a hub and sub-notes");
    expect(found).toContain("Project/Hub/Orphan.md: not listed in Index.md or its hub");
    expect(found).toContain("Project/Plain.md: In plain words not plain (over 2 code spans)");
    expect(found).toContain("Project/Paths.md: dead path src/gone.ts");
    expect(found.filter((x) => /Hub\/Topic|Hub\.md|App\.md/.test(x))).toEqual([]);
    expect(found.filter((x) => x.includes("dead path"))).toEqual(["Project/Paths.md: dead path src/gone.ts"]);
    // A bare name that only the board can resolve into a folder is a finding; the path form is not.
    note("Paths", "## In plain words\nPaths.\nSee [[Topic]] and [[Hub/Topic]].\n");
    expect(lintDocs(f.root).filter((x) => x.includes("in a folder"))).toEqual(["Project/Paths.md: link [[Topic]] is in a folder: write [[Hub/Topic]]"]);
    note("Plain", `## In plain words\n${"line\n".repeat(9)}`);
    expect(lintDocs(f.root)).toContain("Project/Plain.md: In plain words too long (over 8 lines)");
    note("Plain", "## What it does\nno top\n");
    expect(lintDocs(f.root)).toContain("Project/Plain.md: In plain words missing");
    const cost = docsCost(f.root);
    expect(cost.largest.name).toBe("Big");
    expect(cost.index).toBeGreaterThan(0);
    const p = Bun.spawnSync([process.execPath, join(import.meta.dir, "install.ts"), "docs", "lint"], { cwd: f.root });
    expect(p.stdout.toString()).toMatch(/cost: Index ~\d+ tokens every session; largest note Big ~\d+ tokens/);
  } finally { f.cleanup(); }
});
