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
  } finally { p.kill(); await p.exited; }
}, 30_000);
