// State module against a throwaway .kaizen/. Nothing here spawns a terminal: the
// launch path is covered only up to the command it would run.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync, existsSync, readdirSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { issueUrl, systemInfo, scrubHome, REPO_URL, home as realHome, trustFolder } from "./state.ts";
import {
  readRuns, readInbox, writeInbox, replaceIdea, abandonRun, allBacklog, backlog,
  statusOf, columnOf, parseItem, startedRuns, boardCards, readArchive, setArchived,
  requestOf, agentFlags, plainModel, readNotes, writeNotes, manualCommand, parseNotes, formatNote, appendNote, saveAttachment,
  reviewFindings, pickFindings, fixPrompt, approvalPrompt, sessionLaunch, closeSessions, sweepSessions, readSessions, ownerOf, CLOSE_GRACE_MS, gitStatus, runGit, cardsGit, commitPush, readCommit, findTerminal, nativePath, pruneRuns, unrechecked, notice, notifier, notifyArgs, LOGO, type Card,
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

test("approvalPrompt: approve or revise, the comment kept on one line", () => {
  expect(approvalPrompt("r", "approvals.plan")).toBe("run r: the plan is approved from the board. Record it in 02-approval.md and build it, first asking any of its open questions still unanswered.");
  expect(approvalPrompt("r", "approvals.review", "  ")).toContain("approved from the board at the final approval");
  const p = approvalPrompt("r", "approvals.plan", " drop step 3,\n\tkeep \"the rest\" ");
  expect(p).toContain('to revise: "drop step 3, keep "the rest"".');
  expect(p).toContain("revise 01-plan.md");
  expect(p).not.toContain("\n");
  expect(approvalPrompt("r", "approvals.review", "rename it")).toContain('final approval: "rename it". Record it in 02-approval.md, change the work');
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
  expect(cardsGit(st, ["r1", "nope"])).toEqual({ r1: "pending" });
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
  expect(cardsGit(st, ["r1"])).toEqual({ r1: "pending" });   // committed, not pushed
  expect(cardsGit(join(root, ".kaizen"), ["r1"])).toEqual({});   // not a repo
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
  } finally { Object.defineProperty(process, "platform", platform); }
  expect(nativePath("/c/Users/me")).toBe("/c/Users/me");   // elsewhere a path is left alone
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
    // A running herdr: a tab, and the run typed into it as one encoded line.
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
    expect(idea.fullCmd).toEqual(["/bin/claude", "--model", "opus", "--session-id", rec.sessionId!, "/kaizen tidy logs"]);
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

    // Another tool's record never resumes; codex takes no id at all.
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
    expect(ps).toBe("$PID | Set-Content -LiteralPath 'C:\\p\\.kaizen\\sessions\\k.pid'; Set-Location 'C:\\p'; & 'claude' '/kaizen x'");
  } finally {
    Object.defineProperty(process, "platform", platform);
    keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
    rmSync(bin, { recursive: true, force: true });
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
    later: start("later", { started: Date.now() + 60_000 }),        // the decision's own successor
    stranger: start("stranger", { cmd: "notkzagent" }),             // a PID that is not this agent
    other: start("other", { run: "2026-10-01-b" }),                 // another run's
  };
  for (let i = 0; i < 100 && Object.keys(procs).some((k) => !existsSync(join(dir, k + ".pid"))); i++) await Bun.sleep(20);
  writeFileSync(join(dir, "dead.json"), JSON.stringify({ run: "2026-10-01-a", text: "a", cmd: "kzagent", sessionId: null, started: 0 }));
  writeFileSync(join(dir, "dead.pid"), "999999\n");
  try {
    expect(closeSessions(st, "2026-10-01-a", { before: Date.now() })).toBe(1);
    expect(await procs.mine.exited).not.toBe(0);
    for (const k of ["later", "stranger", "other"] as const) expect(alive(procs[k])).toBe(true);
    expect(existsSync(join(dir, "mine.pid"))).toBe(false);
    expect(existsSync(join(dir, "mine.json"))).toBe(true);       // its conversation id is still needed
    expect(existsSync(join(dir, "dead.pid"))).toBe(false);
    expect(existsSync(join(dir, "later.pid"))).toBe(true);

    // Off: nothing is ended.
    writeFileSync(join(st, "config.yml"), "agent:\n  default: claude\n  close: off\n");
    expect(closeSessions(st, "2026-10-01-b")).toBe(0);
    expect(alive(procs.other)).toBe(true);
    writeFileSync(join(st, "config.yml"), "agent:\n  default: claude\n  close: on\n");

    // The sweep: run b done within the grace keeps its window, past it loses it.
    newRun(p, "2026-10-01-b", "/kaizen b", { stage: "done", awaiting: null });
    sweepSessions(st, Date.now());
    await Bun.sleep(100);
    expect(alive(procs.other)).toBe(true);
    sweepSessions(st, Date.now() + CLOSE_GRACE_MS);
    expect(await procs.other.exited).not.toBe(0);
    expect(alive(procs.later)).toBe(true);                     // run a is still waiting

    // A fix launched on a done run, after it last moved, is doing the work: kept.
    const fix = start("fix", { run: "2026-10-01-b", started: Date.now() + 1000 });
    procs.fix = fix;
    for (let i = 0; i < 100 && !existsSync(join(dir, "fix.pid")); i++) await Bun.sleep(20);
    sweepSessions(st, Date.now() + 2 * CLOSE_GRACE_MS);
    await Bun.sleep(100);
    expect(alive(fix)).toBe(true);

    // An abandoned run is left to abandonRun; the sweep does not close it, even a
    // session launched long before the run last moved.
    const gone = start("gone", { started: 0 });
    procs.gone = gone;
    for (let i = 0; i < 100 && !existsSync(join(dir, "gone.pid")); i++) await Bun.sleep(20);
    writeFileSync(join(st, "runs", "2026-10-01-a", "state.json"), JSON.stringify({ stage: "abandoned", awaiting: null }));
    sweepSessions(st, Date.now() + 2 * CLOSE_GRACE_MS);
    await Bun.sleep(100);
    expect(alive(gone)).toBe(true);
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
  writeFileSync(cfg, JSON.stringify({ keep: 1, projects: { [plain]: { x: 2 } } }));
  trustFolder(sub, cfg);
  trustFolder(plain, cfg);
  const d = JSON.parse(readFileSync(cfg, "utf8"));
  expect(d.keep).toBe(1);
  expect(d.projects[realpathSync(repo)]).toEqual({ hasTrustDialogAccepted: true });
  expect(d.projects[plain]).toEqual({ x: 2, hasTrustDialogAccepted: true });
  writeFileSync(cfg, "{bad");
  trustFolder(plain, cfg);
  expect(readFileSync(cfg, "utf8")).toBe("{bad");
  rmSync(t, { recursive: true, force: true });
});
