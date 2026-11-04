import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The Game page lists the art in assets/game/ in /game/state and serves it from /game/art/<name>
// only for a plain, listed file name. Scratch HOME; nothing is written to assets/.
test("board lists game art and refuses unlisted or odd names", async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "kz-art-")));
  mkdirSync(join(home, ".claude"), { recursive: true });
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  const port = 20000 + Math.floor(Math.random() * 20000);
  const p = Bun.spawn([process.execPath, join(import.meta.dir, "install.ts"), "web", "--foreground", "--no-open", "--port", String(port)],
    { env: { ...process.env, HOME: home, USERPROFILE: home, KAIZEN_HOME: join(home, "kz") }, stdout: "ignore", stderr: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/")).ok) break; } catch { /* not up yet */ } await Bun.sleep(100); }
    const state = await (await fetch(base + "/game/state")).json() as { art: string[] };
    expect(Array.isArray(state.art)).toBe(true);
    for (const name of ["nope.png", "..%2Fgame.ts", "hero.exe", "PROMPTS.md"]) expect((await fetch(`${base}/game/art/${name}`)).status).toBe(404);
  } finally { p.kill(); await p.exited; }
}, 30_000);
