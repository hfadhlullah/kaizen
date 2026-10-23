// Settings against a throwaway home and project: a project with its own config.yml
// must not hide the board's machine-wide settings. Bun reads HOME once at startup,
// so the settings code runs in a child process with a fake HOME; setting HOME here
// would write to the real ~/.kaizen/config.yml.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { applyPreset, detectPreset } from "./settings.ts";

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

test("every row is a key in config.default.yml, and every `when` names a row and one of its values", () => {
  const rows = inProject(`return listSettings(repo).rows`);
  const text = readFileSync(defaults, "utf8");
  for (const r of rows) {
    const [top, leaf] = r.key.split(".");
    const block = leaf ? new RegExp(`^${top}:\\n(?:(?:  .*|\\s*)\\n)*?  ${leaf}:`, "m") : new RegExp(`^${top}:`, "m");
    expect(block.test(text) ? r.key : `${r.key} missing`).toBe(r.key);
    if (!r.when) continue;
    const dep = rows.find((x) => x.key === r.when[0]);
    expect(dep?.values).toContain(r.when[1]);
  }
});

test("a row dims while the setting it depends on has it switched off, and a leftover dead key changes nothing", () => {
  const conf = join(project, ".kaizen", "config.yml");
  // The low preset as an older config holds it, with keys kaizen no longer reads.
  writeFileSync(conf, readFileSync(defaults, "utf8")
    .replace("enabled: true\n  # critical", "enabled: false\n  # critical")
    .replace("git:\n", "git:\n  branch_before_implement: false\n")
    + "\ntrack:\n  default: software\n");
  const idle = (k: string) => inProject(`return listSettings(repo).rows.find((r) => r.key === ${JSON.stringify(k)}).idle`);
  expect(idle("auto_fix.min_severity")).toBe("No effect unless Fix findings automatically is on");
  expect(idle("auto_fix.enabled")).toBe("");
  expect(inProject(`return setSetting(repo, "auto_fix.max_iterations", "3")`)).toEqual({ ok: true });
  expect(inProject(`return setSetting(repo, "auto_fix.enabled", "true")`)).toEqual({ ok: true });
  expect(idle("auto_fix.min_severity")).toBe("");
  expect(inProject(`return value("auto_fix.max_iterations")`)).toBe("3");
  copyFileSync(defaults, conf);
});

test("a config still holding git.branch_before_implement keeps its preset", () => {
  const text = readFileSync(defaults, "utf8");
  const low = applyPreset(text, "low", text).replace("git:\n", "git:\n  branch_before_implement: true\n");
  expect(detectPreset(low, text)).toBe("low");
  expect(detectPreset(text, text)).toBe("medium");
});
