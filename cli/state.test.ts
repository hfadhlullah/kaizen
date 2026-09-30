// State module against a throwaway .kaizen/. Nothing here spawns a terminal: the
// launch path is covered only up to the command it would run.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  readRuns, readInbox, writeInbox, replaceIdea, abandonRun, allBacklog, backlog,
  statusOf, columnOf, parseItem, startedRuns, boardCards, readArchive, setArchived,
  requestOf, agentFlags, readNotes, writeNotes, manualCommand, parseNotes, formatNote, appendNote, saveAttachment,
  reviewFindings, pickFindings, fixPrompt, gitStatus, runGit, commitPush, readCommit, findTerminal, pruneRuns, unrechecked, notice, notifier, notifyArgs, LOGO, type Card,
} from "./state.ts";

let state: string;
const run = (id: string, s: object, request = "") => {
  const dir = join(state, "runs", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.json"), JSON.stringify(s));
  if (request) writeFileSync(join(dir, "00-request.md"), request);
  return dir;
};

beforeAll(() => {
  state = join(mkdtempSync(join(tmpdir(), "kaizen-")), ".kaizen");
  mkdirSync(state, { recursive: true });
  run("2026-09-01-waiting", { stage: "plan", awaiting: "approvals.plan" }, "# Request\n\nAdd OAuth login\n");
  run("2026-09-02-done", { stage: "done", awaiting: null }, "# Request\n\nRename cli flags\n");
  const old = run("2026-09-03-stale", { stage: "build", awaiting: null });
  const then = new Date(Date.now() - 2 * 3600_000);
  utimesSync(join(old, "state.json"), then, then);
  writeFileSync(join(state, "runs", "2026-09-02-done", "06-backlog.md"),
    "# Backlog\n\n- open: `cli/x.ts:12`: low: first thing. Fix: do it.\n- done: closed one | run y\n- open: plain item\n");
  writeFileSync(join(state, "backlog.md"), "- open: orphaned item\n");
  writeInbox(state, [
    { status: "open", text: "add oauth login" },
    { status: "open", text: "retry failed webhooks" },
    { status: "started", text: "nightly digest" },
    { status: "rejected", text: "gantt view | not this product" },
  ]);
});
afterAll(() => rmSync(join(state, ".."), { recursive: true, force: true }));

test("readRuns: newest first, mtime as moved", () => {
  const runs = readRuns(state);
  expect(runs.map((r) => r.id)).toEqual(["2026-09-03-stale", "2026-09-02-done", "2026-09-01-waiting"]);
  expect(runs[2]!.awaiting).toBe("approvals.plan");
  expect(runs[0]!.moved).toBeLessThan(Date.now() - 3600_000);
});

test("statusOf: waiting beats stage, mtime decides running vs stalled", () => {
  const now = Date.now();
  const [stale, done, waiting] = readRuns(state);
  expect(statusOf(waiting!, now)).toBe("waiting");
  expect(statusOf(done!, now)).toBe("done");
  expect(statusOf(stale!, now)).toBe("stalled");
  expect(statusOf({ ...stale!, moved: now }, now)).toBe("running");
  expect(statusOf({ ...stale!, stage: "abandoned", awaiting: "x" }, now)).toBe("abandoned");
});

test("columnOf: every stage word lands somewhere", () => {
  expect(["plan", "build", "review", "done", "abandoned", "weird"].map((s) => columnOf(s))).toEqual([1, 2, 3, 4, 4, 1]);
  expect(columnOf("implement", "approvals.review")).toBe(3);
  expect(columnOf("implement", "findings")).toBe(3);
  expect(columnOf("implement", "approvals.each_file")).toBe(2);
  expect(columnOf("plan", "approvals.plan")).toBe(1);
});

test("inbox round-trips and ignores malformed lines", () => {
  writeFileSync(join(state, "inbox.md"), readFileSync(join(state, "inbox.md"), "utf8") + "not an item\n");
  expect(readInbox(state).map((l) => l.status)).toEqual(["open", "open", "started", "rejected"]);
});

test("boardCards: idea retired once a run's request contains it; started idea sits in planning", () => {
  const cards = boardCards([state], Date.now());
  const ideas = cards.filter((k) => k.kind === "idea").map((k) => [k.text, k.column, k.status]);
  expect(ideas).toEqual([["retry failed webhooks", 0, "idea"], ["nightly digest", 1, "starting"]]);
  const runs = cards.filter((k) => k.kind === "run").map((k) => [k.id, k.column, k.status]);
  expect(runs).toEqual([["2026-09-03-stale", 2, "stalled"], ["2026-09-02-done", 4, "done"], ["2026-09-01-waiting", 1, "waiting"]]);
});

test("replaceIdea edits, rejects, deletes by text", () => {
  replaceIdea(state, "retry failed webhooks", { status: "open", text: "retry failed webhooks twice" });
  expect(readInbox(state).some((l) => l.text === "retry failed webhooks twice")).toBe(true);
  replaceIdea(state, "retry failed webhooks twice", { status: "rejected", text: "retry failed webhooks twice | no" });
  replaceIdea(state, "nightly digest", null);
  expect(readInbox(state).map((l) => l.status)).toEqual(["open", "rejected", "rejected"]);
});

test("abandonRun: flips stage, clears awaiting, records the reason, refuses twice", () => {
  expect(abandonRun(state, "2026-09-01-waiting", "changed my mind")).toBeNull();
  const s = JSON.parse(readFileSync(join(state, "runs", "2026-09-01-waiting", "state.json"), "utf8"));
  expect([s.stage, s.awaiting]).toEqual(["abandoned", null]);
  expect(readFileSync(join(state, "runs", "2026-09-01-waiting", "02-approval.md"), "utf8")).toContain("changed my mind");
  expect(abandonRun(state, "2026-09-01-waiting", "again")).toMatch(/already/);
});

test("backlog: open items only, orphanage last, count matches", () => {
  const groups = allBacklog(state);
  expect(groups.map((g) => g.run)).toEqual(["2026-09-02-done", "Orphaned"]);
  expect(groups[0]!.items.length).toBe(2);
  expect(backlog(state)).toBe(3);
});

test("parseItem: finding line splits into where, severity, text", () => {
  const it = parseItem("`cli/x.ts:12`: low: first thing. Fix: do it.");
  expect([it.where, it.severity, it.text]).toEqual(["x.ts:12", "low", "first thing."]);
  expect(parseItem("plain item").severity).toBeNull();
});

test("reviewFindings: numbered lines under Findings, closed by the backlog; the prompt names only what was picked", () => {
  const dir = join(state, "runs", "2026-09-02-done");
  writeFileSync(join(dir, "04-review.md"),
    "# Review\n\n1. not a finding, above the heading\n\n## Findings\n\n1. a.ts:1: high: one. Fix: x.\n2. b.ts:2: low: two.\n3. c.ts:3: low: three.\n\n## Notes\n\n4. not a finding either\n");
  const before = readFileSync(join(dir, "06-backlog.md"), "utf8");
  writeFileSync(join(dir, "06-backlog.md"), before + "- done: 1. a.ts:1: high: one, reworded | fixed in iteration 1\n- rejected: c.ts:3: low: three. | not worth it\n- open: 2. b.ts:2: low: two.\n");
  expect(reviewFindings(state, "2026-09-02-done").map((f) => [f.n, f.done])).toEqual([[1, true], [2, false], [3, true]]);
  expect(reviewFindings(state, "2026-09-02-done")[1]!.text).toBe("b.ts:2: low: two.");
  expect(reviewFindings(state, "2026-09-03-stale")).toEqual([]);
  expect(pickFindings(state, "2026-09-02-done", [2])).toEqual([2]);
  for (const bad of [[2, 99], [1], ["2"], [], "2", undefined]) expect(pickFindings(state, "2026-09-02-done", bad)).toBeNull();
  // Sub-headings stay inside the section; a recheck closes a finding before the backlog does.
  writeFileSync(join(dir, "06-backlog.md"), before);
  writeFileSync(join(dir, "04-review.md"), "## Findings\n\n### High\n\n1. a.ts:1: high: one.\n\n### Low\n\n2. b.ts:2: low: two.\n\n## Gate\n\n3. no\n");
  mkdirSync(join(dir, "05-iterations"), { recursive: true });
  writeFileSync(join(dir, "05-iterations", "01-recheck.md"), "**Finding 1 — closed.** Proven.\n\n**Finding 2 — still open**, by choice.\n");
  expect(reviewFindings(state, "2026-09-02-done").map((f) => [f.n, f.done])).toEqual([[1, true], [2, false]]);
  rmSync(join(dir, "05-iterations"), { recursive: true });
  expect(fixPrompt("2026-09-02-done", [2])).toStartWith("run 2026-09-02-done: fix finding 2 from");
  expect(fixPrompt("x", [2, 5])).toContain("fix findings 2, 5 from");
});

test("startedRuns: normalised request bodies", () => {
  expect(startedRuns(state).sort()).toEqual(["# request add oauth login", "# request rename cli flags"]);
});

test("archive: a run is listed, hidden by flag, never moved", () => {
  setArchived(state, "2026-09-02-done", true);
  expect([...readArchive(state)]).toEqual(["2026-09-02-done"]);
  const card = boardCards([state], Date.now()).find((k) => k.id === "2026-09-02-done")!;
  expect([card.archived, card.column]).toEqual([true, 4]);
  setArchived(state, "2026-09-02-done", false);
  expect(readArchive(state).size).toBe(0);
  expect(boardCards([state], Date.now()).find((k) => k.id === "2026-09-02-done")!.archived).toBe(false);
});

test("archive: an idea keeps its line with status archived", () => {
  writeInbox(state, [{ status: "open", text: "park this", notes: "kept" }, { status: "archived", text: "parked zq7" }]);
  const ideas = boardCards([state], Date.now()).filter((k) => k.kind === "idea");
  expect(ideas.map((k) => [k.text, k.archived])).toEqual([["park this", false], ["parked zq7", true]]);
});

test("notes: indented lines under a bullet round-trip; a legacy file is untouched", () => {
  const legacy = "# Inbox\n\nIdeas with no run yet. One line each, same format as a run's backlog.\n\n- open: a\n- rejected: b | why\n";
  writeFileSync(join(state, "inbox.md"), legacy);
  writeInbox(state, readInbox(state));
  expect(readFileSync(join(state, "inbox.md"), "utf8")).toBe(legacy);
  writeInbox(state, [{ status: "open", text: "with notes", notes: "see https://x.y/z\ncli/state.ts:12 | not a reason" }, { status: "open", text: "plain zq8" }]);
  const [a, b] = readInbox(state);
  expect(a).toEqual({ status: "open", text: "with notes", notes: "see https://x.y/z\ncli/state.ts:12 | not a reason" });
  expect(b).toEqual({ status: "open", text: "plain zq8" });
});

test("notes: survive reject and started; edit can replace or clear them", () => {
  replaceIdea(state, "with notes", { status: "started", text: "with notes" });
  expect(readInbox(state)[0]!.notes).toContain("https://x.y/z");
  replaceIdea(state, "with notes", { status: "rejected", text: "with notes | no" });
  expect(readInbox(state)[0]!.notes).toContain("https://x.y/z");
  replaceIdea(state, "plain zq8", { status: "open", text: "plain zq8", notes: "" });
  expect(readInbox(state)[1]!.notes).toBeUndefined();
  expect(boardCards([state], Date.now()).find((k) => k.text === "plain zq8")!.notes).toBeUndefined();
});

test("notes: the prompt is text, blank line, notes; still one quoted argument", () => {
  expect(requestOf("/kaizen do x")).toBe("/kaizen do x");
  expect(requestOf("/kaizen do x", "l1\nl2\n")).toBe("/kaizen do x\n\nl1\nl2");
  const cmd = manualCommand("/p", "claude", requestOf("/kaizen do x", "l1"));
  if (process.platform !== "win32") {
    expect(cmd).toBe("cd '/p' && claude '/kaizen do x\n\nl1'");
    // Pasted into a shell, outside text must stay text.
    // ' and \ sit in double quotes: fish reads \' inside single quotes as an escape.
    const hostile = "a $(x) `y` 'z' a\\' $(touch canary) \\'b \\";
    const pasted = manualCommand("/p", "printf %s", hostile);
    expect(pasted).toBe(`cd '/p' && printf %s 'a $(x) \`y\` '"'"'z'"'"' a'"\\\\"''"'"' $(touch canary) '"\\\\"''"'"'b '"\\\\"''`);
    expect(pasted.replace(/'[^'\\]*'|"['\\]+"/g, "")).toBe("cd  && printf %s ");   // only '…' without \ or ', and "'" or "\\"
    for (const sh of ["/bin/sh", "bash", "zsh"].filter((s) => Bun.which(s))) {
      expect(Bun.spawnSync([sh, "-c", pasted.replace("cd '/p'", "cd /")]).stdout.toString()).toBe(hostile);
    }
  }
});

test("notes: a run's notes.md is read beside it, written only for a real run", () => {
  expect(writeNotes(state, "2026-09-09-nope", "x")).toBe("no such run");
  expect(writeNotes(state, "2026-09-01-waiting", "  ref: docs/a.md  ")).toBeNull();
  expect(readNotes(state, "2026-09-01-waiting")).toBe("ref: docs/a.md\n");
  expect(boardCards([state], Date.now()).find((k) => k.id === "2026-09-01-waiting")!.notes).toBe("ref: docs/a.md\n");
  writeNotes(state, "2026-09-01-waiting", "");
  expect(readNotes(state, "2026-09-01-waiting")).toBe("");
});

test("notes log: stamped entries, continuation lines, unstamped preamble", () => {
  const src = "hand written\n[2026-09-14 10:00] first\n  more\n[2026-09-14 10:05] ![shot](attachments/a.png)\n";
  expect(parseNotes(src)).toEqual([
    { at: "", text: "hand written" },
    { at: "2026-09-14 10:00", text: "first\nmore" },
    { at: "2026-09-14 10:05", text: "![shot](attachments/a.png)" },
  ]);
  expect(formatNote("a\nb", "2026-09-14 10:00")).toBe("[2026-09-14 10:00] a\n  b");
});

test("notes log: append to a run and to an idea; attachments saved and made absolute in the prompt", () => {
  expect(appendNote(state, { id: "2026-09-01-waiting" }, "run note")).toBeNull();
  expect(parseNotes(readNotes(state, "2026-09-01-waiting")).map((n) => n.text)).toEqual(["run note"]);
  writeInbox(state, [{ status: "open", text: "chatty zq6" }]);
  expect(appendNote(state, { text: "chatty zq6" }, "one")).toBeNull();
  expect(appendNote(state, { text: "chatty zq6" }, "two\nlines")).toBeNull();
  expect(appendNote(state, { text: "nope zq6" }, "x")).toBe("no such idea");
  expect(parseNotes(readInbox(state)[0]!.notes!).map((n) => n.text)).toEqual(["one", "two\nlines"]);
  const rel = saveAttachment(state, null, "../evil name.png", new Uint8Array([1]));
  expect(rel).toMatch(/^attachments\/\w+-_evil_name\.png$/);
  expect(requestOf("x", `![s](${rel})`, state)).toBe(`x\n\n![s](${join(state, rel)})`);
  expect(saveAttachment(state, "2026-09-01-waiting", "b.txt", new Uint8Array([2]))).toMatch(/^runs\/2026-09-01-waiting\/attachments\//);
});

test("agentFlags: per-tool model and effort from the agent block, inline or nested", () => {
  const cfg = `agent:\n  default: auto\n  codex: { model: gpt-5, effort: low }\n  claude:\n    model: sonnet\n    effort: low\n  gemini:\n    model: "gemini-2.5-pro"\n`;
  expect(agentFlags("/p", "codex", cfg)).toEqual(["-m", "gpt-5", "-c", "model_reasoning_effort=low"]);
  expect(agentFlags("/p", "claude", cfg)).toEqual(["--model", "sonnet", "--effort", "low"]);
  expect(agentFlags("/p", "gemini", cfg)).toEqual(["-m", "gemini-2.5-pro"]);
  expect(agentFlags("/p", "agy", cfg)).toEqual([]);
  expect(agentFlags("/p", "codex", "agent:\n  default: codex\n")).toEqual([]);
});

test("boardCards: a short idea is not retired by a request that merely contains the word", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "kz-")), ".kaizen");
  mkdirSync(join(dir, "runs", "2026-09-01-a"), { recursive: true });
  writeFileSync(join(dir, "runs", "2026-09-01-a", "00-request.md"), "# Request\n\n> /kaizen lite add retry\n\nDone means the tests pass.\n");
  writeInbox(dir, [{ status: "open", text: "test" }, { status: "open", text: "add retry" }]);
  expect(boardCards([dir], Date.now()).filter((k) => k.kind === "idea").map((k) => k.text)).toEqual(["test"]);
});

