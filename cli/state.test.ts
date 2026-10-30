// State module against a throwaway .kaizen/. Nothing here spawns a terminal: the
// launch path is covered only up to the command it would run.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync, existsSync, readdirSync, realpathSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { issueUrl, systemInfo, scrubHome, REPO_URL, home as realHome, trustFolder } from "./state.ts";
import * as stateModule from "./state.ts";
import {
  readRuns, readInbox, writeInbox, replaceIdea, moveIdea, abandonRun, runToIdea, allBacklog, backlog,
  requestTitle, statusOf, columnOf, parseItem, startedRuns, boardCards, parentOf, addCard, readArchive, setArchived,
  requestOf, agentFlags, plainModel, readNotes, writeNotes, manualCommand, parseNotes, formatNote, appendNote, saveAttachment,
  reviewFindings, pickFindings, fixPrompt, approvalPrompt, sessionLaunch, closeSessions, sweepSessions, readSessions, ownerOf, gitStatus, runGit, cardsGit, commitPush, commitStaged, stageFiles, suggestMessage, readCommit, findTerminal, nativePath, pruneRuns, unrechecked, notice, notifier, notifyArgs, winToastArgs, LOGO, type Card,
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
  writeInbox(state, [
    { status: "open", text: "add oauth login" },
    { status: "open", text: "retry failed webhooks" },
    { status: "started", text: "nightly digest" },
    { status: "rejected", text: "gantt view | not this product" },
  ]);
  run("2026-09-01-waiting", { stage: "plan", awaiting: "approvals.plan" }, "# Request\n\nAdd OAuth login\n");
  run("2026-09-02-done", { stage: "done", awaiting: null }, "# Request\n\nRename cli flags\n");
  const old = run("2026-09-03-stale", { stage: "build", awaiting: null });
  const then = new Date(Date.now() - 2 * 3600_000);
  utimesSync(join(old, "state.json"), then, then);
  writeFileSync(join(state, "runs", "2026-09-02-done", "06-backlog.md"),
    "# Backlog\n\n- open: `cli/x.ts:12`: low: first thing. Fix: do it.\n- done: closed one | run y\n- open: plain item\n");
  writeFileSync(join(state, "backlog.md"), "- open: orphaned item\n");
});
afterAll(() => rmSync(join(state, ".."), { recursive: true, force: true }));

test("readRuns: newest first, mtime as moved", () => {
  const runs = readRuns(state);
  expect(runs.map((r) => r.id)).toEqual(["2026-09-03-stale", "2026-09-02-done", "2026-09-01-waiting"]);
  expect(runs[2]!.awaiting).toBe("approvals.plan");
  expect(runs[0]!.moved).toBeLessThan(Date.now() - 3600_000);
});

test("readRuns keeps a run visible during a partial state write", () => {
  const file = join(state, "runs", "2026-09-03-stale", "state.json");
  const saved = readFileSync(file);
  readRuns(state);
  try {
    writeFileSync(file, '{"stage":');
    expect(readRuns(state).some((r) => r.id === "2026-09-03-stale" && r.stage === "build")).toBe(true);
  } finally {
    writeFileSync(file, saved);
    const then = new Date(Date.now() - 2 * 3600_000);
    utimesSync(file, then, then);
  }
});

test("statusOf: waiting beats stage, mtime decides running vs stalled", () => {
  const now = Date.now();
  const [stale, done, waiting] = readRuns(state);
  expect(statusOf(waiting!, now)).toBe("waiting");
  expect(statusOf(done!, now)).toBe("done");
  expect(statusOf(stale!, now)).toBe("stalled");
  expect(statusOf({ ...stale!, moved: now }, now)).toBe("running");
  expect(statusOf({ ...stale!, stage: "abandoned", awaiting: "x" }, now)).toBe("abandoned");
  // A builder ticking progress.md is moving, though state.json is old.
  const progress = join(state, "runs", "2026-09-03-stale", "progress.md");
  writeFileSync(progress, "- doing: step 2\n");
  try { expect(statusOf(readRuns(state)[0]!, now)).toBe("running"); } finally { rmSync(progress); }
  expect(statusOf(readRuns(state)[0]!, now)).toBe("stalled");
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

test("inbox reads a bullet typed by hand as an open idea", () => {
  const dir = mkdtempSync(join(tmpdir(), "kz-inbox-"));
  writeFileSync(join(dir, "inbox.md"), "# Ideas\n- Add dark mode\n* [ ] Faster search\n- done: shipped\n  a note\n");
  expect(readInbox(dir).map((l) => [l.status, l.text, l.notes])).toEqual([
    ["open", "Add dark mode", undefined],
    ["open", "Faster search", undefined],
    ["done", "shipped", "a note"],
  ]);
  rmSync(dir, { recursive: true, force: true });
});

test("boardCards: idea retired once a run's request contains it; started idea sits in planning", () => {
  const cards = boardCards([state], Date.now());
  const ideas = cards.filter((k) => k.kind === "idea").map((k) => [k.text, k.column, k.status]);
  expect(ideas).toEqual([["retry failed webhooks", 0, "idea"], ["nightly digest", 1, "starting"]]);
  const runs = cards.filter((k) => k.kind === "run").map((k) => [k.id, k.column, k.status]);
  expect(runs).toEqual([["2026-09-03-stale", 2, "stalled"], ["2026-09-02-done", 4, "done"], ["2026-09-01-waiting", 1, "waiting"]]);
});

test("boardCards: a started idea stays until its run has a state.json", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "kaizen-")), ".kaizen");
  const r = join(dir, "runs", "2026-01-01-new");
  mkdirSync(r, { recursive: true });
  writeInbox(dir, [{ status: "started", text: "full release" }]);
  writeFileSync(join(r, "00-request.md"), "full release\n");
  const cards = () => boardCards([dir], Date.now()).map((k) => k.kind);
  expect(cards()).toEqual(["idea"]);
  writeFileSync(join(r, "state.json"), JSON.stringify({ id: "2026-01-01-new", stage: "plan", awaiting: null }));
  expect(cards()).toEqual(["run"]);
  rmSync(join(dir, ".."), { recursive: true, force: true });
});

test("boardCards: a started idea retires into the run its launch's session wrote, however reworded", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "kaizen-")), ".kaizen");
  const r = join(dir, "runs", "2026-01-01-reworded");
  mkdirSync(r, { recursive: true });
  mkdirSync(join(dir, "sessions"));
  writeInbox(dir, [{ status: "started", text: "revision" }]);
  writeFileSync(join(r, "00-request.md"), "- add a form for the icebox\n");
  writeFileSync(join(dir, "sessions", "1-a.json"), JSON.stringify({ run: null, text: "revision", cmd: "claude", sessionId: "abc", started: Date.now() }));
  const cards = () => boardCards([dir], Date.now()).map((k) => k.kind);
  writeFileSync(join(r, "state.json"), JSON.stringify({ id: "2026-01-01-reworded", stage: "build", awaiting: null }));
  expect(cards()).toEqual(["idea", "run"]);
  writeFileSync(join(r, "state.json"), JSON.stringify({ id: "2026-01-01-reworded", stage: "build", awaiting: null, session: "abc" }));
  expect(cards()).toEqual(["run"]);
  rmSync(join(dir, ".."), { recursive: true, force: true });
});

test("boardCards: a run older than the idea does not retire it", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "kaizen-")), ".kaizen");
  const r = join(dir, "runs", "2026-01-01-old");
  mkdirSync(r, { recursive: true });
  writeFileSync(join(r, "state.json"), JSON.stringify({ id: "2026-01-01-old", stage: "done", awaiting: null }));
  writeFileSync(join(r, "00-request.md"), "fix this bugs\n");
  const then = new Date(Date.now() - 3600_000);
  utimesSync(join(r, "00-request.md"), then, then);
  writeInbox(dir, [{ status: "open", text: "fix this bugs" }]);
  expect(readFileSync(join(dir, "inbox.md"), "utf8")).toMatch(/- open: fix this bugs <!-- added:\d+ -->/);
  expect(readInbox(dir)[0]!.text).toBe("fix this bugs");
  const ideas = () => boardCards([dir], Date.now()).filter((k) => k.kind === "idea").map((k) => k.text);
  expect(ideas()).toEqual(["fix this bugs"]);
  // Rewriting keeps the stamp, so an edit to notes does not make it vanish.
  writeInbox(dir, readInbox(dir).map((l) => ({ status: l.status, text: l.text, notes: "n" })));
  expect(ideas()).toEqual(["fix this bugs"]);
  // A run started after it retires it as before.
  utimesSync(join(r, "00-request.md"), new Date(), new Date(Date.now() + 5000));
  expect(ideas()).toEqual([]);
  // Re-adding the same words while an old line holds them is a new idea with its
  // own stamp, not the old line's (or no) stamp.
  writeFileSync(join(dir, "inbox.md"), "- done: fix this bugs\n");
  writeInbox(dir, [...readInbox(dir), { status: "open", text: "fix this bugs" }]);
  utimesSync(join(r, "00-request.md"), then, then);
  expect(ideas()).toEqual(["fix this bugs"]);

  rmSync(join(dir, ".."), { recursive: true, force: true });
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

test("backlog: an abandoned run's items are neither listed nor counted", () => {
  const dir = join(state, "runs", "2026-09-03-dropped");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.json"), JSON.stringify({ id: "2026-09-03-dropped", stage: "abandoned" }));
  writeFileSync(join(dir, "06-backlog.md"), "- open: never happening\n");
  expect(allBacklog(state).some((g) => g.run === "2026-09-03-dropped")).toBe(false);
  expect(backlog(state)).toBe(3);
  rmSync(dir, { recursive: true });
});

