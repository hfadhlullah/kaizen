import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Turning an off-by-default skill on needs the one-time token from GET /skills; a bare
// POST with confirm:true (what curl sends) is refused, and a token works once.
test("board refuses to turn Desktop control on without the page's one-time token", async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "kz-sk-")));
  mkdirSync(join(home, ".claude"), { recursive: true });
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  const port = 20000 + Math.floor(Math.random() * 20000);
  const p = Bun.spawn([process.execPath, join(import.meta.dir, "install.ts"), "web", "--foreground", "--no-open", "--port", String(port)],
    { env: { ...process.env, HOME: home, USERPROFILE: home, KAIZEN_HOME: join(home, "kz") }, stdout: "ignore", stderr: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/")).ok) break; } catch { /* not up yet */ } await Bun.sleep(100); }
    const post = (body: object) => fetch(base + "/skills", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ id: "kaizen-computer", on: true, ...body }) });
    const on = () => existsSync(join(home, ".kaizen", "skills-on.json")) && readFileSync(join(home, ".kaizen", "skills-on.json"), "utf8").includes("kaizen-computer");
    expect((await post({ confirm: true })).status).toBe(400);
    const { token } = await (await fetch(base + "/skills")).json() as { token: string };
    expect((await post({ confirm: true, token: "wrong" })).status).toBe(400);
    expect(on()).toBe(false);
    const t2 = (await (await fetch(base + "/skills")).json() as { token: string }).token;
    expect(t2).not.toBe(token);
    expect((await post({ confirm: true, token })).status).toBe(400); // an older token is dead
    const t3 = (await (await fetch(base + "/skills")).json() as { token: string }).token;
    expect((await post({ confirm: true, token: t3 })).status).toBe(200);
    expect(on()).toBe(true);
    expect((await post({ confirm: true, token: t3 })).status).toBe(400); // spent: a token works once
  } finally { p.kill(); }
}, 20000);