test("boardCards: the done column is newest-moved first, the rest keep their place", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "kz-")), ".kaizen");
  const at = (id: string, stage: string, hoursAgo: number) => {
    mkdirSync(join(dir, "runs", id), { recursive: true });
    writeFileSync(join(dir, "runs", id, "state.json"), JSON.stringify({ stage, awaiting: null }));
    const t = new Date(Date.now() - hoursAgo * 3600_000);
    utimesSync(join(dir, "runs", id, "state.json"), t, t);
  };
  at("2026-09-01-a", "done", 1); at("2026-09-02-b", "done", 3); at("2026-09-03-c", "abandoned", 2);
  at("2026-09-04-d", "build", 9); at("2026-09-05-e", "done", 0);
  const ids = boardCards([dir], Date.now()).map((k) => k.id);
  // Unsorted this is e, d, c, b, a: d keeps slot two, the four finished runs reorder around it.
  expect(ids).toEqual(["2026-09-05-e", "2026-09-04-d", "2026-09-01-a", "2026-09-03-c", "2026-09-02-b"]);
});

test("commitPush: commits the run's files only, pushes, and records it; the message never meets a shell", async () => {
  const root = mkdtempSync(join(tmpdir(), "kz-git-"));
  const sh = (cwd: string, ...a: string[]) => Bun.spawnSync(["git", "-C", cwd, ...a]).stdout.toString().trim();
  expect(gitStatus(root)).toEqual({ repo: false });
  const bare = join(root, "remote.git"), proj = join(root, "proj"), st = join(proj, ".kaizen");
  mkdirSync(join(st, "runs", "r1"), { recursive: true });
  Bun.spawnSync(["git", "init", "-q", "--bare", bare]);
  Bun.spawnSync(["git", "init", "-q", proj]);
  for (const kv of [["user.name", "t"], ["user.email", "t@t"], ["commit.gpgsign", "false"], ["core.hooksPath", "/dev/null"]]) sh(proj, "config", ...kv);
  expect(gitStatus(proj)).toEqual({ repo: false });           // a repo with nowhere to push
  sh(proj, "remote", "add", "origin", bare);
  writeFileSync(join(proj, ".gitignore"), ".kaizen/\n");
  writeFileSync(join(proj, "a.txt"), "a");
  // Another run's file, staged by hand: the report does not name it, so it stays out.
  writeFileSync(join(proj, "c.txt"), "c");
  sh(proj, "add", "c.txt");
  expect((gitStatus(proj) as any).files.length).toBe(3);
  expect(runGit(st, "r1")).toMatchObject({ files: [], others: 3 });   // no report, no files
  writeFileSync(join(st, "runs", "r1", "03-impl.md"), "## Changed\n\n- `.gitignore`: x\n- `a.txt:1`: y\n- c.txt and `c.txt.bak` are not named\n");
  const files = () => (runGit(st, "r1") as any).files as string[];
  expect(files()).toEqual(["?? .gitignore", "?? a.txt"]);
  // An earlier run that named the same file is not offered it: the later report has it.
  mkdirSync(join(st, "runs", "r0"));
  writeFileSync(join(st, "runs", "r0", "03-impl.md"), "- `a.txt`: z\n");
  utimesSync(join(st, "runs", "r0", "03-impl.md"), new Date(1000), new Date(1000));
  expect(runGit(st, "r0")).toMatchObject({ files: [], others: 3 });
  // The later run is told the file holds the earlier run's work too.
  expect(runGit(st, "r1")).toMatchObject({ shared: ["a.txt: r0"] });
  expect(await commitPush(st, "r1", "m", ["?? a.txt"])).toMatchObject({ ok: false });   // not the list that was shown
  expect(sh(proj, "rev-list", "--all", "--count")).toBe("0");                             // and nothing was committed
  expect(await commitPush(st, "r1", " ", files())).toEqual({ ok: false, why: "A commit message is required." });
  // A subject with no type is refused before anything is staged.
  for (const untyped of ["add the thing", "feature: x", "fix:no space", "note\n\nfix: in the body"])
    expect((await commitPush(st, "r1", untyped, files()) as { why: string }).why).toContain("Start the message with a type");
  expect(sh(proj, "rev-list", "--all", "--count")).toBe("0");
  expect(sh(proj, "diff", "--cached", "--name-only")).toBe("c.txt");   // only what was staged by hand
  const msg = 'fix(web)!: $(touch pwned); "q" `id`', text = "what changed\nand why";
  let ticked = false;
  setTimeout(() => { ticked = true; }, 0);
  const r = await commitPush(st, "r1", `${msg}\n\n${text}`, files()) as { ok: true; sha: string };
  expect(r.ok).toBe(true);
  expect(ticked).toBe(true);   // the push did not hold the event loop
  expect(sh(proj, "log", "-1", "--format=%s")).toBe(msg);
  expect(sh(proj, "log", "-1", "--format=%b")).toBe(text);
  expect(existsSync(join(proj, "pwned"))).toBe(false);
  expect(sh(bare, "rev-parse", "--short", "HEAD")).toBe(r.sha);
  expect(runGit(st, "r1")).toMatchObject({ files: [], ahead: 0, others: 1, shared: [] });
  expect(sh(proj, "show", "--name-only", "--format=", "HEAD")).toBe(".gitignore\na.txt");
  expect(Bun.spawnSync(["git", "-C", proj, "status", "--porcelain"]).stdout.toString()).toBe("A  c.txt\n");
  expect(readCommit(st, "r1")).toEqual({ sha: r.sha, pushed: true });

  // A push that fails leaves a record that says so.
  sh(proj, "remote", "set-url", "origin", join(root, "gone.git"));
  // A fix round's report names files too, and a name with a star in it is not a pattern.
  mkdirSync(join(st, "runs", "r1", "05-iterations"));
  writeFileSync(join(st, "runs", "r1", "05-iterations", "01-fix.md"), "- `b*.txt`: fixed\n");
  writeFileSync(join(proj, "b*.txt"), "b");
  writeFileSync(join(proj, "bb.txt"), "b");
  expect(files()).toEqual(["?? b*.txt"]);
  const f = await commitPush(st, "r1", "chore: second", files()) as { ok: false; why: string };
  expect(f.ok).toBe(false);
  expect(f.why).toContain("not pushed");
  expect(readCommit(st, "r1")!.pushed).toBe(false);
  expect(sh(proj, "show", "--name-only", "--format=", "HEAD")).toBe("b*.txt");
  expect(runGit(st, "r1")).toMatchObject({ files: [], ahead: 1, others: 2 });
});