test("runToIdea: a planning run goes back to its idea, newer than the run", () => {
  const id = "2026-09-04-planning", dir = join(state, "runs", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.json"), JSON.stringify({ id, stage: "plan", awaiting: "approvals.plan" }));
  writeFileSync(join(dir, "00-request.md"), "/kaizen lite export invoices as csv\n");
  const then = new Date(Date.now() - 30_000);
  utimesSync(join(dir, "00-request.md"), then, then);
  writeInbox(state, [...readInbox(state), { status: "started", text: "export invoices", added: Date.now() - 60_000 }, { status: "started", text: "export invoices as csv", notes: "see #12", added: Date.now() - 60_000 }]);
  expect(runToIdea(state, id)).toBeNull();
  expect(JSON.parse(readFileSync(join(dir, "state.json"), "utf8")).stage).toBe("abandoned");
  const cards = boardCards([state], Date.now());
  expect(cards.find((c) => c.kind === "idea" && c.text === "export invoices as csv")).toMatchObject({ status: "idea", notes: "see #12" });
  expect(cards.find((c) => c.kind === "run" && c.id === id)?.archived).toBe(true);
  expect(readInbox(state).filter((l) => l.text === "export invoices as csv").length).toBe(1);
  expect(readInbox(state).find((l) => l.text === "export invoices")?.status).toBe("started");
  expect(runToIdea(state, id)).toMatch(/planning/);
  writeFileSync(join(dir, "state.json"), JSON.stringify({ id, stage: "plan" }));
  rmSync(join(dir, "00-request.md"));
  expect(runToIdea(state, id)).toMatch(/no request/);
  replaceIdea(state, "export invoices", null);
  setArchived(state, id, false);
  rmSync(dir, { recursive: true });
});

test("abandonRun refuses a done run", () => {
  expect(abandonRun(state, "2026-09-02-done", "late")).toMatch(/already done/);
});

test("parseItem: finding line splits into where, severity, text", () => {
  const it = parseItem("`cli/x.ts:12`: low: first thing. Fix: do it.");
  expect([it.where, it.severity, it.text]).toEqual(["x.ts:12", "low", "first thing."]);
  expect(parseItem("plain item").severity).toBeNull();
});

test("parseItem: severity written as a range, a tag in brackets, or a numbered line", () => {
  const sev = (s: string) => parseItem(s).severity;
  expect(parseItem("cli/a.ts:4-9, cli/b.ts:2: high: crashes. Fix: catch.")).toMatchObject({ severity: "high", where: "b.ts:2", text: "crashes." });
  expect(sev("bot/x.ts `ctxNow` - low - no test")).toBe("low");
  expect(parseItem("1. low — defaults are Bahasa")).toMatchObject({ severity: "low", where: null });
  expect(sev("Finding 1 (medium) — proxy checks host only")).toBe("medium");
  expect(sev("Tech Lead turn per item; watch cost. (review finding 3, low)")).toBe("low");
  expect(sev("[low] Test for ptyOf")).toBe("low");
  expect(sev("Crane top may touch low (2.2 m) storeys")).toBeNull();
  expect(sev("add dark mode (low priority)")).toBeNull();
  expect(sev("the price is too low")).toBeNull();
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

test("approvalPrompt: approve or revise, the comment kept on one line", () => {
  expect(approvalPrompt("r", "approvals.plan")).toBe("run r: the plan is approved from the board. Record it in 02-approval.md and build it, first asking any of its open questions still unanswered.");
  expect(approvalPrompt("r", "approvals.review", "  ")).toContain("approved from the board at the final approval");
  const p = approvalPrompt("r", "approvals.plan", " drop step 3,\n\tkeep \"the rest\" ");
  expect(p).toContain('to revise: "drop step 3, keep "the rest"".');
  expect(p).toContain("revise 01-plan.md");
  expect(p).not.toContain("\n");
  expect(approvalPrompt("r", "approvals.review")).toContain("commit and push this run's changed files only");
  expect(approvalPrompt("r", "findings")).toContain("commit and push");
  expect(approvalPrompt("r", "approvals.review")).toContain("kaizen worktree land");
  expect(approvalPrompt("r", "approvals.review", "rename it")).not.toContain("push");
  expect(approvalPrompt("r", "approvals.plan")).not.toContain("push");
  expect(approvalPrompt("r", "approvals.review", "rename it")).toContain('final approval: "rename it". Record it in 02-approval.md, change the work');
});

test("final approval can explicitly accept a run still awaiting findings", () => {
  expect(stateModule.canApproveAwaiting("approvals.plan")).toBe(true);
  expect(stateModule.canApproveAwaiting("approvals.review")).toBe(true);
  expect(stateModule.canApproveAwaiting("findings")).toBe(true);
  expect(stateModule.canApproveAwaiting("building")).toBe(false);
  expect(approvalPrompt("r", "findings")).toContain("run as-is at the findings gate");
  expect(approvalPrompt("r", "findings")).toContain("leave every remaining finding open");
});

test("approvalPrompt: a plan's answers numbered on one line", () => {
  const p = approvalPrompt("r", "approvals.plan", undefined, ["Where? — Footer", "Chip?\n — No; keep it\tsmall"]);
  expect(p).toBe("run r: the plan is approved from the board, with answers to its open questions: 1) Where? — Footer; 2) Chip? — No; keep it small. Record them in 02-approval.md and build the plan with them.");
  expect(approvalPrompt("r", "approvals.plan", "redo it", ["x"])).toContain("to revise");
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
  expect(a).toMatchObject({ status: "open", text: "with notes", notes: "see https://x.y/z\ncli/state.ts:12 | not a reason" });
  expect(b).toMatchObject({ status: "open", text: "plain zq8" });
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
  // The New idea form's path: idea first, then its files as a note; a plain file reaches the run by absolute path.
  const doc = saveAttachment(state, null, "spec.pdf", new Uint8Array([3]));
  expect(appendNote(state, { text: "chatty zq6" }, `[spec.pdf](${doc})`)).toBeNull();
  expect(requestOf("/kaizen chatty zq6", readInbox(state)[0]!.notes, state)).toContain(`[spec.pdf](${join(state, doc)})`);
  expect(saveAttachment(state, "2026-09-01-waiting", "b.txt", new Uint8Array([2]))).toMatch(/^runs\/2026-09-01-waiting\/attachments\//);
});

test("agentFlags reads a long, commented agent block with no entry for the tool in milliseconds", () => {
  // The block-skipping pattern once backtracked for seconds per call here, and a board that listed its
  // agents on every page load stopped answering.
  const cfg = "agent:\n  default: claude\n" + "  # a long comment about what this setting does and when\n".repeat(150) + "  close: on\n";
  const t = performance.now();
  for (const cmd of ["claude", "codex", "agy", "gemini", "opencode"]) expect(agentFlags("/p", cmd, cfg)).toEqual([]);
  expect(performance.now() - t).toBeLessThan(500);
});

test("agentFlags: per-tool model and effort from the agent block, inline or nested", () => {
  const cfg = `agent:\n  default: auto\n  codex: { model: gpt-5, effort: low }\n  claude:\n    model: sonnet\n    effort: low\n  gemini:\n    model: "gemini-2.5-pro"\n`;
  expect(agentFlags("/p", "codex", cfg)).toEqual(["-m", "gpt-5", "-c", "model_reasoning_effort=low"]);
  expect(agentFlags("/p", "claude", cfg)).toEqual(["--model", "sonnet", "--effort", "low"]);
  expect(agentFlags("/p", "gemini", cfg)).toEqual(["-m", "gemini-2.5-pro"]);
  expect(agentFlags("/p", "agy", cfg)).toEqual([]);
  expect(agentFlags("/p", "codex", "agent:\n  default: codex\n")).toEqual([]);
});

test("plainModel: a typed model reaches launch lines only as a plain name", () => {
  for (const m of ["opus", "gpt-5.1", "gemini-2.5-pro", "anthropic/claude-sonnet-4", "o3:high", "x@y"]) expect(plainModel(m)).toBe(true);
  for (const m of ["", "x; rm -rf ~", "$(id)", "`id`", "a b", "'q'", "\"q\"", "opus[1m]", "-rf", "x".repeat(81)]) expect(plainModel(m)).toBe(false);
});

test("each tool gets the opening prompt the way it takes one: agy -i, opencode --prompt, the rest bare", () => {
  const p = mkdtempSync(join(tmpdir(), "kz-"));   // no .kaizen: no session record
  const argv = (cmd: string) => sessionLaunch(p, cmd, [cmd], "/kaizen x", "x").fullCmd;
  expect(argv("agy")).toEqual(["agy", "-i", "/kaizen x"]);
  expect(argv("opencode")).toEqual(["opencode", "--prompt", "/kaizen x"]);
  expect(argv("codex")).toEqual(["codex", "/kaizen x"]);
  expect(argv("gemini")).toEqual(["gemini", "/kaizen x"]);
  if (process.platform !== "win32") expect(manualCommand("/p", "agy", "/kaizen x", ["--model", "m"])).toBe("cd '/p' && agy --model m -i '/kaizen x'");
});

test.skipIf(process.platform === "win32")("agent choice: project then global config, a note for a missing tool, a pick, and a run keeps its own", () => {
  // The global config sits at the home bound at import, so this runs in a child with a scratch HOME.
  const home = mkdtempSync(join(tmpdir(), "kz-home-")), bin = mkdtempSync(join(tmpdir(), "kz-bin-"));
  for (const t of ["claude", "codex"]) writeFileSync(join(bin, t), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const script = `const S = await import(${JSON.stringify(join(dirname(import.meta.path), "state.ts"))});
const fs = require("node:fs"), { join } = require("node:path");
const P = join(process.env.HOME, "proj"), st = join(P, ".kaizen"), G = join(process.env.HOME, ".kaizen");
fs.mkdirSync(join(st, "runs", "r1"), { recursive: true }); fs.mkdirSync(G, { recursive: true });
fs.writeFileSync(join(G, "config.yml"), "agent:\\n  default: codex\\n  codex: { model: gpt-5, effort: low }\\n");
fs.writeFileSync(join(st, "config.yml"), "mode: approve\\n");
const out = { chain: [S.detectDefaultAgent(P).cmd, S.agentFlags(P, "codex")] };
fs.writeFileSync(join(st, "config.yml"), "agent:\\n  default: claude\\n  codex:\\n    model: o3\\n");
out.project = [S.detectDefaultAgent(P).cmd, S.agentFlags(P, "codex")];
out.missing = S.detectDefaultAgent(P, "gemini");
out.pick = [S.detectDefaultAgent(P, "codex").cmd, S.agentFlags(P, "codex", undefined, "gpt-5.1")];
out.choices = S.agentChoices(P);
// No terminal on PATH or display in env: the launch fails and hands back its manual line.
const idea = { severity: null, where: null, text: "x", raw: "x" };
// macOS always drives Terminal.app, which would open a real window: Linux only.
if (process.platform === "linux") out.yolo = [S.launchRun(idea, P, undefined, { agent: "codex", yolo: true }), S.launchRun(idea, P, undefined, { agent: "codex" }), S.launchRun(idea, P, undefined, { agent: "gemini", yolo: true })].map((r) => [r.ok, r.agent.cmd, /--dangerously-bypass|--dangerously-skip|--yolo/.test(r.manual)]);
fs.writeFileSync(join(st, "runs", "r1", "state.json"), JSON.stringify({ agent: "codex" }));
out.fromState = S.runAgent(st, "r1");
S.sessionLaunch(P, "codex", ["codex"], "/kaizen x", "x", "r1", "gpt-5.1");
out.fromRecord = S.runAgent(st, "r1");
out.tags = [S.boardCards([st], Date.now()).find((c) => c.id === "r1")?.tags];
S.sessionLaunch(P, "codex", ["codex"], "/kaizen x", "x", "r1", undefined, true);
out.tags.push(S.boardCards([st], Date.now()).find((c) => c.id === "r1")?.tags);
console.log(JSON.stringify(out));`;
  try {
    const p = Bun.spawnSync(["bun", "-e", script], { cwd: home, env: { ...process.env, HOME: home, PATH: bin + ":" + dirname(process.execPath), DISPLAY: "", WAYLAND_DISPLAY: "", TERMINAL: "", TMUX: "", HERDR_ENV: "" } });
    if (p.exitCode !== 0) throw new Error(p.stderr.toString());
    expect(JSON.parse(p.stdout.toString())).toEqual({
      // A project config.yml with no agent block leaves the global one in force.
      chain: ["codex", ["-m", "gpt-5", "-c", "model_reasoning_effort=low"]],
      project: ["claude", ["-m", "o3"]],
      missing: { name: "Claude Code", cmd: "claude", note: "Gemini CLI is not installed; opened Claude Code instead" },
      pick: ["codex", ["-m", "gpt-5.1"]],
      choices: { default: "claude", agents: [
        { name: "Claude Code", cmd: "claude", model: "", models: true, yolo: true },
        { name: "Codex", cmd: "codex", model: "o3", models: true, yolo: true },
      ] },
      // Yolo adds the tool's bypass flag only when asked for, and not to a fallback tool.
      ...(process.platform === "linux" ? { yolo: [[false, "codex", true], [false, "codex", false], [false, "claude", false]] } : {}),
      tags: [["codex"], ["codex", "yolo"]],
      fromState: { cmd: "codex", model: null },
      fromRecord: { cmd: "codex", model: "gpt-5.1" },
    });
  } finally { rmSync(home, { recursive: true, force: true }); rmSync(bin, { recursive: true, force: true }); }
});

test("boardCards: a short idea is not retired by a request that merely contains the word", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "kz-")), ".kaizen");
  mkdirSync(join(dir, "runs", "2026-09-01-a"), { recursive: true });
  writeFileSync(join(dir, "runs", "2026-09-01-a", "state.json"), JSON.stringify({ id: "2026-09-01-a", stage: "plan", awaiting: null }));
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
  // The card's mark: the run with changed files is pending; one with none and no record says nothing.
  const due1: Record<string, "commit" | "push"> = {};
  expect(cardsGit(st, ["r1", "nope"], due1)).toEqual({ r1: "pending" });
  expect(due1).toEqual({ r1: "commit" });
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
  expect(cardsGit(st, ["r1", "r0", "nope"])).toEqual({ r1: "pushed", r0: "pushed" });   // r0: no record, but its file is in; c.txt still changed is not its business
  // A done run whose report is touched after its commit is not offered later changes to its files.
  writeFileSync(join(st, "runs", "r1", "state.json"), JSON.stringify({ stage: "done", updated: "2000-01-01T00:00:00Z" }));
  utimesSync(join(st, "runs", "r1", "03-impl.md"), new Date(Date.now() + 60000), new Date(Date.now() + 60000));
  writeFileSync(join(proj, "a.txt"), "a2");
  expect(runGit(st, "r1")).toMatchObject({ files: [] });
  writeFileSync(join(proj, "a.txt"), "a");
  rmSync(join(st, "runs", "r1", "state.json"));

  // Windows has no file named b*.txt, so the rest is for everywhere else.
  if (process.platform === "win32") return;
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
  const due2: Record<string, "commit" | "push"> = {};
  expect(cardsGit(st, ["r1"], due2)).toEqual({ r1: "pending" });   // committed, not pushed
  expect(due2).toEqual({ r1: "push" });
  expect(cardsGit(join(root, ".kaizen"), ["r1"])).toEqual({});   // not a repo
}, 60_000);   // dozens of git calls, ~250ms each on Windows

test("runGit, cardsGit: a run committed elsewhere is not offered the edits made since, nor another run's unpushed commit", () => {
  const root = mkdtempSync(join(tmpdir(), "kz-git-"));
  const bare = join(root, "remote.git"), proj = join(root, "proj"), st = join(proj, ".kaizen");
  // Commit times pinned (seconds since the epoch), so each sits where the test says.
  const sh = (cwd: string, at: number | null, ...a: string[]) => Bun.spawnSync(["git", "-C", cwd, ...a], { env: { ...process.env, ...(at ? { GIT_COMMITTER_DATE: `@${at} +0000`, GIT_AUTHOR_DATE: `@${at} +0000` } : {}) } }).stdout.toString().trim();
  const report = (id: string, text: string, at: number) => {
    mkdirSync(join(st, "runs", id), { recursive: true });
    writeFileSync(join(st, "runs", id, "03-impl.md"), text);
    utimesSync(join(st, "runs", id, "03-impl.md"), new Date(at * 1000), new Date(at * 1000));
  };
  Bun.spawnSync(["git", "init", "-q", "--bare", bare]);
  Bun.spawnSync(["git", "init", "-q", proj]);
  for (const kv of [["user.name", "t"], ["user.email", "t@t"], ["commit.gpgsign", "false"], ["core.hooksPath", "/dev/null"]]) sh(proj, null, "config", ...kv);
  sh(proj, null, "remote", "add", "origin", bare);
  writeFileSync(join(proj, ".gitignore"), ".kaizen/\n");
  writeFileSync(join(proj, "x.txt"), "1");
  report("old", "- `x.txt`: x\n", 1000);
  sh(proj, null, "add", "-A");
  sh(proj, 2000, "commit", "-qm", "feat: x");
  sh(proj, null, "push", "-qu", "origin", "HEAD");
  // Edited again after the run's commit, by someone with no run of their own.
  writeFileSync(join(proj, "x.txt"), "2");
  expect(runGit(st, "old")).toMatchObject({ files: [], ahead: 0, others: 1 });
  expect(cardsGit(st, ["old"])).toEqual({ old: "pushed" });
  // Another run's commit, not pushed: the branch is ahead, the old run is not.
  writeFileSync(join(proj, "y.txt"), "y");
  report("new", "- `y.txt`: y\n", 3000);
  sh(proj, null, "add", "y.txt");
  sh(proj, 4000, "commit", "-qm", "feat: y");
  expect(runGit(st, "old")).toMatchObject({ files: [], ahead: 0 });
  expect(runGit(st, "new")).toMatchObject({ files: [], ahead: 1 });
  expect(cardsGit(st, ["old", "new"])).toEqual({ old: "pushed", new: "pending" });
  // The old run reporting again after its commit: the edit is its work after all.
  report("old", "- `x.txt`: x, again\n", 5000);
  expect((runGit(st, "old") as any).files).toEqual([" M x.txt"]);
  // A commit no run's report names still gets a push: from the run that reported last by then.
  const commit = (f: string, at: number, msg: string) => { writeFileSync(join(proj, f), f); sh(proj, null, "add", f); sh(proj, at, "commit", "-qm", msg); };
  commit("z.txt", 6000, "chore: z");
  expect(runGit(st, "old")).toMatchObject({ ahead: 1 });
  expect(runGit(st, "new")).toMatchObject({ ahead: 1 });
  // A run whose report holds the commit's subject as a line owns it, over the file count.
  report("new", "- `y.txt`: y\n\n## Commit\nchore: z\n", 3000);
  expect(runGit(st, "old")).toMatchObject({ ahead: 0 });
  expect(runGit(st, "new")).toMatchObject({ ahead: 2 });
  // Both runs name the file; without a subject or SHA the newer report wins.
  report("old", "- `x.txt`: x, again\n- `y.txt`: shared\n", 5000);
  report("new", "- `y.txt`: shared\n\n## Commit\nchore: z\n", 5500);
  writeFileSync(join(proj, "y.txt"), "shared change");
  sh(proj, null, "add", "y.txt");
  sh(proj, 7000, "commit", "-qm", "fix: shared");
  expect(runGit(st, "old")).toMatchObject({ ahead: 0 });
  expect(runGit(st, "new")).toMatchObject({ ahead: 2 });
  const sha = sh(proj, null, "rev-parse", "--short", "HEAD");
  writeFileSync(join(st, "runs", "old", "07-commit.md"), `commit: ${sha}\npushed: no\n`);
  expect(runGit(st, "old")).toMatchObject({ ahead: 1 });
  expect(runGit(st, "new")).toMatchObject({ ahead: 1 });
  expect(cardsGit(st, ["old", "new"])).toEqual({ old: "pending", new: "pending" });
}, 60_000);

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
    expect(findTerminal("/p", full)?.cmd[0] ?? "none").not.toMatch(/^(sh|tmux)$/);   // neither installed (none: no terminal, as on CI)
    stub("herdr", 1); stub("tmux", 1);
    expect(findTerminal("/p", full)?.cmd[0] ?? "none").not.toMatch(/^(sh|tmux)$/);   // installed, no server
    process.env.TMUX = "/tmp/x,1,0"; process.env.HERDR_ENV = "1";
    expect(findTerminal("/p", full)?.cmd[0] ?? "none").not.toMatch(/^(sh|tmux)$/);   // stale env from a server since stopped
    delete process.env.TMUX; delete process.env.HERDR_ENV; stub("tmux", 0);
    const t = findTerminal("/p", full)!;                                   // outside it, server up
    expect(t.cmd.slice(0, 4)).toEqual(["tmux", "new-window", "-c", "/p"]);
    stub("herdr", 0);
    const h = findTerminal("/p", full)!;
    expect([h.cmd[0], h.cmd[1], h.cmd[4], h.detached]).toEqual(["sh", "-c", "/p", false]);
    expect(h.cmd[2]).toContain(`pane run "$p" "exec sh $f"`);   // exec: the tab closes with the agent
    expect(h.cmd[2]).toContain("[ $s = 127 ] || exit $s");   // ...unless it never started
    expect(t.cmd.slice(4)).toEqual(full);   // argv: tmux runs it without its default-shell
    const back = Bun.spawnSync(["/bin/sh", "-c", `printf '%s\\n' ${h.cmd[5]}`]).stdout.toString();
    expect(back).toBe(full.join("\n") + "\n");
  } finally {
    keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
    rmSync(bin, { recursive: true, force: true });
  }
});

