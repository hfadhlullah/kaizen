// Backlog items as cards in the board's Ideas column: numbering, hiding while a run
// started from one lives, closing in place, and the board routes that drive them.
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { backlogLines, backlogCards, startedBacklog, closeBacklog, markBacklogDone, backlogItem } from "./state.ts";
import { boardIndex } from "./notes.ts";

const scratch = () => {
  const state = join(mkdtempSync(join(tmpdir(), "kz-bl-")), ".kaizen");
  const run = (id: string, stage: string, files: Record<string, string> = {}) => {
    const dir = join(state, "runs", id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "state.json"), JSON.stringify({ id, stage, awaiting: null }));
    for (const [f, t] of Object.entries(files)) writeFileSync(join(dir, f), t);
    return dir;
  };
  return { state, run };
};

const BACKLOG = "# Backlog\n\n- open: `cli/x.ts:12`: low: first thing. Fix: do it.\n- done: closed one | run y\n- open: high: urgent thing\n  a note under it\n- rejected: no | why\n- open: plain item\n";

test("backlogLines numbers every open, done and rejected line as boardIndex does", () => {
  const { state, run } = scratch();
  run("2026-10-01-src", "done", { "06-backlog.md": BACKLOG });
  const lines = backlogLines(join(state, "runs", "2026-10-01-src", "06-backlog.md"));
  expect(lines.map((l) => [l.n, l.status])).toEqual([[1, "open"], [2, "done"], [3, "open"], [4, "rejected"], [5, "open"]]);
  const idx = boardIndex(state).runs.find((r) => r.id === "2026-10-01-src")!.backlog;
  expect(idx).toEqual(lines.map(({ n, status, text }) => ({ n, status, text })));
  expect(backlogLines(join(state, "nope.md"))).toEqual([]);
});

test("backlogCards: open items of live runs and the orphanage, most severe first; abandoned runs skipped", () => {
  const { state, run } = scratch();
  run("2026-10-01-src", "done", { "06-backlog.md": BACKLOG });
  run("2026-10-02-gone", "abandoned", { "06-backlog.md": "- open: critical: from an abandoned run\n" });
  writeFileSync(join(state, "backlog.md"), "- open: rescued item | from 2026-09-01-old\n");
  const cards = backlogCards([state]);
  expect(cards.map((c) => [c.source, c.n, c.severity])).toEqual([
    ["2026-10-01-src", 3, "high"], ["2026-10-01-src", 1, "low"], ["2026-10-01-src", 5, null], ["orphan", 1, null],
  ]);
  expect(cards[1]).toMatchObject({ text: "first thing.", at: "x.ts:12", raw: "`cli/x.ts:12`: low: first thing. Fix: do it." });
});

test("a run started from an item hides its card; an abandoned one gives it back", () => {
  const { state, run } = scratch();
  run("2026-10-01-src", "done", { "06-backlog.md": BACKLOG });
  const kid = run("2026-10-03-kid", "plan", { "00-request.md": "/kaizen urgent thing\n\nParent: 2026-10-01-src\nBacklog: 2026-10-01-src#3\n" });
  expect(startedBacklog(state).get("2026-10-01-src#3")).toEqual([{ id: "2026-10-03-kid", stage: "plan" }]);
  expect(backlogCards([state]).some((c) => c.n === 3)).toBe(false);
  writeFileSync(join(kid, "state.json"), JSON.stringify({ stage: "abandoned" }));
  expect(backlogCards([state]).some((c) => c.n === 3)).toBe(true);
});

test("markBacklogDone closes only the line its done run names, once, and touches no state.json", () => {
  const { state, run } = scratch();
  const src = run("2026-10-01-src", "done", { "06-backlog.md": BACKLOG });
  run("2026-10-03-kid", "build", { "00-request.md": "x\n\nBacklog: 2026-10-01-src#3\n" });
  run("2026-10-04-orph", "done", { "00-request.md": "y\n\nBacklog: orphan#1\n" });
  writeFileSync(join(state, "backlog.md"), "- open: rescued item | from 2026-09-01-old\n");
  markBacklogDone(state);
  expect(readFileSync(join(src, "06-backlog.md"), "utf8")).toBe(BACKLOG);   // still building
  expect(readFileSync(join(state, "backlog.md"), "utf8")).toBe("- open: rescued item | from 2026-09-01-old | 2026-10-04-orph\n".replace("open", "done"));
  const kidState = join(state, "runs", "2026-10-03-kid", "state.json");
  writeFileSync(kidState, JSON.stringify({ stage: "done" }));
  const before = statSync(kidState).mtimeMs;
  markBacklogDone(state);
  markBacklogDone(state);
  expect(readFileSync(join(src, "06-backlog.md"), "utf8")).toBe(BACKLOG.replace("- open: high: urgent thing", "- done: high: urgent thing | 2026-10-03-kid"));
  expect(statSync(kidState).mtimeMs).toBe(before);
  expect(backlogCards([state]).map((c) => c.n)).toEqual([1, 5]);
});

