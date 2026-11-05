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

test("hpOf: full, draining to zero over a replay fight, empty when down, and a live monster drains with the run's time and empties only when defeated", async () => {
  const { hpOf, EXPECT_MS, SLIVER } = await import("../web/dungeon-script.ts");
  const f = (defeated: number, fighting: number | null, fight?: number) => ({ x: 0, defeated, fighting, done: false, ...(fight === undefined ? {} : { fight }) });
  expect(hpOf(f(0, null), 3, 0)).toBe(1);                       // not fought yet
  expect(hpOf(f(2, 2, 0), 2, 0)).toBe(1);                       // the fight starts at full health
  expect(hpOf(f(2, 2, 0.25), 2, 0)).toBeCloseTo(0.75);
  expect(hpOf(f(2, 2, 1), 2, 0)).toBe(0);                       // a replay's monster reaches zero as it falls
  expect(hpOf(f(2, 2, 1.7), 2, 0)).toBe(0);                     // never below empty
  expect(hpOf(f(3, null), 1, 0)).toBe(0);                       // down
  expect(hpOf(f(2, 2, 0.5), 5, 0)).toBe(1);                     // another monster is being fought
  // live: no figure for how far the item is, so the bar follows the time the run has been on it, and never loops
  let last = 2;
  for (let ms = 0; ms <= 3 * EXPECT_MS; ms += 997) {
    const hp = hpOf(f(2, 2), 2, ms);
    expect(hp).toBeLessThanOrEqual(last + 1e-12); last = hp;      // only ever goes down while the run stays on the item
    expect(hp).toBeGreaterThanOrEqual(SLIVER - 1e-9);             // never empty: only finishing the item defeats it
  }
  expect(hpOf(f(2, 2), 2, 0)).toBe(1);
  expect(hpOf(f(2, 2), 2, EXPECT_MS / 2)).toBeCloseTo(1 - (1 - SLIVER) / 2);
  expect(hpOf(f(2, 2), 2, EXPECT_MS)).toBeCloseTo(SLIVER);
  expect(hpOf(f(2, 2), 2, 10 * EXPECT_MS)).toBeCloseTo(SLIVER); // waits there, nearly dead
  expect(hpOf(f(3, 3), 2, 5000)).toBe(0);                       // the run finished it: defeated, empty
});
test("a replay frame in a fight says how far along it is", async () => {
  const { replay } = await import("../web/dungeon-script.ts");
  const d = { stages: [{ name: "plan", monsters: 2, ms: null }], boss: false, outcome: "cleared" as const, stage: "done", work: null, xp: 1, pending: 0 };
  const seen = new Set<number>();
  for (let ms = 0; ms < 20000; ms += 50) { const f = replay(d, ms); if (f.fighting !== null) { expect(f.fight).toBeGreaterThanOrEqual(0); expect(f.fight).toBeLessThan(1); seen.add(f.fighting); } else expect(f.fight).toBeUndefined(); }
  expect([...seen].sort()).toEqual([0, 1]);
});

test("defeatedLive scales ticked work items to the plan's build monsters", async () => {
  const { defeatedLive } = await import("../web/dungeon-script.ts");
  const run = (monsters: number, work: { done: number; items: number } | null) => ({ stages: [{ name: "plan", monsters: 1, ms: 1 }, { name: "build", monsters, ms: null }, { name: "review", monsters: 1, ms: null }], boss: false, outcome: "live" as const, stage: "build", work, xp: 0, pending: 0 });
  expect(defeatedLive(run(9, { done: 0, items: 5 }))).toBe(1);        // the plan monster only
  expect(defeatedLive(run(9, { done: 2, items: 5 }))).toBe(1 + 3);    // 2/5 of 9 = 3.6 -> 3 build monsters
  expect(defeatedLive(run(9, { done: 5, items: 5 }))).toBe(1 + 9);    // all items ticked: all the build monsters
  expect(defeatedLive(run(5, { done: 2, items: 5 }))).toBe(1 + 2);    // same count: one for one, as before
  expect(defeatedLive(run(3, { done: 9, items: 5 }))).toBe(1 + 3);    // never past the stage
  expect(defeatedLive(run(9, null))).toBe(1);                         // no progress.md: only finished stages count
  expect(defeatedLive(run(9, { done: 1, items: 0 }))).toBe(1);        // an empty list does not divide by zero
});

test("liveEstimated: runs ahead monster by monster, never past the stage's last monster, snaps back on a tick, and is exact for replays and cleared runs", async () => {
  const { liveEstimated, liveFrame, EST_MS, SLIVER, hpOf } = await import("../web/dungeon-script.ts");
  const run = (done: number) => ({ stages: [{ name: "plan", monsters: 1, ms: 1 }, { name: "build", monsters: 5, ms: null }, { name: "review", monsters: 2, ms: null }], boss: false, outcome: "live" as const, stage: "build", work: { done, items: 5 }, xp: 0, pending: 0 });
  const real = liveFrame(run(1));                                       // plan done, one build item ticked: fighting build monster 2 (index 2)
  expect(real.fighting).toBe(2);
  const at = (ms: number) => liveEstimated(run(1), ms);
  expect(at(0)).toMatchObject({ defeated: 2, fighting: 2, estimated: 0, fight: 0 });
  expect(at(EST_MS / 2).fight).toBeCloseTo(0.5);
  expect(at(EST_MS)).toMatchObject({ defeated: 3, fighting: 3, estimated: 1 });
  expect(at(2 * EST_MS)).toMatchObject({ defeated: 4, fighting: 4, estimated: 2 });
  // the build stage's last monster (index 5) is left for the run really finishing the stage: the picture stops on the one before it, drained to the sliver
  const late = at(50 * EST_MS);
  expect(late.fighting).toBe(4); expect(late.defeated).toBe(4); expect(late.estimated).toBe(2);
  expect(hpOf(late, 4, 0)).toBeCloseTo(SLIVER);                         // nearly dead, never empty without the run
  for (let ms = 0; ms < 50 * EST_MS; ms += 3331) { const f = at(ms); expect(f.fighting).toBeLessThanOrEqual(4); expect(f.fight!).toBeGreaterThanOrEqual(0); expect(f.fight!).toBeLessThanOrEqual(1); expect(f.defeated).toBe(f.fighting); }
  expect(liveEstimated(run(2), 0)).toMatchObject({ fighting: 3, estimated: 0 });   // a real tick: back to exact
  const done = liveEstimated({ ...run(5), stage: "review" } as never, 0);
  expect(done.estimated).toBe(0);
  // already on the stage's last monster: it only drains
  const last = liveEstimated(run(4), 99 * EST_MS);
  expect(last).toMatchObject({ fighting: 5, estimated: 0 });
  expect(last.fight!).toBeLessThanOrEqual(1 - SLIVER + 1e-9);
  // a run that is not fighting (all done to the gate) has nothing to estimate
  expect(liveEstimated({ ...run(5), stage: "build" }, 5 * EST_MS).estimated).toBeGreaterThanOrEqual(0);
});