test.skipIf(process.platform === "win32")("findTerminal: a running herdr wins, then tmux, else neither; the prompt stays one literal argument", () => {
  const bin = mkdtempSync(join(tmpdir(), "kz-bin-"));
  const stub = (name: string, code: number) => writeFileSync(join(bin, name), `#!/bin/sh\nexit ${code}\n`, { mode: 0o755 });
  const keys = ["PATH", "HERDR_ENV", "TMUX", "TERMINAL"];
  const saved = keys.map((k) => process.env[k]);
  try {
    process.env.PATH = bin;
    for (const k of keys.slice(1)) delete process.env[k];
    const prompt = `/kaizen it's "q" $HOME \`id\`\n\nnote`;
    const full = ["/usr/bin/claude", "--model", "opus", prompt];
    expect(findTerminal("/p", full)?.cmd[0]).not.toMatch(/^(sh|tmux)$/);   // neither installed
    stub("herdr", 1); stub("tmux", 1);
    expect(findTerminal("/p", full)?.cmd[0]).not.toMatch(/^(sh|tmux)$/);   // installed, no server
    process.env.TMUX = "/tmp/x,1,0"; process.env.HERDR_ENV = "1";
    expect(findTerminal("/p", full)?.cmd[0]).not.toMatch(/^(sh|tmux)$/);   // stale env from a server since stopped
    delete process.env.TMUX; delete process.env.HERDR_ENV; stub("tmux", 0);
    const t = findTerminal("/p", full)!;                                   // outside it, server up
    expect(t.cmd.slice(0, 4)).toEqual(["tmux", "new-window", "-c", "/p"]);
    stub("herdr", 0);
    const h = findTerminal("/p", full)!;
    expect([h.cmd[0], h.cmd[1], h.cmd[4], h.detached]).toEqual(["sh", "-c", "/p", false]);
    expect(t.cmd.slice(4)).toEqual(full);   // argv: tmux runs it without its default-shell
    const back = Bun.spawnSync(["/bin/sh", "-c", `printf '%s\\n' ${h.cmd[5]}`]).stdout.toString();
    expect(back).toBe(full.join("\n") + "\n");
  } finally {
    keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
    rmSync(bin, { recursive: true, force: true });
  }
});