test("closeBacklog rewrites one open line in place and keeps CRLF; refuses closed or missing lines", () => {
  const { state, run } = scratch();
  const src = run("2026-10-01-src", "done", { "06-backlog.md": BACKLOG.replace(/\n/g, "\r\n") });
  expect(closeBacklog(state, "2026-10-01-src", 5, "rejected", "not worth it")).toBeNull();
  expect(readFileSync(join(src, "06-backlog.md"), "utf8")).toBe(BACKLOG.replace("- open: plain item", "- rejected: plain item | not worth it").replace(/\n/g, "\r\n"));
  expect(closeBacklog(state, "2026-10-01-src", 2, "rejected", "x")).toBe("that item is already closed");
  expect(closeBacklog(state, "2026-10-01-src", 9, "rejected", "x")).toBe("no such backlog item");
  expect(closeBacklog(state, "../../etc", 1, "rejected", "x")).toBe("no such backlog");
  expect(backlogItem(state, "2026-10-01-src", 5)?.status).toBe("rejected");
});

// The real server in a scratch home. Linux only: launching is made to fail before any
// terminal or agent opens (no display, no terminal on PATH, terminal launch mode), and
// the manual command it hands back is the request a run would have been given.
test.skipIf(process.platform !== "linux")("board routes: /state lists backlog cards, /backlog rejects, /run carries the item's source", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "kz-bl-home-")), proj = join(homeDir, "p"), state = join(proj, ".kaizen");
  for (const d of [state, join(homeDir, ".kaizen"), join(homeDir, ".claude")]) mkdirSync(d, { recursive: true });
  writeFileSync(join(homeDir, ".kaizen", "projects"), proj + "\n");
  writeFileSync(join(homeDir, ".kaizen", "config.yml"), "agent:\n  launch: terminal\n");
  const src = join(state, "runs", "2026-10-01-src");
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, "state.json"), JSON.stringify({ stage: "done", awaiting: null }));
  writeFileSync(join(src, "06-backlog.md"), BACKLOG);
  const port = 20000 + Math.floor(Math.random() * 20000);
  const repo = join(import.meta.dir, "..");
  const env: Record<string, string> = { HOME: homeDir, USERPROFILE: homeDir, KAIZEN_HOME: repo, PATH: dirname(process.execPath), DISPLAY: "", WAYLAND_DISPLAY: "", TERMINAL: "", TMUX: "" };
  const proc = Bun.spawn([process.execPath, join(repo, "cli", "install.ts"), "web", "--port", String(port), "--no-open", "--foreground"], { cwd: proj, env, stdout: "ignore", stderr: "ignore" });
  try {
    const at = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { await fetch(at + "/state"); break; } catch { if (i > 100) throw new Error("board did not start"); await Bun.sleep(50); } }
    const post = async (path: string, body: object) => { const r = await fetch(at + path, { method: "POST", body: JSON.stringify({ dir: state, ...body }) }); return { status: r.status, ...(await r.json() as any) }; };
    const listed = async () => ((await (await fetch(at + "/state?all=1")).json()) as any).backlog.map((b: any) => [b.source, b.n]);
    expect(await listed()).toEqual([["2026-10-01-src", 3], ["2026-10-01-src", 1], ["2026-10-01-src", 5]]);

    expect(await post("/backlog", { op: "reject", source: "2026-10-01-src", n: 5, reason: "" })).toMatchObject({ status: 400 });
    expect(await post("/backlog", { op: "reject", source: "2026-10-01-src", n: 5, reason: "not now" })).toMatchObject({ status: 200 });
    expect(await post("/backlog", { op: "reject", source: "2026-10-01-src", n: 5, reason: "again" })).toMatchObject({ status: 409 });
    expect(await post("/backlog", { op: "reject", source: "2026-10-01-src", n: 42, reason: "x" })).toMatchObject({ status: 404 });
    expect(readFileSync(join(src, "06-backlog.md"), "utf8")).toContain("- rejected: plain item | not now\n");
    expect(await listed()).toEqual([["2026-10-01-src", 3], ["2026-10-01-src", 1]]);

    expect(await post("/run", { backlog: { source: "2026-10-01-src", n: 2 } })).toMatchObject({ status: 409 });
    expect(await post("/run", { backlog: { source: "2026-10-01-src", n: 42 } })).toMatchObject({ status: 404 });
    const r = await post("/run", { kind: "lite", backlog: { source: "2026-10-01-src", n: 1 } });
    expect(r).toMatchObject({ status: 500, ok: false });
    expect(r.manual).toContain("/kaizen lite first thing. (x.ts:12)");
    expect(r.manual).toContain("Parent: 2026-10-01-src");
    expect(r.manual).toContain("Backlog: 2026-10-01-src#1");
    expect(r.manual).toContain("Backlog item: `cli/x.ts:12`: low: first thing. Fix: do it.");

    // Once a run carries the line, a second start is refused and the card is gone.
    const kid = join(state, "runs", "2026-10-05-kid");
    mkdirSync(kid, { recursive: true });
    writeFileSync(join(kid, "state.json"), JSON.stringify({ stage: "plan", awaiting: null }));
    writeFileSync(join(kid, "00-request.md"), "first thing\n\nParent: 2026-10-01-src\nBacklog: 2026-10-01-src#1\n");
    expect(await post("/run", { backlog: { source: "2026-10-01-src", n: 1 } })).toMatchObject({ status: 409 });
    expect(await listed()).toEqual([["2026-10-01-src", 3]]);
  } finally { proc.kill(); await proc.exited; }
}, 30_000);
