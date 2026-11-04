import { expect, test } from "bun:test";
import { GAP, ROW_GAP, MAX_FLOORS, MAX_WINGS, floorsOf, townScript, wingsOf, type TownGuild } from "../web/town-script.ts";
import { gameState } from "./game.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const g = (id: string, founded: boolean, level: number, learned = 0): TownGuild => ({ id, name: id, founded, level, skills: Array.from({ length: learned + 1 }, (_, i) => ({ learned: i < learned })) });

// G-07
test("one building per guild, in order, an unfounded guild is a plot", () => {
  const t = townScript([g("a", true, 5, 2), g("b", false, 0), g("c", true, 1, 0)]);
  expect(t.buildings.map((b) => b.id)).toEqual(["a", "b", "c"]);
  expect(t.buildings.map((b) => b.founded)).toEqual([true, false, true]);
  expect(t.buildings[1]).toMatchObject({ floors: 0, wings: 0 });
  expect(t.buildings[0]).toMatchObject({ floors: 2, wings: 2 });
  expect(t.buildings[2]).toMatchObject({ floors: 1, wings: 0 });
});

test("floors never fall as the level rises and stop at the cap; wings stop at theirs", () => {
  let prev = 0;
  for (let level = 0; level < 200; level++) { const f = floorsOf(true, level); expect(f).toBeGreaterThanOrEqual(prev); expect(f).toBeLessThanOrEqual(MAX_FLOORS); prev = f; }
  expect(floorsOf(true, 1)).toBe(1);
  expect(floorsOf(true, 3)).toBe(2);
  expect(floorsOf(true, 15)).toBe(MAX_FLOORS);
  expect(floorsOf(true, 1000)).toBe(MAX_FLOORS);
  expect(floorsOf(false, 50)).toBe(0);
  expect(wingsOf(true, 9)).toBe(MAX_WINGS);
  expect(wingsOf(true, 0)).toBe(0);
  expect(wingsOf(false, 5)).toBe(0);
});

test("buildings sit on a grid that wraps by the column count", () => {
  const gs = Array.from({ length: 8 }, (_, i) => g(`g${i}`, true, 1));
  const five = townScript(gs, 5), three = townScript(gs, 3);
  expect([five.cols, five.rows, three.cols, three.rows]).toEqual([5, 2, 3, 3]);
  expect(five.buildings[5]).toMatchObject({ col: 0, row: 1, x: 0, z: -ROW_GAP });
  expect(three.buildings[4]).toMatchObject({ col: 1, row: 1, x: GAP, z: -ROW_GAP });
  expect(townScript([], 5)).toMatchObject({ buildings: [], rows: 1 });
});

test("the town covers every guild the engine reports", () => {
  const s = gameState({ home: mkdtempSync(join(tmpdir(), "kz-ts-")), projects: [] });
  const t = townScript(s.guilds);
  expect(t.buildings.map((b) => b.id)).toEqual(s.guilds.map((x) => x.id));
});