test("prune: only finished runs beyond keep go, open items are rescued, a dry run deletes nothing", () => {
  const st = join(mkdtempSync(join(tmpdir(), "kaizen-prune-")), ".kaizen");
  const mk = (id: string, stage: string, backlog = "") => {
    const dir = join(st, "runs", id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "state.json"), JSON.stringify({ stage, awaiting: null }));
    if (backlog) writeFileSync(join(dir, "06-backlog.md"), backlog);
  };
  mk("2026-01-01-old-build", "build");                      // oldest of all, not finished
  mk("2026-01-02-old-review", "review");
  mk("2026-01-03-old-plan", "plan");
  mk("2026-01-04-done", "done", "- open: keep me\n- done: closed | x\n");
  mk("2026-01-05-abandoned", "abandoned", "- open: not open work\n");
  mk("2026-01-06-done", "done");
  mk("2026-01-07-done", "done");
  writeFileSync(join(st, "backlog.md"), "- open: already here");   // no trailing newline

  expect(pruneRuns(st, 2).map((g) => g.id)).toEqual(["2026-01-04-done", "2026-01-05-abandoned"]);
  expect(readdirSync(join(st, "runs")).length).toBe(7);           // dry run

  expect(pruneRuns(st, 2, true)).toEqual([{ id: "2026-01-04-done", rescued: 1 }, { id: "2026-01-05-abandoned", rescued: 0 }]);
  expect(readdirSync(join(st, "runs")).sort()).toEqual(
    ["2026-01-01-old-build", "2026-01-02-old-review", "2026-01-03-old-plan", "2026-01-06-done", "2026-01-07-done"]);
  expect(readFileSync(join(st, "backlog.md"), "utf8")).toBe("- open: already here\n- open: keep me | from 2026-01-04-done\n");
  expect(pruneRuns(st, 2, true)).toEqual([]);
  rmSync(dirname(st), { recursive: true, force: true });
});

