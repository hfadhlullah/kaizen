import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The game's two writes over HTTP, on a scratch board and a scratch HOME: only the board's own
// page may write, a JSON body is required, and the next /game/state shows the change.
test("game writes: guarded, and visible at once", async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "kz-gh-")));
  mkdirSync(join(home, ".claude"), { recursive: true });
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  const port = 20000 + Math.floor(Math.random() * 20000);
  const p = Bun.spawn([process.execPath, join(import.meta.dir, "install.ts"), "web", "--foreground", "--no-open", "--port", String(port)],
    { env: { ...process.env, HOME: home, USERPROFILE: home, KAIZEN_HOME: join(home, "kz") }, stdout: "ignore", stderr: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/")).ok) break; } catch { /* not up yet */ } await Bun.sleep(100); }
    const post = (path: string, body: unknown, h: Record<string, string> = {}) =>
      fetch(base + path, { method: "POST", headers: { origin: base, "content-type": "application/json", ...h }, body: JSON.stringify(body) });
    const ids = async () => ((await (await fetch(base + "/game/state")).json()) as { guilds: { id: string; skills: { id: string }[] }[] }).guilds;
    const file = join(home, ".kaizen", "game.json");

    expect((await post("/game/found", { name: "Guild of Cooks" }, { "content-type": "text/plain" })).status).toBe(415);
    expect((await post("/game/found", { name: "Guild of Cooks" }, { origin: "http://evil.example" })).status).toBe(403);
    expect((await post("/game/found", { name: "Guild of Cooks" }, { origin: `http://127.0.0.1:${port + 1}` })).status).toBe(403);
    expect((await ids()).map((g) => g.id)).not.toContain("guild-of-cooks");

    const ok = await post("/game/found", { name: "Guild of Cooks", skills: ["Baking"] });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, id: "guild-of-cooks" });
    expect((await ids()).find((g) => g.id === "guild-of-cooks")!.skills.map((s) => s.id)).toEqual(["baking"]);

    expect((await post("/game/found", { name: "Guild of Cooks" })).status).toBe(400);
    expect((await post("/game/move", { skill: "baking", guild: "nope" })).status).toBe(400);
    const mv = await post("/game/move", { skill: "baking", guild: "arts" });
    expect(mv.status).toBe(200);
    expect((await ids()).find((g) => g.id === "arts")!.skills.map((s) => s.id)).toContain("baking");
    expect(JSON.parse(readFileSync(file, "utf8")).moves).toEqual({ baking: "arts" });
    expect((await post("/game/move", { skill: "baking", guild: "guild-of-cooks" })).status).toBe(200);
    expect(JSON.parse(readFileSync(file, "utf8")).moves).toEqual({});
    expect((await fetch(base + "/game/found")).status).not.toBe(200); // GET does not write

    // the hero's look: same guard, only whitelisted values, and the next state shows it
    const lookNow = async () => ((await (await fetch(base + "/game/state")).json()) as { game: { look: Record<string, unknown> } }).game.look;
    expect((await post("/game/look", { look: { hair: "bob" } }, { "content-type": "text/plain" })).status).toBe(415);
    expect((await post("/game/look", { look: { hair: "bob" } }, { origin: "http://evil.example" })).status).toBe(403);
    expect((await post("/game/look", { look: { hair: "mohawk" } })).status).toBe(400);
    expect((await post("/game/look", { look: { skinColor: "red" } })).status).toBe(400);
    expect((await post("/game/look", { nope: 1 })).status).toBe(400);
    expect((await lookNow()).hair).not.toBe("bob");
    const lk = await post("/game/look", { look: { hair: "bob", beard: "viking", tall: 0.4, skinColor: "#112233" } });
    expect(lk.status).toBe(200);
    expect(await lk.json()).toMatchObject({ ok: true, look: { hair: "bob", beard: "viking", tall: 0.4 } });
    expect(await lookNow()).toMatchObject({ hair: "bob", beard: "viking", tall: 0.4, skinColor: "#112233" });
    expect(JSON.parse(readFileSync(file, "utf8")).guilds.length).toBeGreaterThan(0); // the other keys are still there
  } finally { p.kill(); await p.exited; }
}, 30_000);

// The 3D scenes over HTTP: nothing downloads until the page asks (POST), the POST is guarded like the other
// writes, and only the three allow-listed files are served from the assets folder.
test("game scenes: no download unasked, guarded POST, allow-listed files only", async () => {
  const { createHash } = await import("node:crypto");
  const files: Record<string, Uint8Array> = { "forest.glb": new Uint8Array([1, 2, 3]), "dungeon.glb": new Uint8Array([4, 5]), "town.glb": new Uint8Array([6]), "hero.glb": new Uint8Array([8, 8]) };
  const man = JSON.stringify({ version: 1, files: Object.fromEntries(Object.entries(files).map(([n, b]) => [n, { sha256: createHash("sha256").update(b).digest("hex"), size: b.length }])) });
  const hits: string[] = [];
  const rel = Bun.serve({ port: 0, fetch(req) { const n = new URL(req.url).pathname.slice(1); hits.push(n); return n === "manifest.json" ? new Response(man) : files[n] ? new Response(files[n]) : new Response("no", { status: 404 }); } });
  const home = realpathSync(mkdtempSync(join(tmpdir(), "kz-gs-")));
  mkdirSync(join(home, ".claude"), { recursive: true });
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  const port = 20000 + Math.floor(Math.random() * 20000);
  const p = Bun.spawn([process.execPath, join(import.meta.dir, "install.ts"), "web", "--foreground", "--no-open", "--port", String(port)],
    { env: { ...process.env, HOME: home, USERPROFILE: home, KAIZEN_HOME: join(home, "kz"), KAIZEN_ASSETS_URL: `http://localhost:${rel.port}` }, stdout: "ignore", stderr: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/")).ok) break; } catch { /* not up yet */ } await Bun.sleep(100); }
    const post = (h: Record<string, string> = {}) => fetch(base + "/game/assets", { method: "POST", headers: { origin: base, "content-type": "application/json", ...h }, body: "{}" });
    const scenes = async () => ((await (await fetch(base + "/game/state")).json()) as { scenes: { installed: string[]; missing: string[] } }).scenes;

    expect(await scenes()).toEqual({ installed: [], missing: ["forest", "dungeon", "town", "hero"] });
    expect((await fetch(base + "/game/assets/forest.glb")).status).toBe(404);
    await fetch(base + "/game"); await fetch(base + "/scenes.js");
    expect(hits).toEqual([]);                                                       // opening the page downloads nothing

    expect((await post({ "content-type": "text/plain" })).status).toBe(415);
    expect((await post({ origin: "http://evil.example" })).status).toBe(403);
    expect(hits).toEqual([]);

    const ok = await post();
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, installed: ["forest", "dungeon", "town", "hero"] });
    const g = await fetch(base + "/game/assets/forest.glb");
    expect(g.status).toBe(200);
    expect(g.headers.get("content-type")).toBe("model/gltf-binary");
    expect(new Uint8Array(await g.arrayBuffer())).toEqual(files["forest.glb"]!);
    for (const bad of ["manifest.json", "..%2Fmanifest.json", "%2e%2e/game.json", "forest.glb%00", "x.glb", "forest.gltf", "town.glb/x"]) expect((await fetch(`${base}/game/assets/${bad}`)).status).toBe(404);
    expect((await fetch(base + "/game/assets/forest.glb", { method: "DELETE" })).status).not.toBe(200);
  } finally { p.kill(); await p.exited; rel.stop(true); }
}, 30_000);
