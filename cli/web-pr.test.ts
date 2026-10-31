import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The Git tab's /pr takes the runs /commit takes: finished (or at the final approval),
// never the global state dir, and create/merge only once the final approval is given.
test.skipIf(process.platform === "win32")("board /pr refuses unfinished, unapproved and global runs", async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "kz-pr-")));
  const proj = join(home, "proj"), st = join(proj, ".kaizen");
  mkdirSync(join(proj, "cli"), { recursive: true });
  writeFileSync(join(proj, "cli", "a.ts"), "");
  mkdirSync(join(home, ".kaizen", "runs", "2026-10-30-global"), { recursive: true });
  writeFileSync(join(home, ".kaizen", "runs", "2026-10-30-global", "state.json"), JSON.stringify({ stage: "done" }));
  writeFileSync(join(home, ".kaizen", "projects"), proj + "\n");
  const mk = (id: string, state: object) => {
    const d = join(st, "runs", id);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "state.json"), JSON.stringify(state));
    writeFileSync(join(d, "03-impl.md"), "## Changed\n- `cli/a.ts`\n");
  };
  mkdirSync(st, { recursive: true });
  writeFileSync(join(st, "config.yml"), "approvals:\n  review: true\n");
  mk("2026-10-30-building", { stage: "build" });
  mk("2026-10-30-unapproved", { stage: "done" }); // done with changed files, no accepted: line
  const port = 20000 + Math.floor(Math.random() * 20000);
  mkdirSync(join(home, ".claude"), { recursive: true }); // an agent, or `kaizen web` stops at its no-agent notice
  const p = Bun.spawn([process.execPath, join(import.meta.dir, "install.ts"), "web", "--foreground", "--no-open", "--port", String(port)],
    { env: { ...process.env, HOME: home, USERPROFILE: home, KAIZEN_HOME: join(home, "kz") }, stdout: "ignore", stderr: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/")).ok) break; } catch { /* not up yet */ } await Bun.sleep(100); }
    const pr = async (dir: string, id: string, op: string) => {
      const r = await fetch(base + "/pr", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ dir, id, op, title: "feat: x" }) });
      return { status: r.status, body: await r.json() };
    };
    for (const op of ["create", "merge", "remove"]) {
      expect((await pr(st, "2026-10-30-building", op)).status).toBe(409);
      expect((await pr(join(home, ".kaizen"), "2026-10-30-global", op)).status).toBe(409);
    }
    for (const op of ["create", "merge"]) {
      const r = await pr(st, "2026-10-30-unapproved", op);
      expect(r.status).toBe(409);
      expect(JSON.stringify(r.body)).toContain("not approved");
    }
    // remove is not gated on the approval, but a run with no worktree has nothing to remove.
    const rm = await pr(st, "2026-10-30-unapproved", "remove");
    expect(rm.status).toBe(409);
    expect(JSON.stringify(rm.body)).toContain("no worktree");
    expect((await pr(st, "../x", "create")).status).toBe(400);
  } finally { p.kill(); }
}, 30000);
