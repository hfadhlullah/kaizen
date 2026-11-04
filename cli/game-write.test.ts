import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FOUND_XP, MAX_HAND_GUILDS, cachedGameState, foundGuild, gameFile, gameState, guildsOf, moveSkill, readGame, slug } from "./game.ts";

const scratch = () => mkdtempSync(join(tmpdir(), "kz-gw-"));
// A project with one cleared TypeScript run, so a skill has XP to move.
function project() {
  const p = scratch(), dir = join(p, ".kaizen", "runs", "r1");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.json"), JSON.stringify({ id: "r1", track: "code", stage: "done", awaiting: null, iteration: 0 }));
  writeFileSync(join(dir, "00-request.md"), "Fix the TypeScript parser");
  writeFileSync(join(p, "a.ts"), "x");
  writeFileSync(join(dir, "03-impl.md"), "## Changes\n- `a.ts`\n");
  return p;
}
const hashTree = (root: string): string => {
  const h = createHash("sha256");
  const walk = (d: string) => { for (const n of readdirSync(d).sort()) { const f = join(d, n); statSync(f).isDirectory() ? walk(f) : h.update(f + readFileSync(f)); } };
  walk(root);
  return h.digest("hex");
};
const xp = (home: string, p: string) => { const s = gameState({ home, projects: [p] }); return { char: s.character.xp, guilds: Object.fromEntries(s.guilds.map((g) => [g.id, g.xp])), skills: Object.fromEntries(s.guilds.flatMap((g) => g.skills.map((x) => [x.id, x.xp]))) }; };

test("slug makes plain ids", () => {
  expect(slug("Guild of Cooks")).toBe("guild-of-cooks");
  expect(slug("  Été & Café!! ")).toBe("ete-cafe");
  expect(slug("!!!")).toBe("");
});

// G-02
test("founding: accepts a normal guild, refuses every bad one", () => {
  const home = scratch();
  const ok = foundGuild("Guild of Cooks", ["Baking", "Grilling"], home);
  expect(ok).toEqual({ ok: true, id: "guild-of-cooks", skills: ["baking", "grilling"] });
  const g = guildsOf(readGame(home)).find((x) => x.id === "guild-of-cooks")!;
  expect(g.skills.map((s) => s.id)).toEqual(["baking", "grilling"]);
  const refused = (r: unknown) => { expect((r as any).ok).toBe(false); expect(typeof (r as any).error).toBe("string"); };
  refused(foundGuild("", [], home));
  refused(foundGuild("   ", [], home));
  refused(foundGuild("x".repeat(41), [], home));
  refused(foundGuild("bad\u0007name", [], home));
  refused(foundGuild("two\nlines", [], home));
  refused(foundGuild("!!!", [], home));
  refused(foundGuild(42, [], home));
  refused(foundGuild("Guild of Code", [], home));      // a catalog guild id
  refused(foundGuild("guild of cooks", [], home));     // the hand guild just made
  refused(foundGuild("Second", ["Baking"], home));     // a skill taken by a hand guild
  refused(foundGuild("Third", ["TypeScript"], home));  // a catalog skill
  refused(foundGuild("Fourth", ["Same", "same"], home)); // twice in one request
  refused(foundGuild("Testing", [], home));            // a guild id that is a catalog skill id
  refused(foundGuild("Baking", [], home));             // ... or a hand skill id
  refused(foundGuild("Seventh", ["Code"], home));      // a skill id that is a catalog guild id
  refused(foundGuild("Eighth", ["Eighth"], home));     // ... or the new guild's own id
  refused(foundGuild("Fifth", Array.from({ length: 9 }, (_, i) => `Skill ${i}`), home));
  refused(foundGuild("Sixth", ["bad\u0001"], home));
  for (let i = 0; guildsOf(readGame(home)).filter((x) => x.byHand).length < MAX_HAND_GUILDS; i++) expect(foundGuild(`Extra ${i}`, [], home).ok).toBe(true);
  refused(foundGuild("One too many", [], home));
});

