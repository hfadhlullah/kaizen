import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assetFile, assetState, assetsDir, fetchAssets, parseManifest } from "./game-assets.ts";

const scratch = () => mkdtempSync(join(tmpdir(), "kz-ga-"));
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const files = { "forest.glb": new Uint8Array([1, 2, 3, 4]), "dungeon.glb": new Uint8Array([5, 6, 7]), "town.glb": new Uint8Array([8, 9]) };
const manifest = (over: Record<string, { sha256?: string; size?: number }> = {}) =>
  JSON.stringify({ version: 1, files: Object.fromEntries(Object.entries(files).map(([n, b]) => [n, { sha256: sha(b), size: b.length, ...over[n] }])) });
// A local release: serves manifest.json and the files, counting requests.
function serve(man: string, body: Record<string, Uint8Array> = files) {
  const hits: string[] = [];
  const s = Bun.serve({ port: 0, fetch(req) {
    const n = new URL(req.url).pathname.slice(1); hits.push(n);
    if (n === "manifest.json") return new Response(man);
    return body[n] ? new Response(body[n]) : new Response("no", { status: 404 });
  } });
  return { base: `http://localhost:${s.port}`, hits, stop: () => s.stop(true) };
}

// G-05
test("fetch installs every scene and the state shows them", async () => {
  const home = scratch(), r = serve(manifest());
  try {
    expect(assetState(home).installed).toEqual([]);
    expect(await fetchAssets(home, r.base)).toEqual({ ok: true, installed: ["forest", "dungeon", "town"] });
    expect(readFileSync(join(assetsDir(home), "forest.glb"))).toEqual(Buffer.from(files["forest.glb"]));
    expect(assetFile("dungeon.glb", home)).toBe(join(assetsDir(home), "dungeon.glb"));
    expect(readdirSync(assetsDir(home)).sort()).toEqual(["dungeon.glb", "forest.glb", "manifest.json", "town.glb"]);
  } finally { r.stop(); }
});

test("a bad hash, a wrong size, a 404 and a bad manifest are refused and write nothing", async () => {
  for (const [m, body, why] of [
    [manifest({ "town.glb": { sha256: "0".repeat(64) } }), files, "sha256"],
    [manifest({ "town.glb": { size: 5 } }), files, "size"],
    [manifest(), { ...files, "dungeon.glb": undefined as never }, "404"],
    ["{ nope", files, "valid"],
    [JSON.stringify({ version: 1, files: { "../x.glb": { sha256: "0".repeat(64), size: 1 } } }), files, "valid"],
  ] as const) {
    const home = scratch(), r = serve(m, body as Record<string, Uint8Array>);
    try {
      const res = await fetchAssets(home, r.base);
      expect(res.ok).toBe(false);
      expect((res as { error: string }).error).toContain(why);
      expect(existsSync(join(assetsDir(home), "manifest.json"))).toBe(false); // nothing counts as installed
      expect(assetState(home).installed.length).toBeLessThan(3);
    } finally { r.stop(); }
  }
});

test("the manifest keeps only known names; a name outside the list is dropped, a bad entry refuses all", () => {
  const ok = parseManifest(JSON.stringify({ version: 1, files: { "forest.glb": { sha256: "a".repeat(64), size: 9 }, "evil.sh": { sha256: "a".repeat(64), size: 9 }, "../town.glb": { sha256: "a".repeat(64), size: 9 } } }));
  expect(Object.keys(ok!.files)).toEqual(["forest.glb"]);
  expect(parseManifest(JSON.stringify({ version: 1, files: { "forest.glb": { sha256: "xyz", size: 9 } } }))).toBeNull();
  expect(parseManifest(JSON.stringify({ version: 1, files: { "forest.glb": { sha256: "a".repeat(64), size: 99 * 1024 * 1024 } } }))).toBeNull();
  expect(parseManifest(JSON.stringify({ version: 2, files: {} }))).toBeNull();
});

test("assetFile only serves allow-listed names that are installed", async () => {
  const home = scratch(), r = serve(manifest());
  try {
    await fetchAssets(home, r.base);
    for (const n of ["../manifest.json", "forest.glb/../../x", "x.glb", "forest.gltf", "FOREST.glb", "", "manifest.json", ".forest.glb.part"]) expect(assetFile(n, home)).toBeNull();
    writeFileSync(join(assetsDir(home), "town.glb"), "tampered, other size");
    expect(assetFile("town.glb", home)).toBeNull();            // size no longer matches
    expect(assetState(home).missing).toEqual(["town"]);
  } finally { r.stop(); }
});

