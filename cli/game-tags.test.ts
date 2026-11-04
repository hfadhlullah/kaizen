import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CATALOG, defaultGame, dungeonOf, foundGuild, gameState, guildsOf, moveSkill, planTags, readGame, skillList, skillOf, type Tags } from "./game.ts";

const scratch = () => mkdtempSync(join(tmpdir(), "kz-tags-"));
const framing = (body: string) => `# Plan\n\n## Framing\n${body}\n\n## Work list\n- a\n`;
// A run in a scratch project; returns its state dir.
function run(project: string, id: string, plan: string, request = "Fix the TypeScript parser", impl = "## Changes\n- `a.ts`\n") {
  const dir = join(project, ".kaizen", "runs", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.json"), JSON.stringify({ id, track: "code", stage: "done", awaiting: null, iteration: 0 }));
  writeFileSync(join(dir, "00-request.md"), request);
  writeFileSync(join(dir, "01-plan.md"), plan);
  writeFileSync(join(project, "a.ts"), "x");
  writeFileSync(join(dir, "03-impl.md"), impl);
  return join(project, ".kaizen");
}
const where = (tags: Tags, game = defaultGame(), sorted: Record<string, string> = {}, runId = "r") =>
  skillOf({ title: "Fix the TypeScript parser", text: "", track: "code", exts: [".ts"] }, guildsOf(game), runId, sorted, tags);

// G-02 (reading)
test("planTags reads Skill and Guild from the Framing only", () => {
  expect(planTags(framing("Skill: agents\nGuild: craft"))).toEqual({ skill: "agents", guild: "craft" });
  expect(planTags(framing("- **Skill:** `agents`\n- Guild: craft"))).toEqual({ skill: "agents", guild: "craft" });
  expect(planTags(framing("skill: agents"))).toEqual({ skill: "agents" });
  expect(planTags(framing("Skill: agents\nSkill: testing"))).toEqual({ skill: "agents" });          // the first wins
  expect(planTags(framing("Skill: Agents\nGuild: Craft"))).toEqual({});                               // upper case is no id
  expect(planTags(framing("Skill: two words"))).toEqual({});
  expect(planTags(framing("Skill:"))).toEqual({});
  expect(planTags(framing("```\nSkill: agents\n```\nGuild: craft"))).toEqual({ guild: "craft" });     // not inside a fence
  expect(planTags("# Plan\n\n## Framing\nnothing\n\n## Steps\nSkill: agents\nGuild: craft\n")).toEqual({});
  expect(planTags("Skill: agents\n")).toEqual({});                                                    // no Framing at all
  expect(planTags("")).toEqual({});
});

// G-01 and G-02 (using)
test("the order is: hand sort, valid skill tag, valid guild tag, keywords", () => {
  const kw = where({});
  expect(kw).toEqual({ guild: "code", skill: "typescript" });
  expect(where({ skill: "agents" })).toEqual({ guild: "craft", skill: "agents" });
  expect(where({ guild: "writing" })).toEqual({ guild: "writing", skill: "writing-general" });
  expect(where({ skill: "agents", guild: "arts" })).toEqual({ guild: "craft", skill: "agents" });   // the skill wins
  expect(where({ skill: "agents" }, defaultGame(), { r: "testing" })).toEqual({ guild: "code", skill: "testing" }); // the player's own sort wins
  expect(where({ skill: "nope" })).toEqual(kw);
  expect(where({ guild: "nope" })).toEqual(kw);
  expect(where({ skill: "nope", guild: "craft" })).toEqual({ guild: "craft", skill: "craft-general" }); // a bad skill falls to the guild
  expect(where({ skill: "nope", guild: "nope" })).toEqual(kw);
});

test("a tag follows a moved skill and can name a hand-founded guild", () => {
  const home = scratch();
  expect(foundGuild("Guild of Cooks", ["Baking"], home).ok).toBe(true);
  expect(moveSkill("agents", "arts", home).ok).toBe(true);
  const game = readGame(home);
  expect(where({ skill: "agents" }, game)).toEqual({ guild: "arts", skill: "agents" });
  expect(where({ skill: "baking" }, game)).toEqual({ guild: "guild-of-cooks", skill: "baking" });
  // A hand guild has no "-general" skill: its first skill stands in.
  expect(where({ guild: "guild-of-cooks" }, game)).toEqual({ guild: "guild-of-cooks", skill: "baking" });
});

test("dungeonOf uses the plan's tags, and an untagged plan is exactly the keyword guess", () => {
  const p = scratch();
  const state = run(p, "tagged", framing("Skill: agents\nGuild: craft"));
  run(p, "plain", framing("Problem: x"));
  run(p, "wrong", framing("Skill: nope\nGuild: nope"));
  expect(dungeonOf(state, p, "tagged", defaultGame())).toMatchObject({ guild: "craft", skill: "agents" });
  const kw = skillOf({ title: "Fix the TypeScript parser", text: "Fix the TypeScript parser", track: "code", exts: [".ts"] }, CATALOG);
  expect(dungeonOf(state, p, "plain", defaultGame())).toMatchObject(kw);
  expect(dungeonOf(state, p, "wrong", defaultGame())).toMatchObject(kw);
  const g = { ...defaultGame(), runs: { tagged: "testing" } };
  expect(dungeonOf(state, p, "tagged", g)).toMatchObject({ guild: "code", skill: "testing" });
});

// G-04
const hashTree = (root: string): string => {
  const h = createHash("sha256");
  const walk = (d: string) => { for (const n of readdirSync(d).sort()) { const f = join(d, n); statSync(f).isDirectory() ? walk(f) : h.update(f + readFileSync(f)); } };
  walk(root);
  return h.digest("hex");
};
test("tagged plans are read without writing anything", () => {
  const home = scratch(), p = scratch();
  run(p, "t", framing("Skill: agents\nGuild: craft"));
  const before = hashTree(p);
  gameState({ home, projects: [p] });
  expect(hashTree(p)).toBe(before);
});

// G-05
test("skillList has every id of guildsOf once, hand guilds and moves included", () => {
  const home = scratch();
  foundGuild("Guild of Cooks", ["Baking"], home);
  moveSkill("agents", "arts", home);
  const list = skillList(readGame(home)), ids = list.flatMap((g) => g.skills.map((s) => s.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(list.find((g) => g.id === "guild-of-cooks")!.skills.map((s) => s.id)).toEqual(["baking"]);
  expect(list.find((g) => g.id === "arts")!.skills.map((s) => s.id)).toContain("agents");
  expect(list.find((g) => g.id === "craft")!.skills.map((s) => s.id)).not.toContain("agents");
  expect(list.map((g) => g.id)).toEqual(guildsOf(readGame(home)).map((g) => g.id));
});

// G-04, G-05, G-06 through the real command
const kz = (home: string, ...args: string[]) => {
  const r = Bun.spawnSync([process.execPath, join(import.meta.dir, "install.ts"), "game", ...args], { env: { ...process.env, HOME: home, USERPROFILE: home, KAIZEN_HOME: join(home, "kz") } });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
};
test("kaizen game skills lists the ids, as text and as JSON, and creates no game.json", () => {
  const home = scratch();
  const text = kz(home, "skills"), json = kz(home, "skills", "--json");
  expect(text.code).toBe(0);
  expect(text.out).toContain("craft  Guild of Craft");
  expect(text.out).toContain("  agents  Agents & prompts");
  expect(JSON.parse(json.out).find((g: { id: string }) => g.id === "craft").skills.map((s: { id: string }) => s.id)).toContain("agents");
  expect(existsSync(join(home, ".kaizen", "game.json"))).toBe(false);
  for (const args of [[], ["nope"], ["--json"]]) { const r = kz(home, ...args); expect(r.code).toBe(1); expect(r.out).toContain("kaizen game skills"); }
  expect(existsSync(join(home, ".kaizen"))).toBe(false);
});

test("the command lists a hand-founded guild from game.json", () => {
  const home = scratch();
  foundGuild("Guild of Cooks", ["Baking"], home);
  const r = kz(home, "skills");
  expect(r.out).toContain("guild-of-cooks  Guild of Cooks");
  expect(r.out).toContain("  baking  Baking");
});
