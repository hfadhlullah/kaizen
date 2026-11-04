import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CACHE_MS, CATALOG, FOUND_XP, LEARN_XP, cachedGameState, dungeonOf, dungeonXp, gameFile, gameState, guildsOf, defaultGame, levelOf, readGame, skillOf, stepCost } from "./game.ts";

const scratch = () => mkdtempSync(join(tmpdir(), "kz-game-"));

// A project with runs, in a scratch dir. `files` are created so changedPaths() sees them.
function run(project: string, id: string, o: { request: string; track?: string; stage?: string; plan?: string; impl?: string; review?: string; fixes?: number; files?: string[] }) {
  const dir = join(project, ".kaizen", "runs", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.json"), JSON.stringify({ id, track: o.track ?? "code", stage: o.stage ?? "done", awaiting: null, iteration: o.fixes ?? 0 }));
  writeFileSync(join(dir, "00-request.md"), o.request);
  if (o.plan) writeFileSync(join(dir, "01-plan.md"), o.plan);
  for (const f of o.files ?? []) { mkdirSync(join(project, f, ".."), { recursive: true }); writeFileSync(join(project, f), "x"); }
  if (o.impl ?? o.files) writeFileSync(join(dir, "03-impl.md"), o.impl ?? `## Changes\n${(o.files ?? []).map((f) => `- \`${f}\``).join("\n")}\n`);
  if (o.review) writeFileSync(join(dir, "04-review.md"), o.review);
  for (let i = 1; i <= (o.fixes ?? 0); i++) { mkdirSync(join(dir, "05-iterations"), { recursive: true }); writeFileSync(join(dir, "05-iterations", `0${i}-fix.md`), "fixed"); }
}

test("the curve: level 1 at 0 XP, exact thresholds, no cap", () => {
  expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 100 });
  expect(stepCost(1)).toBe(100);
  expect(stepCost(2)).toBe(283);
  expect(levelOf(99).level).toBe(1);
  expect(levelOf(100)).toEqual({ level: 2, into: 0, need: 283 });
  expect(levelOf(100 + 283)).toEqual({ level: 3, into: 0, need: 520 });
  expect(levelOf(-5).level).toBe(1);
  expect(levelOf(NaN).level).toBe(1);
  const big = levelOf(1e12);
  expect(Number.isFinite(big.level)).toBe(true);
  expect(big.level).toBeGreaterThan(1000);
  expect(levelOf(1e13).level).toBeGreaterThan(big.level);
});

test("skills are sorted from the request, the files and the track", () => {
  const g = CATALOG;
  expect(skillOf({ title: "Redesign the landing page palette and typography", text: "", track: "code", exts: [] }, g)).toEqual({ guild: "arts", skill: "ui-design" });
  expect(skillOf({ title: "Fix the TypeScript build error", text: "", track: "code", exts: [".ts"] }, g)).toEqual({ guild: "code", skill: "typescript" });
  expect(skillOf({ title: "Write chapter 3 of the novel", text: "", track: "writing", exts: [] }, g)).toEqual({ guild: "writing", skill: "book" });
  expect(skillOf({ title: "Cut the TikTok footage", text: "", track: "communication", exts: [".mp4"] }, g).guild).toBe("media");
  // nothing matches: the track's general skill
  expect(skillOf({ title: "continue", text: "", track: "research", exts: [] }, g)).toEqual({ guild: "research", skill: "research-general" });
  expect(skillOf({ title: "continue", text: "", track: "?", exts: [] }, g)).toEqual({ guild: "craft", skill: "craft-general" });
  // a keyword is a word, not a substring: "tab" does not match "stable"
  expect(skillOf({ title: "stable", text: "", track: "writing", exts: [] }, g).skill).toBe("writing-general");
});

test("the player's own sort and moved skills win", () => {
  const game = defaultGame();
  game.moves = { video: "arts" };
  game.runs = { r1: "sales" };
  const guilds = guildsOf(game);
  expect(guilds.find((x) => x.id === "arts")!.skills.some((s) => s.id === "video")).toBe(true);
  expect(guilds.find((x) => x.id === "media")!.skills.some((s) => s.id === "video")).toBe(false);
  expect(skillOf({ title: "Cut the TikTok footage", text: "", track: "x", exts: [] }, guilds)).toEqual({ guild: "arts", skill: "video" });
  expect(skillOf({ title: "anything", text: "", track: "x", exts: [] }, guilds, "r1", game.runs)).toEqual({ guild: "commerce", skill: "sales" });
});

test("a dungeon from a scratch run: 3 findings, 1 fix round", () => {
  const p = scratch();
  run(p, "2026-01-01-ts", {
    request: "Fix the TypeScript parser\n\nIt drops the last line.",
    plan: "# Plan\n## Work list\n- one\n- two\n- three\n## Steps\n1. a\n",
    review: "# Review\n## Findings\n1. a.ts:1: high: x. fix.\n2. a.ts:2: low: y. fix.\n3. a.ts:3: low: z. fix.\n## Acceptance\nG-01 PASS: ok\n",
    fixes: 1, files: ["src/a.ts", "src/b.ts", "src/c.ts"],
  });
  const d = dungeonOf(join(p, ".kaizen"), p, "2026-01-01-ts")!;
  expect(d.title).toBe("Fix the TypeScript parser");
  expect(d.outcome).toBe("cleared");
  expect(d.stages.map((s) => [s.name, s.monsters])).toEqual([["plan", 1], ["build", 3], ["review", 3], ["wave 1", 1]]);
  expect(d.waves).toBe(1);
  expect(d.boss).toBe(true);
  expect(d.monsters).toBe(8);
  expect(d.files).toBe(3);
  expect(d.length).toBe(7); // 3 + 2 * log2(1 + 3)
  expect(d.skill).toBe("typescript");
  expect(d.xp).toBe(dungeonXp(8, 1, 3));
  expect(d.xp).toBe(50 + 80 + 25 + 10); // 5 * log2(4) = 10
  rmSync(p, { recursive: true });
});

test("a retreat gives no XP; a run in motion is live, an old one stalled", () => {
  const p = scratch();
  run(p, "a-retreat", { request: "Add a feature", stage: "abandoned" });
  run(p, "b-live", { request: "Add a feature", stage: "build" });
  const st = join(p, ".kaizen");
  const retreat = dungeonOf(st, p, "a-retreat")!;
  expect(retreat.outcome).toBe("retreat");
  expect(retreat.xp).toBe(0);
  const live = dungeonOf(st, p, "b-live")!;
  expect(live.outcome).toBe("live");
  expect(live.xp).toBe(0);
  expect(live.pending).toBeGreaterThan(0);
  expect(dungeonOf(st, p, "b-live", defaultGame(), Date.now() + 3 * 3600_000)!.outcome).toBe("stalled");
  expect(dungeonOf(st, p, "nope")).toBeNull();
  rmSync(p, { recursive: true });
});

test("character XP is the dungeons' XP plus the skill and guild awards, computed independently", () => {
  const home = scratch(), p = scratch();
  run(p, "r1", { request: "Fix the TypeScript parser", files: ["a.ts"], review: "## Findings\n1. x: low: y. z.\n" });
  run(p, "r2", { request: "Fix the TypeScript lexer", files: ["b.ts", "c.ts"] });
  run(p, "r3", { request: "Redesign the logo and brand identity", track: "communication" });
  run(p, "r4", { request: "Redesign the logo", stage: "abandoned" });
  const s = gameState({ home, projects: [p] });
  const d = Object.fromEntries(s.dungeons.map((x) => [x.id, x]));
  // by hand: two cleared TypeScript runs and one cleared branding run; the retreat is worth nothing
  const ts = d.r1!.xp + d.r2!.xp + LEARN_XP, brand = d.r3!.xp + LEARN_XP;
  expect(d.r4!.xp).toBe(0);
  const code = s.guilds.find((g) => g.id === "code")!, arts = s.guilds.find((g) => g.id === "arts")!;
  expect(code.xp).toBe(ts + FOUND_XP);
  expect(arts.xp).toBe(brand + FOUND_XP);
  expect(s.character.xp).toBe(ts + brand + 2 * FOUND_XP);
  expect(s.character.xp).toBe(s.guilds.reduce((n, g) => n + g.xp, 0));
  for (const x of [s.character, ...s.guilds.filter((g) => g.founded)]) expect(x.level).toBe(levelOf(x.xp).level);
  expect(s.guilds.find((g) => g.id === "media")!.level).toBe(0); // not founded
  expect(s.totals).toMatchObject({ runs: 4, cleared: 3, retreat: 1 });
  rmSync(home, { recursive: true }); rmSync(p, { recursive: true });
});

test("a hand-founded guild counts as founded at once", () => {
  const home = scratch();
  mkdirSync(join(home, ".kaizen"));
  writeFileSync(gameFile(home), JSON.stringify({ guilds: [{ id: "cooks", name: "Guild of Cooks", skills: [{ id: "baking", name: "Baking" }] }] }));
  const s = gameState({ home, projects: [] });
  const g = s.guilds.find((x) => x.id === "cooks")!;
  expect(g.founded).toBe(true);
  expect(g.xp).toBe(FOUND_XP);
  expect(g.skills[0]!.learned).toBe(false);
  rmSync(home, { recursive: true });
});

// Hash of every file under a dir: name, size and content.
const hashTree = (root: string): string => {
  const h = createHash("sha256");
  const walk = (d: string) => { for (const n of readdirSync(d).sort()) { const f = join(d, n); statSync(f).isDirectory() ? walk(f) : h.update(f + readFileSync(f)); } };
  walk(root);
  return h.digest("hex");
};

test("gameState reads run folders and never writes them; only game.json is created", () => {
  const home = scratch(), p = scratch();
  run(p, "r1", { request: "Fix the TypeScript parser", files: ["a.ts"], review: "## Findings\n1. x: low: y. z.\n", fixes: 1 });
  run(p, "r2", { request: "Write the docs", track: "writing", stage: "build" });
  writeFileSync(join(p, ".kaizen", "runs", "r2", "progress.md"), "- done: a\n- doing: b\n- todo: c\n");
  const before = hashTree(p);
  expect(existsSync(gameFile(home))).toBe(false);
  const out = gameState({ home, projects: [p] });
  gameState({ home, projects: [p] });
  expect(hashTree(p)).toBe(before);
  expect(out.dungeons.find((d) => d.id === "r2")).toMatchObject({ stage: "build", work: { done: 1, items: 3 } });
  expect(out.dungeons.find((d) => d.id === "r1")!.work).toBeNull();
  expect(existsSync(gameFile(home))).toBe(true);
  expect(readGame(home)).toEqual(defaultGame());
  rmSync(home, { recursive: true }); rmSync(p, { recursive: true });
});

test("a broken game.json reads as the defaults and is left alone", () => {
  const home = scratch();
  mkdirSync(join(home, ".kaizen"));
  writeFileSync(gameFile(home), "{ not json");
  expect(readGame(home)).toEqual(defaultGame());
  expect(readFileSync(gameFile(home), "utf8")).toBe("{ not json");
  rmSync(home, { recursive: true });
});

test("every catalog guild and skill id is unique and each guild has a general skill", () => {
  const ids = CATALOG.flatMap((g) => g.skills.map((s) => s.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(CATALOG.map((g) => g.id)).size).toBe(CATALOG.length);
  for (const g of CATALOG) expect(g.skills.some((s) => s.id === `${g.id}-general`)).toBe(true);
});

test("a hand guild or skill reusing a taken id is skipped, so no XP counts twice", () => {
  const home = scratch(), p = scratch();
  mkdirSync(join(home, ".kaizen"));
  writeFileSync(gameFile(home), JSON.stringify({ guilds: [
    { id: "code", name: "Second Code", skills: [{ id: "x1", name: "X" }] },
    { id: "mine", name: "Mine", skills: [{ id: "typescript", name: "TS again" }, { id: "cooking", name: "Cooking" }] },
  ] }));
  run(p, "r1", { request: "Fix the TypeScript parser", files: ["a.ts"] });
  const s = gameState({ home, projects: [p] });
  expect(s.guilds.filter((g) => g.id === "code")).toHaveLength(1);
  const mine = s.guilds.find((g) => g.id === "mine")!;
  expect(mine.skills.map((k) => k.id)).toEqual(["cooking"]);
  expect(mine.xp).toBe(FOUND_XP);
  const ts = s.guilds.flatMap((g) => g.skills).filter((k) => k.id === "typescript");
  expect(ts).toHaveLength(1);
  expect(s.character.xp).toBe(s.guilds.reduce((n, g) => n + g.xp, 0));
  rmSync(home, { recursive: true }); rmSync(p, { recursive: true });
});

test("the cached state is reused until a run file changes or a minute passes", () => {
  const home = scratch(), p = scratch();
  run(p, "r1", { request: "Fix the TypeScript parser", files: ["a.ts"] });
  const now = Date.now();
  const a = cachedGameState({ home, projects: [p], now });
  expect(cachedGameState({ home, projects: [p], now: now + 1000 })).toBe(a);
  expect(cachedGameState({ home, projects: [p], now: now + CACHE_MS + 1 })).not.toBe(a);
  const b = cachedGameState({ home, projects: [p], now: now + CACHE_MS + 2 });
  run(p, "r2", { request: "Write the docs", track: "writing" });
  const c = cachedGameState({ home, projects: [p], now: now + CACHE_MS + 3 });
  expect(c).not.toBe(b);
  expect(c.totals.runs).toBe(2);
  rmSync(home, { recursive: true }); rmSync(p, { recursive: true });
});