// G-07
test("reading the state downloads nothing and creates nothing", () => {
  const home = scratch();
  assetState(home); assetFile("forest.glb", home);
  expect(existsSync(join(home, ".kaizen"))).toBe(false);
});

test("a failed update keeps the scenes that were installed", async () => {
  const home = scratch(), good = serve(manifest());
  try { expect((await fetchAssets(home, good.base)).ok).toBe(true); } finally { good.stop(); }
  const v2 = { ...files, "forest.glb": new Uint8Array([9, 9, 9, 9, 9]) };
  const man2 = JSON.stringify({ version: 1, files: Object.fromEntries(Object.entries(v2).map(([n, b]) => [n, { sha256: sha(b), size: b.length }])) });
  const bad = serve(man2, { ...v2, "town.glb": undefined as never });     // forest.glb is fine, town.glb 404s
  try {
    expect((await fetchAssets(home, bad.base)).ok).toBe(false);
    expect(assetState(home).installed).toEqual(["forest", "dungeon", "town"]);          // old manifest and old files, all still match
    expect(readFileSync(join(assetsDir(home), "forest.glb"))).toEqual(Buffer.from(files["forest.glb"]));
    expect(readdirSync(assetsDir(home)).filter((n) => n.endsWith(".part"))).toEqual([]);
  } finally { bad.stop(); }
});

test("a body larger than the manifest says is cut, not read whole", async () => {
  const big = new Uint8Array(2 * 1024 * 1024);
  for (const chunked of [false, true]) {
    const s = Bun.serve({ port: 0, fetch(req) {
      const n = new URL(req.url).pathname.slice(1);
      if (n === "manifest.json") return new Response(manifest());
      if (!chunked) return new Response(big);
      return new Response(new ReadableStream({ start(c) { c.enqueue(big.slice(0, 1024 * 1024)); c.enqueue(big.slice(0, 1024 * 1024)); c.close(); } }));
    } });
    const home = scratch();
    try {
      const r = await fetchAssets(home, `http://localhost:${s.port}`);
      expect(r.ok).toBe(false);
      expect((r as { error: string }).error).toContain("size");
      expect(existsSync(join(assetsDir(home), "manifest.json"))).toBe(false);
    } finally { s.stop(true); }
  }
});

test("two downloads at once are one download", async () => {
  const home = scratch(), r = serve(manifest());
  try {
    const [a, b] = await Promise.all([fetchAssets(home, r.base), fetchAssets(home, r.base)]);
    expect(a).toEqual(b);
    expect(r.hits.filter((n) => n === "manifest.json")).toHaveLength(1);
    expect(r.hits.filter((n) => n === "forest.glb")).toHaveLength(1);
  } finally { r.stop(); }
});

// The license list and the build scripts agree: every asset the scripts name is in game-assets/LICENSES.md as
// CC0, and every asset in the list is used by a script (or is marked preview only).
test("every Poly Haven asset the scripts use is in LICENSES.md, and the other way round", () => {
  const dir = join(import.meta.dir, "..", "game-assets");
  const lic = readFileSync(join(dir, "LICENSES.md"), "utf8");
  const rows = [...lic.matchAll(/^\| ([a-z0-9_]+) \|.*\| (https:\/\/polyhaven\.com\/a\/[a-z0-9_]+) \|$/gm)];
  const ids = rows.map((m) => m[1]!);
  expect(ids.length).toBeGreaterThan(10);
  for (const m of rows) expect(m[2]).toBe(`https://polyhaven.com/a/${m[1]}`);
  expect(lic).toContain("CC0");
  const code = ["common.py", "billboards.py", "forest.py", "dungeon.py", "town.py"].map((f) => readFileSync(join(dir, "build", f), "utf8")).join("\n");
  const used = new Set(ids.filter((id) => code.includes(id)));
  const previewOnly = ids.filter((id) => !used.has(id));
  expect(previewOnly).toEqual(["sunset_forest"]);                       // lit the preview renders, never shipped
  // Any Poly Haven-looking name in a script (a texture key or a model object) must start with a listed id.
  const names = [...code.matchAll(/"([a-z][a-z0-9]*(?:_[a-z0-9]+)+)"/g)].map((m) => m[1]!)
    .filter((n) => /^(fir_sapling|tree_small|tree_stump|dead_tree|forrest|wood|stone|rock|cobble|plaster|roof|medieval|dark_)/.test(n));
  expect(names.length).toBeGreaterThan(8);
  for (const n of names) expect(ids.some((id) => n.startsWith(id)), n).toBe(true);
});
