import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dungeonOf, defaultGame, workOf } from "./game.ts";
import { dungeonScript, defeatedLive, liveFrame, playable, replay, fightMs, type DungeonIn } from "../web/dungeon-script.ts";

const st = (name: string, monsters: number, ms: number | null = 1000) => ({ name, monsters, ms });
const base = (over: Partial<DungeonIn> = {}): DungeonIn => ({
  stages: [st("plan", 1), st("build", 5), st("review", 3), st("wave 1", 1, null)],
  boss: true, outcome: "cleared", stage: "done", work: { done: 5, items: 5 }, xp: 300, pending: 0, ...over,
});

// G-01: the scene is exactly what the engine says.
test("script counts match the engine's stages, waves and boss", () => {
  const d = base(), s = dungeonScript(d);
  expect(s.segs.map((x) => x.monsters)).toEqual([1, 5, 3, 1]);
  expect(s.segs.filter((x) => x.kind === "wave").length).toBe(1);
  expect(s.monsters.length).toBe(10);
  expect(s.monsters.filter((m) => m.boss).length).toBe(1);
  expect(s.monsters.find((m) => m.boss)!.stage).toBe(2);
  expect(dungeonScript(base({ boss: false })).monsters.some((m) => m.boss)).toBe(false);
});

test("script matches the engine on a scratch run with fix rounds and findings", () => {
  const home = mkdtempSync(join(tmpdir(), "kz-ds-")), proj = join(home, "p"), run = join(proj, ".kaizen", "runs", "2026-01-01-x");
  mkdirSync(join(run, "05-iterations"), { recursive: true });
  writeFileSync(join(run, "state.json"), JSON.stringify({ id: "2026-01-01-x", stage: "done", track: "code" }));
  writeFileSync(join(run, "00-request.md"), "Add a thing");
  writeFileSync(join(run, "01-plan.md"), "## Work list\n- a\n- b\n- c\n");
  writeFileSync(join(run, "04-review.md"), "# Review\n\n### R-01 first [high]\nx\n\n### R-02 second [low]\ny\n");
  writeFileSync(join(run, "05-iterations", "01-fix.md"), "fix");
  const d = dungeonOf(join(proj, ".kaizen"), proj, "2026-01-01-x", defaultGame())!, s = dungeonScript(d);
  expect(s.segs.map((x) => x.monsters)).toEqual(d.stages.map((x) => x.monsters));
  expect(s.segs.filter((x) => x.kind === "wave").length).toBe(d.waves);
  expect(s.monsters.some((m) => m.boss)).toBe(d.boss);
  expect(s.total).toBe(d.monsters);
});

// G-03: live runs follow the run, and invent nothing.
test("live build: ticked Work-list items are the monsters that fell", () => {
  const live = (over: Partial<DungeonIn>) => base({ outcome: "live", stage: "build", boss: false, stages: [st("plan", 1), st("build", 5), st("review", 1, null)], ...over });
  const b = live({ work: { done: 2, items: 5 } });
  expect(dungeonScript(b).reached).toBe(1);
  expect(defeatedLive(b)).toBe(1 + 2); // plan's monster, then two of five
  expect(liveFrame(b).fighting).toBe(3);
  expect(defeatedLive(live({ work: null }))).toBe(1); // no progress.md: only the finished plan counts
  const r = live({ stage: "review", work: { done: 5, items: 5 }, boss: true });
  expect(dungeonScript(r).reached).toBe(2);
  expect(defeatedLive(r)).toBe(6); // plan and build down, the review still up
  expect(defeatedLive(live({ stage: "plan", work: null }))).toBe(0);
});

test("live review with a fix round fights the newest wave", () => {
  const d = base({ outcome: "live", stage: "review" });
  expect(dungeonScript(d).reached).toBe(3);
  expect(defeatedLive(d)).toBe(9);
});

// G-04: a replay ends where the run ended.
test("replay of a cleared run beats every monster and ends done", () => {
  const d = base();
  expect(playable(d)).toBe(10);
  const end = replay(d, 10 ** 7);
  expect(end).toMatchObject({ defeated: 10, done: true, fighting: null });
  const mid = replay(d, 8000);
  expect(mid.done).toBe(false);
  expect(mid.defeated).toBeGreaterThan(0);
  expect(mid.defeated).toBeLessThan(10);
  let prev = -1;
  for (let t = 0; t < 40_000; t += 250) { const f = replay(d, t); expect(f.x).toBeGreaterThanOrEqual(prev); prev = f.x; }
});

test("replay of a run that stopped plays only up to the stage it reached", () => {
  const d = base({ outcome: "retreat", stage: "abandoned", boss: false, stages: [st("plan", 1), st("build", 4), st("review", 2, null)] });
  expect(playable(d)).toBe(5);
  expect(replay(d, 10 ** 7)).toMatchObject({ defeated: 5, done: true });
});

test("a huge dungeon still replays in about a minute", () => {
  const d = base({ stages: [st("plan", 1), st("build", 60), st("review", 20)] });
  const ms = fightMs(81) * 81;
  expect(ms).toBeLessThan(65_000);
  expect(replay(d, 120_000).done).toBe(true);
});

test("workOf counts only the done, doing and todo lines of progress.md", () => {
  expect(workOf("- done: a\n- doing: b\n- todo: c\n- todo: d\nnotes\n")).toEqual({ done: 1, items: 4 });
  expect(workOf("")).toBeNull();
  expect(workOf("just prose\n- a bullet\n")).toBeNull();
});

// G-01 on real data: every run folder of this checkout (or, in a worktree, of the checkout it hangs
// off), where there are any; CI has none and skips.
const roots = [join(import.meta.dir, ".."), join(import.meta.dir, "..", "..", "..", "..")].filter((r) => existsSync(join(r, ".kaizen", "runs")));
test.skipIf(!roots.length)("script matches the engine on this checkout's real runs", () => {
  let seen = 0;
  for (const root of roots) for (const id of readdirSync(join(root, ".kaizen", "runs"))) {
    const d = dungeonOf(join(root, ".kaizen"), root, id, defaultGame());
    if (!d) continue;
    const s = dungeonScript(d);
    expect(s.segs.map((x) => x.monsters)).toEqual(d.stages.map((x) => x.monsters));
    expect(s.segs.filter((x) => x.kind === "wave").length).toBe(d.waves);
    expect(s.monsters.some((m) => m.boss)).toBe(d.boss);
    expect(s.total).toBe(d.monsters);
    seen++;
  }
  expect(seen).toBeGreaterThan(0);
});

test("sceneOf: stable per run, both scenes occur, about one run in three is a forest", async () => {
  const { sceneOf } = await import("../web/dungeon-script.ts");
  const ids = Array.from({ length: 300 }, (_, i) => `2026-11-04-run-${i}`);
  expect(ids.map(sceneOf)).toEqual(ids.map(sceneOf));
  const forests = ids.filter((i) => sceneOf(i) === "forest").length;
  expect(forests).toBeGreaterThan(60); expect(forests).toBeLessThan(140);
  expect(["dungeon", "forest"]).toContain(sceneOf(""));
});