test("nativePath on Windows reads the spellings Git Bash writes into the projects registry as one folder", () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  try {
    Object.defineProperty(process, "platform", { value: "win32" });
    for (const p of ["/c/Users/me/proj", "C:/Users/me/proj", "c:\\Users\\me\\proj\\", "C:\\Users\\me\\proj"])
      expect(nativePath(p)).toBe("C:\\Users\\me\\proj");
    expect(nativePath("/d")).toBe("D:\\");
    Object.defineProperty(process, "platform", { value: "linux" });
    expect(nativePath("/c/Users/me")).toBe("/c/Users/me");   // elsewhere a path is left alone
  } finally { Object.defineProperty(process, "platform", platform); }
});

test("findTerminal on macOS opens $TERMINAL as an app; iTerm through a script", () => {
  const keys = ["PATH", "TERMINAL", "TMUX", "HERDR_ENV"];
  const saved = keys.map((k) => process.env[k]);
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  try {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.env.PATH = mkdtempSync(join(tmpdir(), "kz-empty-"));
    delete process.env.TMUX; delete process.env.HERDR_ENV;
    process.env.TERMINAL = "Ghostty";
    expect(findTerminal("/p", ["claude", "x"])!.cmd).toEqual(["open", "-na", "Ghostty", "--args", "--working-directory=/p", "-e", "claude", "x"]);
    process.env.TERMINAL = "iTerm";
    const i = findTerminal("/p", ["claude", "x"])!;
    expect(i.cmd[2]).toContain('create window with default profile command');
    expect(i.cmd.slice(4)).toEqual(["'/p'", "'claude' 'x'"]);
  } finally {
    Object.defineProperty(process, "platform", platform);
    keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
  }
});

