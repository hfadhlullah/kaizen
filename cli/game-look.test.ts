import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BEARDS, HAIRS, HERO_DEFAULTS, LOOK_KEYS, PRESETS, checkLook } from "../web/hero-look.ts";
import { gameFile, readGame, setLook } from "./game.ts";

const scratch = () => mkdtempSync(join(tmpdir(), "kz-gl-"));
const onDisk = (home: string) => JSON.parse(readFileSync(gameFile(home), "utf8"));

// G-04
test("checkLook accepts good values and refuses every bad one as a whole", () => {
  expect(checkLook({ hair: "long", beard: "viking", gender: -1, tall: 0.5, build: -1, muscle: 1, skinColor: "#A1B2C3" })).toEqual({ ok: true, look: { hair: "long", beard: "viking", gender: -1, tall: 0.5, build: -1, muscle: 1, skinColor: "#a1b2c3" } });
  expect(checkLook({ tall: 0.12345678 })).toEqual({ ok: true, look: { tall: 0.123 } });
  const bad: unknown[] = [null, [], "x", 5, { nope: 1 }, { hair: "mohawk" }, { hair: 3 }, { beard: "goat" }, { tall: 1.01 }, { tall: -1.01 }, { gender: 1.5 }, { gender: "male" }, { gender: -2 }, { tall: "0.5" }, { tall: NaN }, { tall: Infinity }, { build: null },
    { skinColor: "red" }, { skinColor: "#fff" }, { skinColor: "#12345g" }, { skinColor: "#1234567" }, { skinColor: "url(javascript:1)" }, { hairColor: "#a1b2c3; background:red" }, { eyeColor: 123 },
    { hair: "short", tall: 9 }, { __proto__: { hair: "short" }, constructor: 1 }, { hair: "short", extra: 1 }];
  for (const b of bad) expect((checkLook(b) as { ok: boolean }).ok, JSON.stringify(b)).toBe(false);
  expect(Object.keys(HERO_DEFAULTS).sort()).toEqual([...LOOK_KEYS].sort());
  for (const p of PRESETS) expect(checkLook(p.look).ok, p.name).toBe(true);
  expect(PRESETS.length).toBeGreaterThanOrEqual(6);
  expect(HAIRS).toContain(HERO_DEFAULTS.hair); expect(BEARDS).toContain(HERO_DEFAULTS.beard);
});

test("setLook writes only the look keys, keeps every other key and leaves a backup", () => {
  const home = scratch();
  mkdirSync(join(home, ".kaizen"));
  const start = { version: 1, name: "Ada", look: { hair: "long", eyes: "round", mouth: "smile", body: "average", height: 1, extraLook: "keep" }, guilds: [{ id: "g", name: "G", skills: [] }], moves: { a: "b" }, runs: { r1: "s" }, future: { keep: [1, 2] } };
  writeFileSync(gameFile(home), JSON.stringify(start));
  const r = setLook({ hair: "bob", tall: 0.3, skinColor: "#112233" }, home);
  expect(r.ok).toBe(true);
  const now = onDisk(home);
  expect(now.look).toEqual({ hair: "bob", eyes: "round", mouth: "smile", body: "average", height: 1, extraLook: "keep", tall: 0.3, skinColor: "#112233" });
  expect({ ...now, look: undefined }).toEqual({ ...start, look: undefined });
  expect(JSON.parse(readFileSync(gameFile(home) + ".bak", "utf8"))).toEqual(start);
  expect(readdirSync(join(home, ".kaizen")).sort()).toEqual(["game.json", "game.json.bak"]);
  // the answer is the whole look, defaults filled in
  expect((r as { look: { beard: string } }).look.beard).toBe("none");
});

test("setLook refuses a bad patch without touching the file, and an unreadable game.json is never overwritten", () => {
  const home = scratch();
  mkdirSync(join(home, ".kaizen"));
  writeFileSync(gameFile(home), JSON.stringify({ version: 1, name: "Ada", look: {}, guilds: [], moves: {}, runs: {} }));
  const before = readFileSync(gameFile(home), "utf8");
  for (const bad of [{ hair: "mohawk" }, { tall: 2 }, { skinColor: "x" }, {}, null, { hair: "short", wat: 1 }]) expect(setLook(bad, home).ok).toBe(false);
  expect(readFileSync(gameFile(home), "utf8")).toBe(before);
  expect(existsSync(gameFile(home) + ".bak")).toBe(false);
  for (const text of ["{ nope", "[]", "42"]) {
    writeFileSync(gameFile(home), text);
    const r = setLook({ hair: "bob" }, home);
    expect(r.ok).toBe(false); expect((r as { error: string }).error).toContain("nothing was written");
    expect(readFileSync(gameFile(home), "utf8")).toBe(text);
  }
});

test("a look written with new keys reads back, and an old game.json gets the defaults for them", () => {
  const home = scratch();
  mkdirSync(join(home, ".kaizen"));
  writeFileSync(gameFile(home), JSON.stringify({ version: 1, name: "Old", look: { hair: "short" }, guilds: [], moves: {}, runs: {} }));
  expect(readGame(home).look).toMatchObject({ beard: "none", gender: 0, tall: 0, build: 0, muscle: 0, skinColor: "#e0ac8a" });
  setLook({ beard: "viking", muscle: 1 }, home);
  expect(readGame(home).look).toMatchObject({ beard: "viking", muscle: 1, tall: 0 });
});

test("a hand-edited game.json cannot push a bad hero value into the page", () => {
  const home = scratch();
  mkdirSync(join(home, ".kaizen"));
  writeFileSync(gameFile(home), JSON.stringify({ version: 1, name: "Ed", look: { hair: "mohawk", beard: 7, tall: "x", build: 9, muscle: 0.5, skinColor: "red; background:url(x)", hairColor: "#ABCDEF", eyeColor: null, eyes: "round", extra: "kept" }, guilds: [], moves: {}, runs: {} }));
  const look = readGame(home).look as unknown as Record<string, unknown>;
  expect(look).toMatchObject({ hair: "short", beard: "none", tall: 0, build: 0, muscle: 0.5, skinColor: "#e0ac8a", hairColor: "#ABCDEF", eyeColor: "#3b6b8f", eyes: "round", extra: "kept" });
  // the file itself is not rewritten by reading, and a later write keeps what it did not touch
  const before = readFileSync(gameFile(home), "utf8");
  readGame(home); expect(readFileSync(gameFile(home), "utf8")).toBe(before);
  expect(setLook({ hair: "bob" }, home).ok).toBe(true);
  expect(onDisk(home).look).toMatchObject({ hair: "bob", tall: "x", extra: "kept" });
  writeFileSync(gameFile(home), JSON.stringify({ version: 1, name: "Ed", look: "nonsense", guilds: [], moves: {}, runs: {} }));
  expect(readGame(home).look).toMatchObject({ hair: "short", beard: "none" });
});
