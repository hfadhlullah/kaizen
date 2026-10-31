import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bundledSkills, setSkill, skillsOff, skillStatus, skillsToLink, SKILL_HOMES } from "./skills.ts";

let t: string, repo: string, home: string;
const skill = (rel: string, json?: object) => {
  mkdirSync(join(repo, "skills", rel), { recursive: true });
  writeFileSync(join(repo, "skills", rel, "SKILL.md"), `---\nname: x\ndescription: Does a thing. And more.\n---\n`);
  if (json) writeFileSync(join(repo, "skills", rel, "skill.json"), JSON.stringify(json));
};
beforeEach(() => {
  t = mkdtempSync(join(tmpdir(), "kz-skills-"));
  repo = join(t, "repo"); home = join(t, "home");
  mkdirSync(join(repo, "cli"), { recursive: true });
  writeFileSync(join(repo, "cli", "install.ts"), "");
  skill("kaizen", { group: "core" });
  skill("media/kaizen-deck", { title: "Create deck", needs: ["x"] });
  mkdirSync(join(home, ".claude", "skills"), { recursive: true });
  symlinkSync(join(repo, "skills/media/kaizen-deck"), join(home, ".claude/skills/kaizen-deck"));
  symlinkSync(join(repo, "skills/kaizen"), join(home, ".claude/skills/kaizen"));
});
afterEach(() => rmSync(t, { recursive: true, force: true }));
const link = () => join(home, ".claude/skills/kaizen-deck");

test("a new folder appears by itself, with its description; real skills all parse", () => {
  skill("media/new-one");
  const s = bundledSkills(repo).find((x) => x.id === "new-one")!;
  expect([s.group, s.description]).toEqual(["media", "Does a thing."]);
  const real = bundledSkills(join(import.meta.dir, ".."));
  expect(real.map((x) => x.id).sort()).toEqual(["kaizen", "kaizen-book", "kaizen-computer", "kaizen-deck", "kaizen-help", "kaizen-video"]);
  expect(real.filter((x) => x.group === "core").length).toBe(2);
  for (const x of real) expect(x.description.length).toBeGreaterThan(10);
});
test("off removes our link and remembers; on restores it", () => {
  expect(setSkill(repo, home, "kaizen-deck", false)).toBeNull();
  expect(existsSync(link())).toBe(false);
  expect(existsSync(join(repo, "skills/media/kaizen-deck/SKILL.md"))).toBe(true);
  expect(skillsOff(home)).toEqual(["kaizen-deck"]);
  expect(setSkill(repo, home, "kaizen-deck", true)).toBeNull();
  expect(lstatSync(link()).isSymbolicLink()).toBe(true);
  expect(skillsOff(home)).toEqual([]);
});
test("a real folder and a foreign link under the name stay", () => {
  rmSync(link());
  mkdirSync(link());
  writeFileSync(join(link(), "mine"), "x");
  setSkill(repo, home, "kaizen-deck", false);
  expect(readFileSync(join(link(), "mine"), "utf8")).toBe("x");
  expect(skillStatus(bundledSkills(repo)[1]!, home)[0]!.state).toBe("other");
  rmSync(link(), { recursive: true });
  mkdirSync(join(t, "skills/media/kaizen-deck"), { recursive: true }); // not a clone: no cli/install.ts
  symlinkSync(join(t, "skills/media/kaizen-deck"), link());
  setSkill(repo, home, "kaizen-deck", false);
  expect(lstatSync(link()).isSymbolicLink()).toBe(true);
});
test("core and unknown names are refused", () => {
  expect(setSkill(repo, home, "kaizen", false)).toMatch(/Core/);
  expect(existsSync(join(home, ".claude/skills/kaizen"))).toBe(true);
  expect(setSkill(repo, home, "../../x", false)).toBe("unknown skill");
});
test("the agent list stays the installer's, and install filters the off-list", () => {
  const src = readFileSync(join(import.meta.dir, "install.ts"), "utf8");
  for (const h of SKILL_HOMES) expect(src).toContain(`dir: "${h.dir}"`);
  expect(dirname(link())).toContain(".claude");
});

test("install: off skills stay out globally, not in a project, and core always links", () => {
  const rels = ["kaizen", "media/kaizen-deck"], off = ["kaizen", "kaizen-deck"];
  expect(skillsToLink(rels, off, true)).toEqual(["kaizen"]);
  expect(skillsToLink(rels, off, false)).toEqual(rels);
});
test("core holds with no manifest; a whole description is read; a restore follows the installed clone", () => {
  rmSync(join(repo, "skills/kaizen/skill.json"));
  expect(setSkill(repo, home, "kaizen", false)).toMatch(/Core/);
  writeFileSync(join(repo, "skills/kaizen/SKILL.md"), "---\nname: x\ndescription: One line\n  goes on here. Next.\nother: y\n---\n");
  expect(bundledSkills(repo)[0]!.description).toBe("One line goes on here.");
  const other = join(t, "clone");
  mkdirSync(join(other, "cli"), { recursive: true });
  writeFileSync(join(other, "cli", "install.ts"), "");
  mkdirSync(join(other, "skills/media/kaizen-deck"), { recursive: true });
  mkdirSync(join(other, "skills/kaizen"), { recursive: true });
  rmSync(join(home, ".claude/skills/kaizen"));
  symlinkSync(join(other, "skills/kaizen"), join(home, ".claude/skills/kaizen"));
  rmSync(link());
  setSkill(repo, home, "kaizen-deck", true);
  expect(readlinkSync(link())).toBe(join(other, "skills/media/kaizen-deck"));
});