test("findTerminal on Windows names cmd and PowerShell by full path, so a PATH without System32 still launches", () => {
  const keys = ["PATH", "ComSpec", "SystemRoot", "windir"];
  const saved = keys.map((k) => process.env[k]);
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  try {
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env.PATH = mkdtempSync(join(tmpdir(), "kz-empty-"));
    for (const k of keys.slice(1)) delete process.env[k];
    process.env.SystemRoot = "D:\\Win";
    const t = findTerminal("C:\\p", ["claude", "/kaizen x"])!;
    expect(t.cmd[0]).toBe("D:\\Win\\System32\\cmd.exe");
    expect(t.cmd[6]).toBe("D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    process.env.ComSpec = "E:\\cmd.exe";
    expect(findTerminal("C:\\p", ["claude"])!.cmd[0]).toBe("E:\\cmd.exe");
    // A running herdr: a tab, and the run typed into it as one encoded line. The fake
    // is a shell script, which real Windows cannot run with ComSpec pointed elsewhere.
    if (platform.value === "win32") return;
    writeFileSync(join(process.env.PATH, "herdr"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const h = findTerminal("C:\\p", ["claude", "/kaizen it's\nnote"])!;
    expect([h.cmd[0], h.cmd[1], h.cmd[2], h.detached]).toEqual(["D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "-NoProfile", "-EncodedCommand", false]);
    const launch = Buffer.from(h.cmd[3], "base64").toString("utf16le");
    expect(launch).toContain("tab create --cwd 'C:\\p' --label kaizen --focus");
    const typed = /pane run \$Matches\[1\] '(.*)' \}/.exec(launch)![1].replace(/''/g, "'");
    expect(typed).not.toContain("\n");
    expect(typed).toEndWith("; exit");   // the tab closes with the run
    const run = Buffer.from(typed.split(" -EncodedCommand ")[1].replace(/; exit$/, ""), "base64").toString("utf16le");
    expect(run).toBe("Set-Location 'C:\\p'; & 'claude' '/kaizen it''s\nnote'");
  } finally {
    Object.defineProperty(process, "platform", platform);
    keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
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

test("winToastArgs carries the body base64, so a quote cannot end the PowerShell string", () => {
  const body = "it's \"done\" — ~/acme\n$(rm)";
  const a = winToastArgs(body);
  expect(a[0]).toMatch(/WindowsPowerShell\\v1\.0\\powershell\.exe$/);
  const b64 = /FromBase64String\('([^']+)'\)/.exec(a.at(-1)!)![1]!;
  expect(Buffer.from(b64, "base64").toString("utf8")).toBe(body);
  expect(a.at(-1)).not.toContain("rm)");
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

test("files written by Windows PowerShell, with a byte order mark, still read: the run shows, the first idea is an idea", () => {
  const st = join(mkdtempSync(join(tmpdir(), "kaizen-bom-")), ".kaizen");
  mkdirSync(join(st, "runs", "r1"), { recursive: true });
  writeFileSync(join(st, "runs", "r1", "state.json"), "﻿" + JSON.stringify({ id: "r1", stage: "plan", awaiting: "approvals.plan" }));
  writeFileSync(join(st, "inbox.md"), "﻿- open: first idea\n");
  expect(readRuns(st).map((r) => [r.id, r.stage])).toEqual([["r1", "plan"]]);
  expect(readInbox(st)).toEqual([{ status: "open", text: "first idea" }]);
});

test("remember on Windows stores one spelling per folder, the one knownProjects returns", () => {
  // REGISTRY is bound to the home at import, so this runs in a child with a scratch HOME.
  const home = mkdtempSync(join(tmpdir(), "kz-home-"));
  const script = `Object.defineProperty(process, "platform", { value: "win32" });
const { remember, knownProjects, REGISTRY } = await import(${JSON.stringify(join(dirname(import.meta.path), "state.ts"))});
remember("c:\\\\p"); remember("C:\\\\p"); remember("/c/p");
console.log(JSON.stringify([require("node:fs").readFileSync(REGISTRY, "utf8"), knownProjects()]));`;
  try {
    const p = Bun.spawnSync(["bun", "-e", script], { cwd: home, env: { ...process.env, HOME: home, USERPROFILE: home } });
    if (p.exitCode !== 0) throw new Error(p.stderr.toString());
    expect(JSON.parse(p.stdout.toString())).toEqual(["C:\\p\n", ["C:\\p"]]);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("the project registry lists one folder once: trailing slash and symlink spellings collapse, the file is not rewritten", () => {
  const home = mkdtempSync(join(tmpdir(), "kz-home-")), proj = join(home, "shop");
  mkdirSync(proj);
  symlinkSync(proj, join(home, "link"));
  mkdirSync(join(home, ".kaizen"));
  const dup = `${proj}\n${proj}/\n${join(home, "link")}\n`;
  writeFileSync(join(home, ".kaizen", "projects"), dup);
  const script = `const { remember, knownProjects, REGISTRY } = await import(${JSON.stringify(join(dirname(import.meta.path), "state.ts"))});
remember(${JSON.stringify(join(home, "link") + "/")});
console.log(JSON.stringify([knownProjects(), require("node:fs").readFileSync(REGISTRY, "utf8")]));`;
  try {
    const p = Bun.spawnSync(["bun", "-e", script], { cwd: home, env: { ...process.env, HOME: home, USERPROFILE: home } });
    if (p.exitCode !== 0) throw new Error(p.stderr.toString());
    const [list, file] = JSON.parse(p.stdout.toString());
    expect(list).toEqual([realpathSync(proj)]);
    expect(file).toBe(dup); // already known: nothing appended, nothing rewritten
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("files saved with CRLF (PowerShell, autocrlf clones) read the same as LF", () => {
  const lf = join(mkdtempSync(join(tmpdir(), "kz-")), ".kaizen"), crlf = join(mkdtempSync(join(tmpdir(), "kz-")), ".kaizen");
  const files = {
    "config.yml": "agent:\n  default: claude\n  claude: { model: opus, effort: high }\n",
    "inbox.md": "# Inbox\n\n- open: add retry\n- rejected: drop cache\n",
    "runs/2026-10-01-a/state.json": JSON.stringify({ stage: "build", status: "running" }, null, 2) + "\n",
    "runs/2026-10-01-a/00-request.md": "# Request\n\n> /kaizen add retry\n",
  };
  for (const [dir, eol] of [[lf, "\n"], [crlf, "\r\n"]] as const)
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      writeFileSync(join(dir, f), text.replace(/\n/g, eol));
    }
  expect(agentFlags(dirname(crlf), "claude")).toEqual(["--model", "opus", "--effort", "high"]);
  expect(readInbox(crlf)).toEqual(readInbox(lf));
  const runs = (s: string) => readRuns(s).map(({ moved, ...r }) => ({ ...r, dir: undefined }));
  expect(runs(crlf)).toEqual(runs(lf));
});

// A project whose agent sessions are recorded: close on, one run asked for "tidy logs".
const sessionProject = () => {
  const p = mkdtempSync(join(tmpdir(), "kz-sess-"));
  mkdirSync(join(p, ".kaizen", "runs"), { recursive: true });
  writeFileSync(join(p, ".kaizen", "config.yml"), "agent:\n  default: claude\n  close: on\n");
  return p;
};
const newRun = (p: string, id: string, request: string, s: object = { stage: "plan", awaiting: "approvals.plan" }) => {
  mkdirSync(join(p, ".kaizen", "runs", id), { recursive: true });
  writeFileSync(join(p, ".kaizen", "runs", id, "00-request.md"), `# Request (verbatim)\n\n${request}\n`);
  writeFileSync(join(p, ".kaizen", "runs", id, "state.json"), JSON.stringify(s));
};

test("sessionLaunch: claude gets a conversation id, a decision resumes it while its transcript exists, codex starts fresh", () => {
  const p = sessionProject(), st = join(p, ".kaizen");
  const saved = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), "kz-claude-"));
  try {
    const idea = sessionLaunch(p, "claude", ["/bin/claude", "--model", "opus"], "/kaizen tidy logs", "tidy logs");
    const [rec] = readSessions(st);
    expect(rec.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(idea.fullCmd).toEqual(["/bin/claude", "--session-id", rec.sessionId!, "--model", "opus", "/kaizen tidy logs"]);
    expect(idea.pidFile).toBe(join(st, "sessions", rec.key + ".pid"));
    newRun(p, "2026-10-01-tidy-logs", "/kaizen tidy logs");
    expect(ownerOf(st, rec)).toBe("2026-10-01-tidy-logs");

    // No transcript on disk: a fresh session, with an id of its own.
    const fresh = sessionLaunch(p, "claude", ["/bin/claude"], "/kaizen run x: approved", "run x: approved", "2026-10-01-tidy-logs");
    expect(fresh.fullCmd[1]).toBe("--session-id");
    expect(fresh.fullCmd[2]).not.toBe(rec.sessionId);

    const t = join(process.env.CLAUDE_CONFIG_DIR, "projects", p.replace(/[^A-Za-z0-9]/g, "-"));
    mkdirSync(t, { recursive: true });
    writeFileSync(join(t, `${rec.sessionId}.jsonl`), "{}\n");
    const back = sessionLaunch(p, "claude", ["/bin/claude"], "/kaizen run x: approved", "run x: approved", "2026-10-01-tidy-logs");
    expect(back.fullCmd).toEqual(["/bin/claude", "--resume", rec.sessionId!, "/kaizen run x: approved"]);
    expect(readSessions(st).filter((r) => r.run === "2026-10-01-tidy-logs" && r.sessionId === rec.sessionId)).toHaveLength(1);

    // Another tool's record never resumes; codex takes no id at launch.
    expect(sessionLaunch(p, "codex", ["/bin/codex"], "/kaizen run x: approved", "x", "2026-10-01-tidy-logs").fullCmd).toEqual(["/bin/codex", "/kaizen run x: approved"]);
  } finally {
    saved === undefined ? delete process.env.CLAUDE_CONFIG_DIR : (process.env.CLAUDE_CONFIG_DIR = saved);
  }
  // A folder with no state dir gets no record, and no .kaizen made for one.
  const bare = mkdtempSync(join(tmpdir(), "kz-bare-"));
  expect(sessionLaunch(bare, "claude", ["claude"], "/kaizen x", "x")).toMatchObject({ fullCmd: ["claude", "/kaizen x"], pidFile: undefined });
  expect(existsSync(join(bare, ".kaizen"))).toBe(false);
});

test("ownerOf: an idea's session belongs to the first run created after it, not an older one with the same words", () => {
  const p = sessionProject(), st = join(p, ".kaizen");
  newRun(p, "2026-09-01-old", "/kaizen fix the login page");
  const rec = { key: "k", run: null, text: "fix the login page", cmd: "claude", sessionId: null, started: Date.now() + 5000 };
  expect(ownerOf(st, rec)).toBe(null);
  expect(ownerOf(st, { ...rec, started: 0 })).toBe("2026-09-01-old");
  expect(ownerOf(st, { ...rec, run: "2026-10-01-x" })).toBe("2026-10-01-x");
});

test("ownerOf: a run that recorded the launch's session id owns it, however its request is worded", () => {
  const p = sessionProject(), st = join(p, ".kaizen");
  newRun(p, "2026-10-02-reworded", "/kaizen something else entirely");
  const f = join(st, "runs", "2026-10-02-reworded", "state.json");
  writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, "utf8")), session: "abc" }));
  const rec = { key: "k", run: null, text: "open it on my phone", cmd: "claude", sessionId: "abc", started: Date.now() };
  expect(ownerOf(st, rec)).toBe("2026-10-02-reworded");
  expect(ownerOf(st, { ...rec, sessionId: "other" })).toBe(null);
});

test("ownerOf: a conversation that opens a follow-up run moves to it, even from a decision on its parent", () => {
  const p = sessionProject(), st = join(p, ".kaizen");
  const tag = (id: string, more: object = {}) => {
    const f = join(st, "runs", id, "state.json");
    writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, "utf8")), session: "abc", ...more }));
  };
  const rec = { key: "k", run: null, text: "tidy logs", cmd: "claude", sessionId: "abc", started: Date.now() - 2000 };
  newRun(p, "2026-10-01-parent", "/kaizen tidy logs");
  tag("2026-10-01-parent");
  expect(ownerOf(st, rec)).toBe("2026-10-01-parent");
  // A parent still in flight keeps its terminal.
  newRun(p, "2026-10-02-child", "/kaizen rotate them too\nFollow-up of: 2026-10-01-parent");
  tag("2026-10-02-child");
  expect(ownerOf(st, rec)).toBe("2026-10-01-parent");
  expect(ownerOf(st, { ...rec, run: "2026-10-01-parent" })).toBe("2026-10-01-parent");
  tag("2026-10-01-parent", { stage: "done", awaiting: null });
  expect(ownerOf(st, rec)).toBe("2026-10-02-child");
  expect(ownerOf(st, { ...rec, run: "2026-10-01-parent" })).toBe("2026-10-02-child");
  // A decision launched after both: the run it names, as before.
  expect(ownerOf(st, { ...rec, run: "2026-10-01-parent", started: Date.now() + 5000 })).toBe("2026-10-01-parent");

  // The parent's next decision still continues the conversation the child took over.
  const saved = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), "kz-claude-"));
  try {
    mkdirSync(join(st, "sessions"), { recursive: true });
    const { key, ...body } = rec;
    writeFileSync(join(st, "sessions", key + ".json"), JSON.stringify(body) + "\n");
    const t = join(process.env.CLAUDE_CONFIG_DIR, "projects", p.replace(/[^A-Za-z0-9]/g, "-"));
    mkdirSync(t, { recursive: true });
    writeFileSync(join(t, "abc.jsonl"), "{}\n");
    expect(sessionLaunch(p, "claude", ["/bin/claude"], "/kaizen run x", "x", "2026-10-01-parent").fullCmd.slice(0, 3)).toEqual(["/bin/claude", "--resume", "abc"]);
  } finally {
    saved === undefined ? delete process.env.CLAUDE_CONFIG_DIR : (process.env.CLAUDE_CONFIG_DIR = saved);
  }
});