test("unrechecked: the last fix with no recheck beside it", () => {
  const dir = run("2026-09-04-fixes", { stage: "done", awaiting: null });
  expect(unrechecked(state, "2026-09-04-fixes")).toBe(false);
  mkdirSync(join(dir, "05-iterations"));
  writeFileSync(join(dir, "05-iterations", "01-fix.md"), "");
  expect(unrechecked(state, "2026-09-04-fixes")).toBe(true);
  writeFileSync(join(dir, "05-iterations", "01-recheck.md"), "");
  expect(unrechecked(state, "2026-09-04-fixes")).toBe(false);
  writeFileSync(join(dir, "05-iterations", "02-fix.md"), "");
  expect(boardCards([state], Date.now()).find((c) => c.id === "2026-09-04-fixes")!.tags).toContain("unrechecked");
  rmSync(dir, { recursive: true, force: true });
});

test("notice: plain words for what a run waits on, done, and nothing for the rest", () => {
  const c = (o: Partial<Card>): Card => ({ kind: "run", status: "waiting", text: "payroll", state: "", where: "~/acme", column: 1, awaiting: null, dim: false, archived: false, ...o });
  expect(notice(c({ awaiting: "approvals.plan" }))).toBe("payroll — plan needs your approval\n~/acme");
  for (const a of ["approvals.plan", "approvals.review", "approvals.each_file", "findings"]) expect(notice(c({ awaiting: a }))).not.toContain("waiting on");
  expect(notice(c({ awaiting: "something.new" }))).toBe("payroll — waiting on something.new\n~/acme");
  expect(notice(c({ status: "done" }))).toBe("payroll — done\n~/acme");
  for (const o of [{ status: "running" }, { status: "abandoned" }, { kind: "idea" as const, status: "idea" }]) expect(notice(c(o))).toBeNull();
  expect(notifyArgs("x")).toEqual(["notify-send", "-a", "kaizen", "-i", LOGO, "kaizen", "x"]);
});

