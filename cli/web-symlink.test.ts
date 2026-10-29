import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A project registered under its realpath must still be reached by the symlink spelling
// the board was offered; a dir that was never registered stays refused.
test.skipIf(process.platform === "win32")("board accepts a symlink spelling of a registered project", async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "kz-sym-")));
  const real = join(home, "real", "proj"), link = join(home, "link");
  mkdirSync(join(real, ".kaizen"), { recursive: true });
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  mkdirSync(join(home, "other", ".kaizen"), { recursive: true });
  symlinkSync(real, link);
  writeFileSync(join(home, ".kaizen", "projects"), real + "\n");
  const port = 20000 + Math.floor(Math.random() * 20000);
  const p = Bun.spawn([process.execPath, join(import.meta.dir, "install.ts"), "web", "--foreground", "--no-open", "--port", String(port)],
    { env: { ...process.env, HOME: home, USERPROFILE: home, KAIZEN_HOME: join(home, "kz") }, stdout: "ignore", stderr: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/")).ok) break; } catch { /* not up yet */ } await Bun.sleep(100); }
    const post = (dir: string) => fetch(base + "/cd", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ dir }) });
    const ok = await post(join(link, ".kaizen"));
    expect(ok.status).toBe(200);
    const no = await post(join(home, "other", ".kaizen"));
    expect(no.status).toBe(404);
  } finally { p.kill(); }
}, 20000);