test("findTerminal records the agent's PID: a POSIX wrapper that execs it, a PowerShell prefix on Windows", () => {
  const keys = ["PATH", "HERDR_ENV", "TMUX", "TERMINAL", "SystemRoot", "windir", "ComSpec"];
  const saved = keys.map((k) => process.env[k]);
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const bin = mkdtempSync(join(tmpdir(), "kz-bin-"));
  try {
    process.env.PATH = bin;
    for (const k of keys.slice(1)) delete process.env[k];
    writeFileSync(join(bin, "tmux"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    if (process.platform !== "win32") {
      const t = findTerminal("/p", ["claude", "/kaizen x"], "/s/k.pid")!;
      expect(t.cmd.slice(4)).toEqual(["sh", "-c", 'echo $$ > "$0"; exec "$@"', "/s/k.pid", "claude", "/kaizen x"]);
    }
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env.SystemRoot = "D:\\Win";
    const w = findTerminal("C:\\p", ["claude", "/kaizen x"], "C:\\p\\.kaizen\\sessions\\k.pid")!;
    const ps = Buffer.from(w.cmd.at(-1)!, "base64").toString("utf16le");
    expect(ps).toBe("$PID | Set-Content -LiteralPath 'C:\\p\\.kaizen\\sessions\\k.pid'; Set-Location 'C:\\p'; & 'claude' '/kaizen x'; if (-not (Test-Path -LiteralPath 'C:\\p\\.kaizen\\sessions\\k.pid')) { exit 0 }");
  } finally {
    Object.defineProperty(process, "platform", platform);
    keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
    rmSync(bin, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === "win32")("sessionLaunch: gemini, codex, agy and opencode resume the run's own conversation, found in each tool's own files", () => {
  // agy's files sit under the home bound at import, so this runs in a child with a scratch HOME.
  const home = mkdtempSync(join(tmpdir(), "kz-home-"));
  const script = `const S = await import(${JSON.stringify(join(dirname(import.meta.path), "state.ts"))});
const fs = require("node:fs"), { join, dirname } = require("node:path"), { Database } = require("bun:sqlite");
const H = process.env.HOME, P = join(H, "proj"), st = join(P, ".kaizen"), out = {};
const put = (f, t) => { fs.mkdirSync(dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
for (const r of ["r1", "r2", "r3"]) { put(join(st, "runs", r, "00-request.md"), "x"); put(join(st, "runs", r, "state.json"), "{}"); }
const go = (cmd, run = "r1", base = [cmd]) => S.sessionLaunch(P, cmd, base, "/kaizen x", "x", run).fullCmd;
const iso = (ms) => new Date(ms).toISOString();

// gemini: its id is picked at launch, resumed once its chat file exists.
const g1 = go("gemini"), gid = g1[2];
out.gemini = [g1[1], go("gemini")[1], go("gemini")[2] === gid];
put(join(H, ".gemini", "tmp", "proj", "chats", "session-2026-10-15T10-00-" + gid.slice(0, 8) + ".jsonl"), "{}");
out.gemini.push(go("gemini"));

// codex: its own id, read from the rollout the launch began in this folder.
const now = Date.now(), d = new Date(now);
const day = join(H, ".codex", "sessions", String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0"));
const roll = (id, t, cwd) => put(join(day, "rollout-x-" + id + ".jsonl"), JSON.stringify({ timestamp: iso(t), type: "session_meta", payload: { id, cwd, base_instructions: { text: "y".repeat(9000) } } }) + "\\n");
const A = "00000000-0000-7000-8000-00000000000a", B = "00000000-0000-7000-8000-00000000000b";
roll("00000000-0000-7000-8000-0000000000e0", now - 60_000, P);          // before any launch
go("codex", "r3");                                                      // its agent never began one
await Bun.sleep(10);
const c1 = go("codex");
await Bun.sleep(10);
roll("00000000-0000-7000-8000-0000000000e1", Date.now(), join(H, "else")); // another folder
roll(A, Date.now(), P);
await Bun.sleep(10);
go("codex", "r2");
await Bun.sleep(10);
roll(B, Date.now(), P);
await Bun.sleep(10);
// r3, asked first, never takes r1's or r2's: a conversation begun after the tool's next launch is not its.
const r3 = go("codex", "r3");
out.codex = [c1, go("codex", "r1", ["codex", "-m", "gpt-5"]), go("codex", "r2"), r3];

// agy: the conversation database created after the launch with this folder in its metadata.
go("agy");
const conv = join(H, ".gemini", "antigravity-cli", "conversations");
const agyDb = (id, folder) => {
  fs.mkdirSync(conv, { recursive: true });
  const d = new Database(join(conv, id + ".db"));
  d.run("create table trajectory_metadata_blob (id text, data blob)");
  d.run("insert into trajectory_metadata_blob values ('main', ?)", [Buffer.from("\\n'file://" + folder + "\\x12'file://" + folder + "\\x1a")]);
  d.close();
};
agyDb("agy-else", join(H, "else"));
agyDb("agy-sibling", P + "-bot");          // a folder whose name starts with this one
put(join(conv, "agy-broken.db"), "not a database");
out.agy = [go("agy")];
agyDb("agy-mine", P);
out.agy.push(go("agy"));

// opencode: a broken database is a fresh session; a real one names the conversation.
go("opencode");
put(join(H, ".local", "share", "opencode", "opencode.db"), "not a database");
out.opencode = [go("opencode")];
fs.rmSync(join(H, ".local", "share", "opencode", "opencode.db"));
const db = new Database(join(H, ".local", "share", "opencode", "opencode.db"));
db.run("create table session (id text primary key, directory text, time_created integer, parent_id text)");
const t = Date.now();
for (const [id, dir, at, parent] of [["ses_old", P, t - 60_000, null], ["ses_child", P, t, "ses_x"], ["ses_else", join(H, "else"), t, null], ["ses_mine", P, t + 1, null]]) db.run("insert into session values (?, ?, ?, ?)", [id, dir, at, parent]);
db.close();
out.opencode.push(go("opencode"));
console.log(JSON.stringify(out));`;
  try {
    const p = Bun.spawnSync(["bun", "-e", script], { cwd: home, env: { ...process.env, HOME: home, CODEX_HOME: "", XDG_DATA_HOME: "", GEMINI_CLI_HOME: "", CLAUDE_CONFIG_DIR: "" } });
    if (p.exitCode !== 0) throw new Error(p.stderr.toString());
    const out = JSON.parse(p.stdout.toString());
    const [startFlag, freshFlag, sameId, gResume] = out.gemini;
    expect([startFlag, freshFlag, sameId]).toEqual(["--session-id", "--session-id", false]);
    expect(gResume[1]).toBe("--resume");
    expect(out.codex).toEqual([
      ["codex", "/kaizen x"],
      ["codex", "resume", "00000000-0000-7000-8000-00000000000a", "-m", "gpt-5", "/kaizen x"],
      ["codex", "resume", "00000000-0000-7000-8000-00000000000b", "/kaizen x"],
      ["codex", "/kaizen x"],
    ]);
    expect(out.agy).toEqual([["agy", "-i", "/kaizen x"], ["agy", "--conversation", "agy-mine", "-i", "/kaizen x"]]);
    expect(out.opencode).toEqual([["opencode", "--prompt", "/kaizen x"], ["opencode", "--session", "ses_mine", "--prompt", "/kaizen x"]]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === "win32")("closeSessions still ends a codex launch whose id was read from its files afterwards", async () => {
  const p = sessionProject(), st = join(p, ".kaizen"), dir = join(st, "sessions");
  newRun(p, "2026-10-01-a", "/kaizen a");
  mkdirSync(dir, { recursive: true });
  // Launched as `codex <prompt>`: the id found later is not in its arguments.
  writeFileSync(join(dir, "c.json"), JSON.stringify({ run: "2026-10-01-a", text: "a", cmd: "codex", sessionId: "found-later", started: Date.now() - 5000 }));
  const pr = Bun.spawn(["sh", "-c", 'echo $$ > "$0"; exec "$@"', join(dir, "c.pid"), "sh", "-c", "sleep 30; :", "codex"], { stdout: "ignore", stderr: "ignore" });
  for (let i = 0; i < 100 && !existsSync(join(dir, "c.pid")); i++) await Bun.sleep(20);
  try {
    expect(closeSessions(st, "2026-10-01-a")).toBe(1);
    expect(await pr.exited).not.toBe(0);
  } finally {
    pr.kill();
  }
});

test.skipIf(process.platform === "win32")("closeSessions ends only the run's own live sessions launched before the decision", async () => {
  const p = sessionProject(), st = join(p, ".kaizen"), dir = join(st, "sessions");
  newRun(p, "2026-10-01-a", "/kaizen a");
  mkdirSync(dir, { recursive: true });
  // A stand-in agent through the real wrapper: `kzagent <id>` in its arguments, as
  // `claude --session-id <id>` would be. `; :` keeps sh from exec'ing sleep itself.
  const start = (key: string, rec: object) => {
    writeFileSync(join(dir, key + ".json"), JSON.stringify({ run: "2026-10-01-a", text: "a", cmd: "kzagent", sessionId: "sid-" + key, started: Date.now() - 5000, ...rec }));
    return Bun.spawn(["sh", "-c", 'echo $$ > "$0"; exec "$@"', join(dir, key + ".pid"), "sh", "-c", "sleep 30; :", "kzagent", "sid-" + key], { stdout: "ignore", stderr: "ignore" });
  };
  // Killed by a signal, a process keeps exitCode null; signalCode says it died.
  const alive = (pr: ReturnType<typeof Bun.spawn>) => pr.exitCode === null && pr.signalCode === null;
  const procs: Record<string, ReturnType<typeof Bun.spawn>> = {
    mine: start("mine", {}),
    later: start("later", { started: Date.now() - 1000 }),          // the decision's own successor: after `before` below
    stranger: start("stranger", { cmd: "notkzagent" }),             // a PID that is not this agent
    other: start("other", { run: "2026-10-01-b" }),                 // another run's
  };
  for (let i = 0; i < 100 && Object.keys(procs).some((k) => !existsSync(join(dir, k + ".pid"))); i++) await Bun.sleep(20);
  writeFileSync(join(dir, "dead.json"), JSON.stringify({ run: "2026-10-01-a", text: "a", cmd: "kzagent", sessionId: null, started: 0 }));
  writeFileSync(join(dir, "dead.pid"), "999999\n");
  try {
    expect(closeSessions(st, "2026-10-01-a", { before: Date.now() - 3000 })).toBe(1);
    expect(await procs.mine.exited).not.toBe(0);
    for (const k of ["later", "stranger", "other"] as const) expect(alive(procs[k])).toBe(true);
    expect(existsSync(join(dir, "mine.pid"))).toBe(false);
    expect(existsSync(join(dir, "mine.json"))).toBe(true);       // its conversation id is still needed
    expect(existsSync(join(dir, "dead.pid"))).toBe(false);
    expect(existsSync(join(dir, "later.pid"))).toBe(true);
    expect(existsSync(join(dir, "stranger.pid"))).toBe(false);   // its number is held by something else: dropped, not killed

    // Off: nothing is ended.
    writeFileSync(join(st, "config.yml"), "agent:\n  default: claude\n  close: off\n");
    expect(closeSessions(st, "2026-10-01-b")).toBe(0);
    expect(alive(procs.other)).toBe(true);
    writeFileSync(join(st, "config.yml"), "agent:\n  default: claude\n  close: on\n");

    // The sweep: a done run keeps its window; only a PID file whose process is gone is dropped.
    newRun(p, "2026-10-01-b", "/kaizen b", { stage: "done", awaiting: null });
    sweepSessions(st);
    await Bun.sleep(100);
    expect(alive(procs.other)).toBe(true);
    writeFileSync(join(dir, "dead2.json"), JSON.stringify({ run: "2026-10-01-a", text: "a", cmd: "kzagent", sessionId: null, started: 0 }));
    writeFileSync(join(dir, "dead2.pid"), "999999\n");
    sweepSessions(st);
    expect(existsSync(join(dir, "dead2.pid"))).toBe(false);
    expect(existsSync(join(dir, "dead2.json"))).toBe(true);
    expect(existsSync(join(dir, "later.pid"))).toBe(true);
  } finally {
    for (const pr of Object.values(procs)) pr.kill();
  }
});

test("abandonRun closes the run's recorded sessions", () => {
  const p = sessionProject(), st = join(p, ".kaizen");
  newRun(p, "2026-10-01-z", "/kaizen z");
  mkdirSync(join(st, "sessions"));
  writeFileSync(join(st, "sessions", "k.json"), JSON.stringify({ run: "2026-10-01-z", text: "z", cmd: "kzagent", sessionId: null, started: 0 }));
  writeFileSync(join(st, "sessions", "k.pid"), "999999\n");
  expect(abandonRun(st, "2026-10-01-z", "no")).toBe(null);
  expect(existsSync(join(st, "sessions", "k.pid"))).toBe(false);
});

// The folder dialog cannot be opened in a test, but its script can be checked without
// showing it: compiled on a Mac, parsed on Windows. Elsewhere only the shape is pinned.
test("folder dialog: each platform's script is well formed", async () => {
  const { folderDialog } = await import("./web.ts");
  const mac = folderDialog("darwin")!, win = folderDialog("win32")!;
  expect(mac.slice(0, 3)).toEqual(["osascript", "-e", "activate"]);
  expect(win.at(-1)).toContain("FolderBrowserDialog");
  if (process.platform === "darwin") {
    const out = join(mkdtempSync(join(tmpdir(), "kaizen-osa-")), "x.scpt");
    expect(Bun.spawnSync(["osacompile", ...mac.slice(1), "-o", out]).exitCode).toBe(0);
  }
  if (process.platform === "win32") {
    const check = `$e=$null;[void][System.Management.Automation.Language.Parser]::ParseInput($env:KZ_PS,[ref]$null,[ref]$e);exit $e.Count`;
    expect(Bun.spawnSync([win[0], "-NoProfile", "-Command", check], { env: { ...process.env, KZ_PS: win.at(-1)! } }).exitCode).toBe(0);
  }
});

test("issueUrl prefills the bug form's fields, without the home path", () => {
  const u = new URL(issueUrl({ title: "boom", what: `ENOENT ${realHome}/Projects/x/.kaizen/state.json` }));
  expect(`${u.origin}${u.pathname}`).toBe(`${REPO_URL}/issues/new`);
  expect(u.searchParams.get("what")).toBe("ENOENT ~/Projects/x/.kaizen/state.json");
  expect(u.searchParams.get("env")).toBe(systemInfo());
  // Every key but GitHub's own must be a field id in the form, or it is dropped silently.
  const ids = [...readFileSync(join(import.meta.dir, "..", ".github", "ISSUE_TEMPLATE", "bug.yml"), "utf8").matchAll(/^\s+id: (\S+)/gm)].map((m) => m[1]);
  for (const k of u.searchParams.keys()) if (!["template", "title", "body"].includes(k)) expect(ids).toContain(k);
  // Without the form on GitHub only `body` is read, so it must hold the machine too.
  expect(u.searchParams.get("body")).toContain(systemInfo());
  expect(u.searchParams.get("body")).toContain("ENOENT ~/Projects/x/.kaizen/state.json");
  expect(systemInfo()).toMatch(/^kaizen: .+\nOS: .+\nCPU: .+\nRAM: \d+ GB\nbun: /);
});

test("issueUrl stays under GitHub's URL limit for a huge error", () => {
  const u = issueUrl({ title: "x".repeat(500), what: "é".repeat(20000) });
  expect(u.length).toBeLessThan(8000);
  expect(new URL(u).searchParams.get("what")).toContain("…(cut)");
});

test("scrubHome hides a Windows home however the error spells it", () => {
  const h = ["C:\\Users\\Firman"];
  expect(scrubHome(`open C:\\Users\\Firman\\x, "c:\\\\users\\\\firman\\\\y", C:/Users/Firman/z`, h, true))
    .toBe(`open ~\\x, "~\\\\y", ~/z`);
  // Case matters off Windows: /home/Ann is not /home/ann.
  expect(scrubHome("/home/ann/a /home/Ann/b", ["/home/ann"], false)).toBe("~/a /home/Ann/b");
});

test("trustFolder: marks the repo root trusted in a temp config, keeps the rest, survives a bad file", () => {
  const t = mkdtempSync(join(tmpdir(), "kz-trust-"));
  const repo = join(t, "repo"), sub = join(repo, "sub"), plain = join(t, "plain");
  mkdirSync(sub, { recursive: true }); mkdirSync(plain);
  Bun.spawnSync(["git", "init", "-q", repo]);
  const cfg = join(t, ".claude.json");
  const key = (p: string) => process.platform === "win32" ? p.replace(/\\/g, "/") : p;   // Claude Code's spelling
  writeFileSync(cfg, JSON.stringify({ keep: 1, projects: { [key(plain)]: { x: 2 } } }));
  trustFolder(sub, cfg);
  trustFolder(plain, cfg);
  const d = JSON.parse(readFileSync(cfg, "utf8"));
  expect(d.keep).toBe(1);
  expect(d.projects[key(realpathSync.native(repo))]).toEqual({ hasTrustDialogAccepted: true });
  expect(d.projects[key(plain)]).toEqual({ x: 2, hasTrustDialogAccepted: true });
  writeFileSync(cfg, "{bad");
  trustFolder(plain, cfg);
  expect(readFileSync(cfg, "utf8")).toBe("{bad");
  rmSync(t, { recursive: true, force: true });
});

test("moveIdea carries notes and linked attachments, leaves the old inbox without it", () => {
  const root = mkdtempSync(join(tmpdir(), "kaizen-mv-"));
  const a = join(root, "a", ".kaizen"), b = join(root, "b", ".kaizen");
  mkdirSync(join(a, "attachments"), { recursive: true });
  writeFileSync(join(a, "attachments", "x-shot.png"), "png");
  writeInbox(a, [{ status: "open", text: "keep" }, { status: "open", text: "go", notes: "see [shot](attachments/x-shot.png)" }]);
  expect(moveIdea(a, a, "go")).toBe("already in that project");
  expect(moveIdea(a, b, "nope")).toBe("no such idea");
  expect(moveIdea(a, b, "go")).toBeNull();
  expect(readInbox(a).map((l) => l.text)).toEqual(["keep"]);
  expect(readInbox(b)).toMatchObject([{ status: "open", text: "go", notes: "see [shot](attachments/x-shot.png)" }]);
  expect(readFileSync(join(b, "attachments", "x-shot.png"), "utf8")).toBe("png");
  writeInbox(a, [{ status: "open", text: "go" }]);
  expect(moveIdea(a, b, "go")).toBe("that project already has this idea");
  rmSync(root, { recursive: true, force: true });
});

test("newer: an update is offered only for a strictly later release", async () => {
  const { newer } = await import("./web.ts");
  expect(newer("1.31.0", "1.30.0")).toBe(true);
  expect(newer("1.30.0", "1.4.0")).toBe(true);
  expect(newer("1.30.0", "1.30.0")).toBe(false);
  expect(newer("1.4.0", "1.30.0")).toBe(false);
  expect(newer("2.0", "1.99.9")).toBe(true);
});

// The real server in a scratch home. Only refusals: a same-origin POST would run a real upgrade.
test("the board refuses an upgrade from another origin", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "kaizen-upd-"));
  for (const d of [join(homeDir, ".kaizen"), join(homeDir, ".claude")]) mkdirSync(d, { recursive: true });
  const port = 20000 + Math.floor(Math.random() * 20000), repo = join(import.meta.dir, "..");
  const proc = Bun.spawn([process.execPath, join(repo, "cli", "install.ts"), "web", "--port", String(port), "--no-open", "--foreground"], {
    cwd: homeDir, env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir, KAIZEN_HOME: repo, KAIZEN_WEB_HOSTS: "" }, stdout: "ignore", stderr: "ignore",
  });
  try {
    const at = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { await fetch(at + "/state"); break; } catch { if (i > 100) throw new Error("board did not start"); await Bun.sleep(50); } }
    expect((await (await fetch(at + "/settings")).json()).phoneUrls).toEqual([]);
    const r = await fetch(at + "/upgrade", { method: "POST", headers: { origin: "https://evil.example" } });
    expect(r.status).toBe(403);
  } finally { proc.kill(); await proc.exited; rmSync(homeDir, { recursive: true, force: true }); }
});

// KAIZEN_WEB_HOSTS (tailscale serve): the listed host gets in, any other is still refused.
test("the board answers only the hosts listed in KAIZEN_WEB_HOSTS or web-hosts", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "kaizen-hosts-"));
  for (const d of [join(homeDir, ".kaizen"), join(homeDir, ".claude")]) mkdirSync(d, { recursive: true });
  const port = 20000 + Math.floor(Math.random() * 20000), repo = join(import.meta.dir, "..");
  const proc = Bun.spawn([process.execPath, join(repo, "cli", "install.ts"), "web", "--port", String(port), "--no-open", "--foreground"], {
    cwd: homeDir, env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir, KAIZEN_HOME: repo, KAIZEN_WEB_HOSTS: " PC.tail1234.ts.net:443 , bad@pc.tail1234.ts.net " }, stdout: "ignore", stderr: "ignore",
  });
  try {
    const at = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { await fetch(at + "/state"); break; } catch { if (i > 100) throw new Error("board did not start"); await Bun.sleep(50); } }
    expect((await (await fetch(at + "/settings")).json()).phoneUrls).toEqual(["https://pc.tail1234.ts.net"]);
    expect((await fetch(at + "/state", { headers: { host: "pc.tail1234.ts.net" } })).status).toBe(200);
    expect((await fetch(at + "/state", { headers: { host: "evil.example" } })).status).toBe(403);
    expect((await fetch(at + "/state", { headers: { host: "other.tail1234.ts.net" } })).status).toBe(403);
    // ~/.kaizen/web-hosts (written by `kaizen setup`) is read per request: no restart.
    writeFileSync(join(homeDir, ".kaizen", "web-hosts"), "# phone\nOther.tail1234.ts.net\n");
    expect((await (await fetch(at + "/settings")).json()).phoneUrls).toEqual(["https://pc.tail1234.ts.net", "https://other.tail1234.ts.net"]);
    expect((await fetch(at + "/state", { headers: { host: "other.tail1234.ts.net" } })).status).toBe(200);
    expect((await fetch(at + "/state", { headers: { host: "evil.example" } })).status).toBe(403);
    expect((await fetch(at + "/upgrade", { method: "POST", headers: { origin: "https://evil.example" } })).status).toBe(403);
    const m = await fetch(at + "/manifest.webmanifest");
    expect(m.status).toBe(200);
    expect((await m.json()).display).toBe("standalone");
  } finally { proc.kill(); await proc.exited; rmSync(homeDir, { recursive: true, force: true }); }
});