// G-03
test("moving: refusals, no-op, back home forgets the move, XP follows the skill", () => {
  const home = scratch(), p = project();
  const before = xp(home, p);
  expect(before.skills["typescript"]).toBeGreaterThan(0);
  expect((moveSkill("nope", "arts", home) as any).ok).toBe(false);
  expect((moveSkill("typescript", "nope", home) as any).ok).toBe(false);
  expect((moveSkill(5, "arts", home) as any).ok).toBe(false);
  expect(moveSkill("typescript", "code", home)).toMatchObject({ ok: true, noop: true });
  expect(existsSync(gameFile(home)) ? JSON.parse(readFileSync(gameFile(home), "utf8")).moves : {}).toEqual({});
  expect(moveSkill("typescript", "arts", home)).toMatchObject({ ok: true, from: "code", to: "arts" });
  const after = xp(home, p), t = before.skills["typescript"]!;
  expect(after.char).toBe(before.char);
  expect(after.skills["typescript"]).toBe(t);
  // The skill's XP leaves one guild and arrives in the other, and so does the founding bonus: a guild
  // counts as founded while it holds a learned skill (code had only this one, arts had none).
  expect(before.guilds["code"]).toBe(t + FOUND_XP);
  expect(after.guilds["code"]).toBe(0);
  expect(after.guilds["arts"]).toBe(before.guilds["arts"]! + t + FOUND_XP);
  expect(moveSkill("typescript", "code", home)).toMatchObject({ ok: true, from: "arts", to: "code" });
  expect(JSON.parse(readFileSync(gameFile(home), "utf8")).moves).toEqual({});
  expect(xp(home, p)).toEqual(before);
});

test("founding adds exactly the founding XP and no skill XP", () => {
  const home = scratch(), p = project(), before = xp(home, p);
  expect(foundGuild("Guild of Cooks", ["Baking"], home).ok).toBe(true);
  const after = xp(home, p);
  expect(after.char).toBe(before.char + FOUND_XP);
  expect(after.guilds["guild-of-cooks"]).toBe(FOUND_XP);
  expect(after.skills["baking"]).toBe(0);
});

test("a skill can be moved into a hand-founded guild", () => {
  const home = scratch(), p = project();
  foundGuild("Guild of Cooks", [], home);
  expect(moveSkill("typescript", "guild-of-cooks", home)).toMatchObject({ ok: true });
  const s = gameState({ home, projects: [p] });
  expect(s.guilds.find((g) => g.id === "guild-of-cooks")!.skills.map((x) => x.id)).toEqual(["typescript"]);
});

// G-01
test("only game.json changes: run folders are untouched, and the extras are its backup", () => {
  const home = scratch(), p = project(), before = hashTree(p);
  foundGuild("Guild of Cooks", ["Baking"], home);
  moveSkill("typescript", "arts", home);
  gameState({ home, projects: [p] });
  expect(hashTree(p)).toBe(before);
  expect(readdirSync(join(home, ".kaizen")).sort()).toEqual(["game.json", "game.json.bak"]);
});

// G-04
test("a game.json that does not parse is never overwritten", () => {
  const home = scratch();
  mkdirSync(join(home, ".kaizen"));
  for (const text of ["{ not json", "[]", "42"]) {
    writeFileSync(gameFile(home), text);
    for (const r of [foundGuild("Guild of Cooks", [], home), moveSkill("typescript", "arts", home)]) { expect(r.ok).toBe(false); expect((r as any).error).toContain("nothing was written"); }
    expect(readFileSync(gameFile(home), "utf8")).toBe(text);
    expect(existsSync(gameFile(home) + ".bak")).toBe(false);
  }
});

// G-05
test("a write keeps every other key and leaves a backup of the previous file", () => {
  const home = scratch();
  mkdirSync(join(home, ".kaizen"));
  const start = { version: 1, name: "Ada", look: { hair: "long" }, guilds: [], moves: {}, runs: { r9: "typescript" }, future: { keep: [1, 2] } };
  writeFileSync(gameFile(home), JSON.stringify(start));
  expect(foundGuild("Guild of Cooks", ["Baking"], home).ok).toBe(true);
  const now = JSON.parse(readFileSync(gameFile(home), "utf8"));
  expect(now).toMatchObject({ name: "Ada", look: { hair: "long" }, runs: { r9: "typescript" }, future: { keep: [1, 2] } });
  expect(now.guilds).toHaveLength(1);
  expect(JSON.parse(readFileSync(gameFile(home) + ".bak", "utf8"))).toEqual(start);
});

test("the cached state shows a write at once", () => {
  const home = scratch(), p = project();
  const names = () => cachedGameState({ home, projects: [p] }).guilds.map((g) => g.id);
  expect(names()).not.toContain("guild-of-cooks");
  foundGuild("Guild of Cooks", [], home);
  expect(names()).toContain("guild-of-cooks");
});
