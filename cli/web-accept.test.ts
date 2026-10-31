import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { healRuns } from "./state.ts";

// A healed run (done by its agent, never approved) is approved by /accept: the line and
// the finish, no agent launched. A genuine review is refused there and goes through /decide.
test.skipIf(process.platform === "win32")("board /accept finishes a healed run without launching an agent", async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "kz-acc-")));
  const proj = join(home, "proj"), st = join(proj, ".kaizen");
  mkdirSync(join(proj, "cli"), { recursive: true });
  writeFileSync(join(proj, "cli", "a.ts"), "");
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  writeFileSync(join(home, ".kaizen", "projects"), proj + "\n");
  const mk = (id: string, state: object) => {
    const d = join(st, "runs", id);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "state.json"), JSON.stringify(state));
    writeFileSync(join(d, "03-impl.md"), "## Changed\n- `cli/a.ts`\n");
  };
  mkdirSync(st, { recursive: true });
  writeFileSync(join(st, "config.yml"), "approvals:\n  review: true\n");
  mk("2026-10-29-healed", { stage: "done" });
  mk("2026-10-29-healed2", { stage: "done" });
  mk("2026-10-29-real", { stage: "review", awaiting: "approvals.review" });
  expect(healRuns(st).sort()).toEqual(["2026-10-29-healed", "2026-10-29-healed2"]);
  const run = (id: string) => JSON.parse(readFileSync(join(st, "runs", id, "state.json"), "utf8"));
  expect(run("2026-10-29-healed").healed).toBe(true);
  const port = 20000 + Math.floor(Math.random() * 20000);
  mkdirSync(join(home, ".claude"), { recursive: true }); // an agent, or `kaizen web` stops at its no-agent notice
  const p = Bun.spawn([process.execPath, join(import.meta.dir, "install.ts"), "web", "--foreground", "--no-open", "--port", String(port)],
    { env: { ...process.env, HOME: home, USERPROFILE: home, KAIZEN_HOME: join(home, "kz") }, stdout: "ignore", stderr: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/")).ok) break; } catch { /* not up yet */ } await Bun.sleep(100); }
    const post = (path: string, id: string) => fetch(base + path, { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ dir: st, id, awaiting: "approvals.review" }) });
    expect((await post("/accept", "2026-10-29-real")).status).toBe(409);       // genuine review: not here
    expect(run("2026-10-29-real").stage).toBe("review");
    expect((await post("/accept", "2026-10-29-healed")).status).toBe(200);
    expect(run("2026-10-29-healed")).toMatchObject({ stage: "done", awaiting: null });
    expect(run("2026-10-29-healed").healed).toBeUndefined();
    expect(readFileSync(join(st, "runs", "2026-10-29-healed", "02-approval.md"), "utf8")).toContain("by user via board");
    expect(existsSync(join(st, "runs", "2026-10-29-healed", "terminals.json"))).toBe(false);   // nothing launched
    // /decide on a healed run: a revise is refused; an approve is the same accept, no launch.
    const dec = (id: string, why?: string) => fetch(base + "/decide", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ dir: st, id, awaiting: "approvals.review", why }) });
    expect((await dec("2026-10-29-healed2", "redo")).status).toBe(409);
    expect((await dec("2026-10-29-healed2")).status).toBe(200);
    expect(run("2026-10-29-healed2")).toMatchObject({ stage: "done", awaiting: null });
    expect(readFileSync(join(st, "runs", "2026-10-29-healed2", "02-approval.md"), "utf8")).toContain("by user via board");
    expect(existsSync(join(st, "runs", "2026-10-29-healed2", "terminals.json"))).toBe(false);
    // /decide still takes the genuine review (here the launch itself fails: no agent in the scratch HOME).
    expect((await post("/decide", "2026-10-29-real")).status).not.toBe(409);
  } finally { p.kill(); }
}, 30000);