test("requestTitle: drops the launch command, keeps the first sentence, caps at 90", () => {
  expect(requestTitle("/kaizen lite simplify the card. Then more words")).toBe("simplify the card.");
  expect(requestTitle("x".repeat(200)).length).toBe(90);
});

test("requestTitle: a follow-up opened from an approval question titles from its work, not the question", () => {
  const q = '# Request (verbatim)\n\nQuestion asked at the final approval of a: "Next run?"\nAnswer: "Plan 2b next"\n\nFollow-up of: a\n';
  expect(requestTitle(q)).toBe("Plan 2b next");
  expect(requestTitle(q + "Roadmap line: 2. Accounts & access — OTP\n")).toBe("Accounts & access — OTP");
});

test("parent/child: a Parent line links a run and an idea to the run that filed them", () => {
  expect(parentOf("do x\nFollow-up of: 2026-01-01-a.")).toBe("2026-01-01-a");
  expect(parentOf("  [2026-10-18 20:57] Parent: 2026-01-01-a")).toBe("2026-01-01-a");
  expect(parentOf("no parent here")).toBeUndefined();
  const st = join(mkdtempSync(join(tmpdir(), "kaizen-pc-")), ".kaizen");
  for (const [id, req] of [["2026-01-01-a", "parent work"], ["2026-01-02-b", "child work\nParent: 2026-01-01-a"]]) {
    mkdirSync(join(st, "runs", id), { recursive: true });
    writeFileSync(join(st, "runs", id, "00-request.md"), req + "\n");
    writeFileSync(join(st, "runs", id, "state.json"), JSON.stringify({ stage: "done", awaiting: null }));
  }
  writeFileSync(join(st, "inbox.md"), "# Inbox\n\n- open: follow-on idea\n  Parent: 2026-01-01-a\n");
  const cards = boardCards([st], Date.now());
  expect(cards.find((k) => k.id === "2026-01-01-a")!.children).toEqual(["2026-01-02-b"]);
  expect(cards.find((k) => k.id === "2026-01-02-b")!.parent).toBe("2026-01-01-a");
  expect(cards.find((k) => k.kind === "idea")!.parent).toBe("2026-01-01-a");
  // The done child is noted in its parent once, however often the board refreshes.
  boardCards([st], Date.now());
  expect(readFileSync(join(st, "runs", "2026-01-01-a", "notes.md"), "utf8").match(/Child 2026-01-02-b done: child work/g)!.length).toBe(1);
  // card add: no run in flight, so a parent must be named.
  expect(addCard(st, "next thing")).toMatch(/no run in flight/);
  writeFileSync(join(st, "runs", "2026-01-02-b", "state.json"), JSON.stringify({ stage: "build", awaiting: null }));
  expect(addCard(st, "next thing")).toEqual({ parent: "2026-01-02-b" });
  expect(addCard(st, "next thing")).toMatch(/already/);
  expect(addCard(st, "other", "nope")).toMatch(/no such run/);
  addCard(st, "titled", "2026-01-02-b", "the details\nline two");
  expect(readInbox(st).find((l) => l.text === "titled")?.notes).toContain("Parent: 2026-01-02-b\nthe details");
  expect(boardCards([st], Date.now()).find((k) => k.text === "next thing")!.parent).toBe("2026-01-02-b");
  rmSync(dirname(st), { recursive: true, force: true });
});