test("notifier: only a run seen before, saying something new, and not a done the user just approved", () => {
  const due = notifier(), M = 60_000;
  expect(due("r", "a", false, 0)).toBe(false);           // first load, or arrived already waiting
  expect(due("r", "a", false, 1)).toBe(false);           // still waiting
  expect(due("r", "b", false, 2)).toBe(true);            // waiting on something else now
  expect(due("r", "d", true, 3 * M)).toBe(false);        // approved: waiting straight to done
  expect(due("s", null, false, 0)).toBe(false);
  expect(due("s", "a", false, 1)).toBe(true);            // started waiting
  expect(due("s", null, false, 2)).toBe(false);          // approved, back to work
  expect(due("s", "d", true, 3)).toBe(false);            // ...and done in a second write
  expect(due("t", "a", false, 0)).toBe(false);
  expect(due("t", null, false, 1)).toBe(false);
  expect(due("t", "d", true, 2 * M)).toBe(true);         // finished on its own, long after the last wait
  expect(due("u", null, false, 0)).toBe(false);
  expect(due("u", "d", true, 1)).toBe(true);             // never waited
  // web.ts writes the function into the page over this marker; without it the board throws on load.
  expect(notifier.toString()).toStartWith("function notifier(");
  expect(readFileSync(join(import.meta.dir, "..", "web", "board.html"), "utf8")).toContain("(/*notifier*/)()");
});
