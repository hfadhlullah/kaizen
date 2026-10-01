// Settings against a throwaway home and project: a project with its own config.yml
// must not hide the board's machine-wide settings. Bun reads HOME once at startup,
// so the settings code runs in a child process with a fake HOME; setting HOME here
// would write to the real ~/.kaizen/config.yml.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const repo = join(dirname(import.meta.path), "..");
const defaults = join(repo, "skills/kaizen/config.default.yml");
let root: string, home: string, project: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "kaizen-settings-"));
  home = join(root, "home");
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  writeFileSync(join(home, ".kaizen", "config.yml"), readFileSync(defaults, "utf8").replace('projects_dir: ""', "projects_dir: ~/Projects"));
  // A project that carries its own config, as a cloned repo with .kaizen/config.yml does.
  project = join(home, "Projects", "app");
  mkdirSync(join(project, ".git"), { recursive: true });
  mkdirSync(join(project, ".kaizen"), { recursive: true });
  copyFileSync(defaults, join(project, ".kaizen", "config.yml"));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

// Runs `code` with listSettings/setSetting in scope, from inside the project, and returns what it prints.
const inProject = (code: string) => {
  const script = `import { listSettings, setSetting } from ${JSON.stringify(join(repo, "cli/settings.ts"))};
const repo = ${JSON.stringify(repo)};
const value = (k) => listSettings(repo).rows.find((r) => r.key === k)?.value;
console.log(JSON.stringify(await (async () => { ${code} })()));`;
  const p = Bun.spawnSync(["bun", "-e", script], { cwd: project, env: { ...process.env, HOME: home, USERPROFILE: home } });
  if (p.exitCode !== 0) throw new Error(p.stderr.toString());
  return JSON.parse(p.stdout.toString());
};

test("the projects folder survives moving into a project with its own config", () => {
  expect(inProject(`return value("board.projects_dir")`)).toBe("~/Projects");
});

test("board settings save to the global config, project settings to the project", () => {
  expect(inProject(`return [setSetting(repo, "board.projects_dir", "~/Work"), value("board.projects_dir")]`)).toEqual([{ ok: true }, "~/Work"]);
  expect(readFileSync(join(home, ".kaizen", "config.yml"), "utf8")).toContain("projects_dir: ~/Work");
  expect(readFileSync(join(project, ".kaizen", "config.yml"), "utf8")).toContain('projects_dir: ""');

  expect(inProject(`return setSetting(repo, "git.auto_commit", "true")`)).toEqual({ ok: true });
  expect(readFileSync(join(project, ".kaizen", "config.yml"), "utf8")).toMatch(/auto_commit: true/);
});
