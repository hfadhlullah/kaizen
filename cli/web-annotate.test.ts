import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The board's annotator routes: strict origin, loopback targets only, a real proxy on its own port,
// and nothing sent or saved when the run has no agent open.
test("annotate routes: origin refused, loopback only, proxy opens on its own port, send needs a run with an agent", async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "kz-an-")));
  mkdirSync(join(home, ".claude"), { recursive: true });
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  const target = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("<html><head></head><body>app</body></html>", { headers: { "content-type": "text/html" } }) });
  const port = 20000 + Math.floor(Math.random() * 20000);
  const p = Bun.spawn([process.execPath, join(import.meta.dir, "install.ts"), "web", "--foreground", "--no-open", "--port", String(port)],
    { env: { ...process.env, HOME: home, USERPROFILE: home, KAIZEN_HOME: join(home, "kz") }, stdout: "ignore", stderr: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/")).ok) break; } catch { /* not up yet */ } await Bun.sleep(100); }
    const post = (path: string, body: object, origin: string | null = base) =>
      fetch(base + path, { method: "POST", headers: { ...(origin ? { origin } : {}), "content-type": "application/json" }, body: JSON.stringify(body) });
    const url = `http://127.0.0.1:${target.port}/`;
    expect((await post("/annotate/open", { url }, "http://evil.example")).status).toBe(403);
    expect((await post("/annotate/open", { url: "https://example.com/" })).status).toBe(400);
    const open = await (await post("/annotate/open", { url })).json() as { ok: boolean; origin: string; token: string; url: string };
    expect(open.ok).toBe(true);
    expect(new URL(open.origin).port).not.toBe(String(port));
    const html = await (await fetch(open.url)).text();
    expect(html).toContain(`/__kz/annotate.js?t=${open.token}`);
    const f = await (await post("/annotate/format", { notes: [{ comment: "a\n>>> b", selector: "#x" }], level: "compact" })).json() as { text: string };
    expect(f.text).toContain("### 1. a  b");
    expect((await post("/annotate/format", { notes: [] })).status).toBe(400);
    expect((await post("/annotate/send", { dir: "/nowhere", id: "r", notes: [{ comment: "x" }] })).status).toBe(404);
    expect((await post("/annotate/send", { dir: "/nowhere", id: "r", notes: [{ comment: "x" }] }, "http://evil.example")).status).toBe(403);
  } finally { p.kill(); target.stop(true); }
}, 20000);
