import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultGame, guildsOf } from "./game.ts";
import { SCENE_FILE } from "./game-assets.ts";
import MAP from "../web/monster-map.json";
import { FAMILIES, GENERIC, MODELS, groupOf, monsterOf } from "../web/monsters.ts";

// G-02
test("every guild, and a guild nobody planned for, maps to a minion and a boss that exist", () => {
  const guilds = guildsOf(defaultGame()).map((g) => g.id);
  expect(guilds.length).toBeGreaterThanOrEqual(8);
  for (const g of [...guilds, "guild-of-cooks", "", "constructor", "__proto__", "toString"]) for (const boss of [false, true]) {
    const id = monsterOf(g, boss);
    expect(MODELS[id], `${g} ${boss}`).toBeTruthy();
    expect(SCENE_FILE.test(`monster-${id}.glb`), id).toBe(true);
  }
  for (const g of guilds) expect(FAMILIES[g], g).toBeTruthy();                       // every built-in guild has its own family
  expect(monsterOf("code", false)).toBe(FAMILIES.code!.minion);
  expect(monsterOf("code", true)).toBe(FAMILIES.code!.boss);
  expect(monsterOf("nope", true)).toBe(GENERIC.boss);
});

test("every model has a source folder with clip names, and nothing in the map is unused or unlisted", () => {
  for (const id of Object.keys(MODELS)) {
    const c = MAP.clips[groupOf(id)] as Record<string, unknown>;
    for (const k of ["idle", "attack", "die"]) expect(typeof c[k], `${id} ${k}`).toBe("string");
    expect(/^[a-z0-9]{1,16}$/.test(id), id).toBe(true);
  }
  const used = new Set([...Object.values(FAMILIES), GENERIC].flatMap((f) => [f.minion, f.boss]));
  expect([...used].sort()).toEqual(Object.keys(MODELS).sort());                       // the map holds exactly the models a guild uses
  const lic = readFileSync(join(import.meta.dir, "..", "game-assets", "LICENSES.md"), "utf8");
  for (const src of Object.values(MODELS)) expect(lic.includes(src.split("/")[1]!), src).toBe(true);
});

// G-04: a monster file that is missing, or cannot be read, leaves that kind without a model (the dungeon keeps its cone), and never throws.
test("a missing or unreadable monster file gives no model for that kind and no error", async () => {
  const { loadFamily } = await import("../web/monsters.ts");
  const asked: string[] = [];
  const kit = (bad: (n: string) => unknown) => ({ gltf: async (n: string) => { asked.push(n); return bad(n) as never; } }) as never;
  // nothing downloaded: no file is even asked for
  const none = await loadFamily(kit(() => null), [], "code");
  expect(asked).toEqual([]); expect(none(false)).toBeNull(); expect(none(true)).toBeNull();
  // files listed but the loader could not read them (what scene-kit returns for a corrupt or truncated file)
  const unreadable = await loadFamily(kit(() => null), ["monster-spikyblob", "monster-alien"], "code");
  expect(unreadable(false)).toBeNull(); expect(unreadable(true)).toBeNull();
  // only the minion is there: the boss stays a cone
  const half = await loadFamily(kit(() => null), ["monster-spikyblob"], "code");
  expect(asked.at(-1)).toBe("monster-spikyblob"); expect(half(true)).toBeNull();
});

test("the real glTF loader rejects garbage and a truncated file instead of returning a model", async () => {
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const real = await Bun.file(join(import.meta.dir, "..", "game-assets", "dist", "monster-wizard.glb")).arrayBuffer().catch(() => null);
  const parse = (buf: ArrayBuffer) => new Promise<string>((ok) => { try { new GLTFLoader().parse(buf, "", () => ok("model"), () => ok("error")); } catch { ok("error"); } });
  expect(await parse(new TextEncoder().encode("not a glb at all").buffer as ArrayBuffer)).toBe("error");
  expect(await parse(new Uint8Array(0).buffer)).toBe("error");
  if (real) expect(await parse(real.slice(0, Math.floor(real.byteLength / 2)))).toBe("error");   // the built file, cut in half (when it has been built)
});