test("winShim swaps an npm .cmd shim for the .ps1 beside it, so a multi-line prompt survives", () => {
  const { winShim } = stateModule;
  const has = (p: string) => p === "C:\\npm\\claude.ps1";
  expect(winShim("C:\\npm\\claude.cmd", has)).toBe("C:\\npm\\claude.ps1");
  expect(winShim("C:\\npm\\codex.CMD", () => false)).toBe("C:\\npm\\codex.CMD");
  expect(winShim("C:\\bin\\claude.exe", () => true)).toBe("C:\\bin\\claude.exe");
});

test("final-approval gate: changed files need an accepted: line once approvals.review is on", async () => {
  const { gateOf, acceptance, recordAcceptance, changedPaths } = stateModule;
  const proj = mkdtempSync(join(tmpdir(), "kz-gate-")), st = join(proj, ".kaizen");
  mkdirSync(join(proj, "cli"), { recursive: true });
  writeFileSync(join(proj, "cli", "a.ts"), "");
  const mk = (id: string, s: object, impl?: string, approval?: string) => {
    const d = join(st, "runs", id);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "state.json"), JSON.stringify(s));
    if (impl) writeFileSync(join(d, "03-impl.md"), impl);
    if (approval) writeFileSync(join(d, "02-approval.md"), approval);
  };
  const impl = "## Changed\n- `cli/a.ts:12` — the fix\n- ran `bun test`, see `missing/file.ts`\n";
  expect(changedPaths(impl, proj)).toEqual(["cli/a.ts"]);   // only paths that exist; commands ignored
  mkdirSync(st, { recursive: true });
  writeFileSync(join(st, "config.yml"), "approvals:\n  plan: true\n  review: true\n");
  mk("2026-10-28-old", { stage: "done" }, impl);                       // before the gate: never flagged
  mk("2026-10-29-none", { stage: "done" }, "## Changed\nnothing\n");   // no files: free to finish
  mk("2026-10-29-needs", { stage: "done" }, impl, "plan approved\naccepted: soon, the user said\n");
  mk("2026-10-29-auto", { stage: "done" }, impl, "accepted: 2026-10-29T10:00:00Z auto (auto_accept)\n");
  mk("2026-10-29-build", { stage: "build" }, impl);
  expect(gateOf(st, "2026-10-28-old")).toBeNull();
  expect(gateOf(st, "2026-10-29-none")).toBeNull();
  expect(gateOf(st, "2026-10-29-build")).toBeNull();
  expect(gateOf(st, "2026-10-29-needs")).toBe("needs");                // a prose line does not count
  expect(gateOf(st, "2026-10-29-auto")).toBe("auto");
  expect(boardCards([st], Date.now()).find((c) => c.id === "2026-10-29-needs")).toMatchObject({ status: "waiting", awaiting: "approvals.review" });
  expect(notice({ kind: "run", text: "x", where: "p", status: "done", accept: "needs" } as Card)).toContain("done, not approved");
  expect(recordAcceptance(st, "2026-10-29-needs", "board")).toBeNull();
  expect(acceptance(st, "2026-10-29-needs")).toBe("user");
  expect(recordAcceptance(st, "2026-10-29-needs", "chat")).toBe("That run is already approved.");
  expect(gateOf(st, "2026-10-29-needs")).toBe("user");
  // Hand-edited shapes still read as on: a column-0 comment, CRLF, quotes, a trailing comment.
  mk("2026-10-29-shapes", { stage: "done" }, impl);
  writeFileSync(join(st, "config.yml"), 'approvals: # stops\r\n# the final one\r\n  plan: true\r\n\r\n  review: "true" # yes\r\n');
  expect(gateOf(st, "2026-10-29-shapes")).toBe("needs");
  writeFileSync(join(st, "config.yml"), "approvals: {plan: true, review: false}\n");
  expect(gateOf(st, "2026-10-29-shapes")).toBeNull();
  // A file only mentioned outside the change list does not count; a name with spaces does.
  mkdirSync(join(proj, "notes"), { recursive: true });
  writeFileSync(join(proj, "notes", "Release and testing.md"), "");
  expect(changedPaths("## Changed\n- `notes/Release and testing.md`\n\n## Verification\nread `cli/a.ts`\n", proj)).toEqual(["notes/Release and testing.md"]);
  // The user's pick: with approvals.review off, nothing is gated.
  mk("2026-10-29-off", { stage: "done" }, impl);
  writeFileSync(join(st, "config.yml"), "approvals:\n  review: false\n");
  expect(gateOf(st, "2026-10-29-off")).toBeNull();
  writeFileSync(join(st, "config.yml"), "approvals:\n  review: true\n");
  expect(await commitPush(st, "2026-10-29-off", "fix: x", [])).toMatchObject({ ok: false });
});

