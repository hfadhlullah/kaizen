import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A decision goes to the agent already open in the run's card; only with none does a new one start.
test.skipIf(process.platform === "win32")("board /decide reuses the run's open agent", async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "kz-dec-")));
  const proj = join(home, "proj"), st = join(proj, ".kaizen"), bin = join(home, "bin"), d = join(st, "runs", "2026-10-30-r");
  mkdirSync(d, { recursive: true });
  mkdirSync(bin);
  mkdirSync(join(home, ".kaizen"));
  writeFileSync(join(home, ".kaizen", "projects"), proj + "\n");
  writeFileSync(join(st, "config.yml"), "agent:\n  launch: card\n");
  // A stand-in agent that stays open and saves what is typed into it.
  writeFileSync(join(bin, "claude"), `#!/bin/sh\ncat > "${join(home, "typed")}"\n`);
  chmodSync(join(bin, "claude"), 0o755);
  const waiting = (awaiting: string) => writeFileSync(join(d, "state.json"), JSON.stringify({ id: "2026-10-30-r", agent: "claude", stage: "plan", awaiting }));
  waiting("approvals.plan");
  const port = 20000 + Math.floor(Math.random() * 20000);
  const p = Bun.spawn([process.execPath, join(import.meta.dir, "install.ts"), "web", "--foreground", "--no-open", "--port", String(port)],
    { env: { ...process.env, HOME: home, USERPROFILE: home, KAIZEN_HOME: join(home, "kz"), PATH: `${bin}:${process.env.PATH}` }, stdout: "ignore", stderr: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/")).ok) break; } catch { /* not up yet */ } await Bun.sleep(100); }
    const decide = async (awaiting: string) => (await fetch(base + "/decide", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ dir: st, id: "2026-10-30-r", awaiting }) })).json() as any;
    const first = await decide("approvals.plan");
    expect(first.ok).toBe(true);
    expect(first.pty).toBeTruthy();
    await Bun.sleep(300);
    waiting("approvals.plan");
    const second = await decide("approvals.plan");
    expect(second).toMatchObject({ ok: true, pty: first.pty, reused: true });
    let typed = "";
    for (let i = 0; i < 30 && !typed.includes("2026-10-30-r"); i++) { await Bun.sleep(100); try { typed = readFileSync(join(home, "typed"), "utf8"); } catch { /* not yet */ } }
    expect(typed).toContain("2026-10-30-r");
    expect(readFileSync(join(d, "terminals.json"), "utf8").split(first.pty).length).toBeGreaterThan(1);
  } finally {
    p.kill();
  }
}, 20000);