test("gate: a run marked done without acceptance reads, heals and finishes as review", () => {
  const { readRuns, healRuns, finishRun, gateOf } = stateModule;
  const proj = mkdtempSync(join(tmpdir(), "kz-heal-")), st = join(proj, ".kaizen");
  mkdirSync(join(proj, "cli"), { recursive: true });
  writeFileSync(join(proj, "cli", "a.ts"), "");
  const impl = "## Changed\n- `cli/a.ts`\n";
  const mk = (id: string, approval?: string, i = impl) => {
    const d = join(st, "runs", id);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "state.json"), JSON.stringify({ stage: "done" }));
    writeFileSync(join(d, "03-impl.md"), i);
    if (approval) writeFileSync(join(d, "02-approval.md"), approval);
  };
  const stageOf = (id: string) => JSON.parse(readFileSync(join(st, "runs", id, "state.json"), "utf8"));
  mkdirSync(st, { recursive: true });
  writeFileSync(join(st, "config.yml"), "approvals:\n  review: true\n");
  mk("2026-10-29-needs"); mk("2026-10-29-ok", "accepted: 2026-10-29T10:00:00Z by user via board\n");
  mk("2026-10-29-none", undefined, "nothing\n"); mk("2026-10-28-old");
  const row = (id: string) => readRuns(st).find((r) => r.id === id)!;
  expect(row("2026-10-29-needs")).toMatchObject({ stage: "review", awaiting: "approvals.review" });
  for (const id of ["2026-10-29-ok", "2026-10-29-none", "2026-10-28-old"]) expect(row(id).stage).toBe("done");
  expect(stageOf("2026-10-29-needs").stage).toBe("done");   // reads stay pure
  expect(healRuns(st)).toEqual(["2026-10-29-needs"]);
  expect(stageOf("2026-10-29-needs")).toMatchObject({ stage: "review", awaiting: "approvals.review" });
  expect(healRuns(st)).toEqual([]);                          // idempotent
  expect(stageOf("2026-10-29-needs").healed).toBe(true);
  expect(row("2026-10-29-needs").healed).toBe(true);
  expect(gateOf(st, "2026-10-29-needs")).toBe("needs");
  expect(finishRun(st, "2026-10-29-needs")).toContain("--user-approved");
  expect(stageOf("2026-10-29-needs").stage).toBe("review");
  expect(finishRun(st, "2026-10-29-needs", true)).toBeNull();
  expect(readFileSync(join(st, "runs", "2026-10-29-needs", "02-approval.md"), "utf8")).toContain("by user via chat");
  expect(stageOf("2026-10-29-needs")).toMatchObject({ stage: "done", awaiting: null });
  expect(stageOf("2026-10-29-needs").healed).toBeUndefined();
  expect(row("2026-10-29-needs").stage).toBe("done");
  expect(finishRun(st, "2026-10-29-none")).toBeNull();       // nothing changed: free to finish
  // Gate off: a done run stays done.
  writeFileSync(join(st, "config.yml"), "approvals:\n  review: false\n");
  mk("2026-10-29-off");
  expect(row("2026-10-29-off").stage).toBe("done");
  rmSync(proj, { recursive: true, force: true });
});

test("stageFiles, commitStaged, suggestMessage: only the run's files are staged, discarded or committed, and nothing is pushed", async () => {
  const root = mkdtempSync(join(tmpdir(), "kz-stage-"));
  const sh = (cwd: string, ...a: string[]) => Bun.spawnSync(["git", "-C", cwd, ...a]).stdout.toString().trim();
  const bare = join(root, "remote.git"), proj = join(root, "proj"), st = join(proj, ".kaizen");
  mkdirSync(join(st, "runs", "r1"), { recursive: true });
  Bun.spawnSync(["git", "init", "-q", "--bare", bare]);
  Bun.spawnSync(["git", "init", "-q", proj]);
  for (const kv of [["user.name", "t"], ["user.email", "t@t"], ["commit.gpgsign", "false"], ["core.hooksPath", "/dev/null"]]) sh(proj, "config", ...kv);
  sh(proj, "remote", "add", "origin", bare);
  writeFileSync(join(proj, ".gitignore"), ".kaizen/\n");
  writeFileSync(join(proj, "a.txt"), "one\ntwo\n");
  writeFileSync(join(proj, "other.txt"), "o\n");
  sh(proj, "add", ".");
  Bun.spawnSync(["git", "-C", proj, "commit", "-qm", "init"], { env: { ...process.env, GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z", GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z" } });
  writeFileSync(join(proj, "a.txt"), "one\nTWO\nthree\n");
  writeFileSync(join(proj, "new.txt"), "n\n");
  writeFileSync(join(proj, "other.txt"), "changed\n");
  writeFileSync(join(st, "runs", "r1", "03-impl.md"), "- `a.txt`\n- `new.txt`\n");
  // Reported a minute ago: after the init commit, before the run's own commit below
  // (a commit in the report's own second keeps the file offered).
  utimesSync(join(st, "runs", "r1", "03-impl.md"), new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  const g = () => runGit(st, "r1") as any;
  expect(g().rows).toEqual([
    { path: "a.txt", staged: false, code: "M", add: 2, del: 1 },
    { path: "new.txt", staged: false, code: "U", add: 1, del: 0 },
  ]);
  expect(g().log).toEqual([{ sha: expect.any(String), subject: "init", refs: expect.stringContaining("HEAD"), unpushed: true }]);
  // Another run's file is refused whole, and nothing is staged.
  expect(stageFiles(st, "r1", "stage", ["a.txt", "other.txt"])).toBe("Not this run's: other.txt");
  expect(g().staged).toEqual([]);
  expect(stageFiles(st, "r1", "stage", ["a.txt"])).toBeNull();
  expect(g().staged).toEqual(["a.txt"]);
  expect(g().rows[0]).toEqual({ path: "a.txt", staged: true, code: "M", add: 2, del: 1 });
  expect(stageFiles(st, "r1", "unstage", ["a.txt"])).toBeNull();
  expect(g().staged).toEqual([]);
  // Discard: an untracked file is deleted, a tracked one goes back to the index.
  expect(stageFiles(st, "r1", "discard", ["new.txt"])).toBeNull();
  expect(existsSync(join(proj, "new.txt"))).toBe(false);
  expect(stageFiles(st, "r1", "discard", ["a.txt"])).toBeNull();
  expect(readFileSync(join(proj, "a.txt"), "utf8")).toBe("one\ntwo\n");
  expect(readFileSync(join(proj, "other.txt"), "utf8")).toBe("changed\n");   // not the run's, untouched
  writeFileSync(join(proj, "a.txt"), "one\nTWO\nthree\n");
  // Plain Commit: nothing staged, a stale list, another file staged by hand, all refused.
  expect(commitStaged(st, "r1", "fix: x", [])).toEqual({ ok: false, why: "Nothing is staged." });
  stageFiles(st, "r1", "stage", ["a.txt"]);
  expect(commitStaged(st, "r1", "fix: x", [])).toMatchObject({ ok: false });
  sh(proj, "add", "other.txt");
  expect((commitStaged(st, "r1", "fix: x", ["a.txt"]) as any).why).toContain("Other files are staged too: other.txt");
  sh(proj, "reset", "-q", "--", "other.txt");
  expect((commitStaged(st, "r1", "no type", ["a.txt"]) as any).why).toContain("Start the message with a type");
  // The sparkle: with no claude on PATH the message is built from the file names, and it passes the type check.
  const path = process.env.PATH;
  process.env.PATH = "";
  try {
    const m = await suggestMessage(st, "r1");
    expect(m).toEqual({ ok: true, message: "chore: update a.txt", ai: false });
  } finally { process.env.PATH = path; }
  const r = commitStaged(st, "r1", "fix: a", ["a.txt"]) as { ok: true; sha: string };
  expect(r.ok).toBe(true);
  expect(sh(proj, "show", "--name-only", "--format=%s", "HEAD")).toBe("fix: a\n\na.txt");
  expect(sh(bare, "rev-list", "--all", "--count")).toBe("0");   // not pushed
  expect(readCommit(st, "r1")).toEqual({ sha: r.sha, pushed: false });
  // Edits made after the run's commit are not the run's: discarding them is refused.
  writeFileSync(join(proj, "a.txt"), "junk\n");
  expect(stageFiles(st, "r1", "discard", ["a.txt"])).toBe("Not this run's: a.txt");
  expect(readFileSync(join(proj, "a.txt"), "utf8")).toBe("junk\n");
  rmSync(root, { recursive: true, force: true });
});

test("runGit: a run owns the files its report lists as changed, not ones it only mentions", () => {
  const proj = mkdtempSync(join(tmpdir(), "kaizen-own-")), st = join(proj, ".kaizen"), g = (...a: string[]) => Bun.spawnSync(["git", "-C", proj, ...a]);
  g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t"); g("remote", "add", "origin", "https://example.invalid/r.git");
  for (const f of ["listed.txt", "mentioned.txt", "fixed.txt", "whole.txt", "script.txt", "kept.txt"]) writeFileSync(join(proj, f), "1\n");
  g("add", "."); g("commit", "-qm", "base", "--date=2000-01-01T00:00:00");
  Bun.spawnSync(["git", "-C", proj, "commit", "-q", "--amend", "--no-edit"], { env: { ...process.env, GIT_COMMITTER_DATE: "2000-01-01T00:00:00" } });
  for (const f of ["listed.txt", "mentioned.txt", "fixed.txt", "whole.txt", "script.txt", "kept.txt"]) writeFileSync(join(proj, f), "2\n");
  const a = join(st, "runs", "a"), b = join(st, "runs", "b");
  mkdirSync(join(a, "05-iterations"), { recursive: true }); mkdirSync(b, { recursive: true });
  writeFileSync(join(a, "state.json"), "{}"); writeFileSync(join(b, "state.json"), "{}");
  writeFileSync(join(a, "03-impl.md"), "## Changed\n- `listed.txt`\n\n## Scripts\n- `script.txt`\n\n## Left unchanged\n`kept.txt`\n\n## Deviations\n`mentioned.txt` is another session's.\n");
  writeFileSync(join(a, "05-iterations", "01-fix.md"), "# Fix\n- `fixed.txt`\n");
  writeFileSync(join(b, "03-impl.md"), "No headings here: `whole.txt`\n");
  const files = (id: string) => (runGit(st, id) as any).files.map((l: string) => l.slice(3));
  expect(files("a")).toEqual(["fixed.txt", "listed.txt", "script.txt"]);
  expect(files("b")).toEqual(["whole.txt"]);
  rmSync(proj, { recursive: true, force: true });
});

test("a committed run does not claim a file edited after its commit", () => {
  const root = mkdtempSync(join(tmpdir(), "kz-seal-")), st = join(root, ".kaizen"), run = join(st, "runs", "r1");
  mkdirSync(run, { recursive: true });
  const ago = (s: number) => Math.floor(Date.now() / 1000) - s;
  const sh = (at: number, ...a: string[]) => Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: root, env: { ...process.env, GIT_AUTHOR_DATE: `${at} +0000`, GIT_COMMITTER_DATE: `${at} +0000` } }).stdout.toString().trim();
  sh(ago(300), "init", "-q"); sh(ago(300), "remote", "add", "origin", "https://example.com/x.git");
  writeFileSync(join(root, "a.txt"), "1"); sh(ago(300), "add", "a.txt"); sh(ago(300), "commit", "-qm", "init");
  writeFileSync(join(run, "03-impl.md"), "## Changed\n- `a.txt`: edit\n");
  utimesSync(join(run, "03-impl.md"), ago(200), ago(200));
  writeFileSync(join(root, "b.txt"), "1"); sh(ago(100), "add", "b.txt"); sh(ago(100), "commit", "-qm", "the run");
  writeFileSync(join(root, "a.txt"), "2");
  const before: Record<string, string> = {}, after: Record<string, string> = {};
  cardsGit(st, ["r1"], before as any);
  expect(before.r1).toBe("commit");   // no commit recorded: still the run's
  writeFileSync(join(run, "07-commit.md"), `commit: ${sh(ago(0), "rev-parse", "--short", "HEAD")}\npushed: no\n`);
  cardsGit(st, ["r1"], after as any);
  expect(after.r1).not.toBe("commit");
  rmSync(root, { recursive: true, force: true });
});
