import { expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtifactView } from "./artifact-view.tsx";
import { ResultChecks } from "./result-checks.tsx";
import { ResultView } from "./result-view.tsx";
import { storedUrl, webUrl, type TaskArtifact, type TaskResult } from "@lib/task/task-results.ts";
import { canAcceptTask, closeActions, filteredTasks, taskHref, type TaskView } from "@lib/task/tasks.ts";
import { taskForCard } from "@lib/rail";
import { waitingCount } from "@lib/server";

// The Tasks pages' rules and viewers, rendered the way the board renders them (react-dom/server), with lifecycle fixtures.
const html = (e: ReactElement) => renderToStaticMarkup(e);
const resultView = (r?: TaskResult, artifactId?: string) =>
  html(createElement(ResultView, { result: r, artifactId, onSelect: () => {} }));
const artifactView = (artifact: TaskArtifact, selected = true) =>
  html(createElement(ArtifactView, { artifact, selected }));
const checksView = (r?: TaskResult) => html(createElement(ResultChecks, { result: r }));
const task = (
  id: string,
  category: "needs-you" | "in-progress" | "completed",
  more: Partial<TaskView> = {},
): TaskView => ({
  id,
  dir: "/projects/workshop/.kaizen",
  title: "Event registration website",
  goal: "Register people for the workshop",
  revision: 4,
  updatedAt: 1000,
  attention: {
    category,
    reason: category === "needs-you" ? "Your feedback is needed" : category === "completed" ? "Accepted" : "Working",
    action:
      category === "needs-you"
        ? "Inspect the current result"
        : category === "completed"
          ? "Revisit the result"
          : "Changes will be queued",
  },
  ...more,
});
const result: TaskResult = {
  id: "r2",
  title: "Registration website",
  summary: "Phone field removed",
  createdAt: 2000,
  artifacts: [
    {
      id: "s2",
      name: "Registration screen.png",
      kind: "screenshot",
      mediaType: "image/png",
      url: "/task-artifact?task=t1&result=r2&artifact=s2",
      size: 2048,
    },
  ],
  checks: ["The form renders at 390px"],
  limitations: ["Registration backend has not been tested"],
};

test("attention ordering, filtering and search use the same reason as task page", () => {
  const tasks = [
    task("done", "completed", { updatedAt: 5000 }),
    task("work", "in-progress", { updatedAt: 6000 }),
    task("need", "needs-you", { updatedAt: 2000 }),
    task("need-new", "needs-you", { updatedAt: 3000 }),
  ];
  expect(filteredTasks(tasks).map((t) => t.id)).toEqual(["need-new", "need", "work", "done"]);
  expect(filteredTasks(tasks, "completed").map((t) => t.id)).toEqual(["done"]);
  expect(filteredTasks(tasks, "all", "inspect the current result").map((t) => t.id)).toEqual(["need-new", "need"]);
  expect(filteredTasks(tasks, "all", "", "/another/.kaizen")).toEqual([]);
});
test("same title tasks retain their stable route identity including project context", () => {
  const a = task("uuid-a", "needs-you"),
    b = task("uuid-b", "needs-you");
  expect(taskHref(a)).not.toEqual(taskHref(b));
  expect(taskHref(a)).toContain("task=uuid-a&dir=%2Fprojects%2Fworkshop%2F.kaizen");
});
test("acceptance requires current result and no writer, pending decision or queued receipt", () => {
  const ready = task("t", "needs-you", { currentResultId: "r2" });
  expect(canAcceptTask(ready, result)).toBe(true);
  expect(canAcceptTask({ ...ready, activeRun: "run1" }, result)).toBe(false);
  expect(canAcceptTask({ ...ready, decision: { id: "p", kind: "proposal", text: "Confirm" } }, result)).toBe(false);
  for (const state of ["received", "queued", "dispatched"])
    expect(canAcceptTask({ ...ready, inputs: [{ id: "q", text: "Add a map", state }] }, result)).toBe(false);
  expect(canAcceptTask({ ...ready, currentResultId: "r3" }, result)).toBe(false);
  expect(canAcceptTask({ ...ready, attention: { ...ready.attention, category: "completed" } }, result)).toBe(false);
  expect(canAcceptTask(ready)).toBe(false);
});
test("result shows saved output, evidence, unverified backend and separate publication", () => {
  const view = resultView(result) + checksView(result);
  expect(view).toContain("Registration screen.png");
  expect(view).toContain("Saved file");
  expect(view).toContain("2.0 KB");
  expect(view).toContain("Phone field removed");
  expect(view).toContain("Registration backend has not been tested");
  expect(view).toContain("does not publish it");
  expect(view).toContain("Download");
});
test("mixed output selection gives appropriate image media text PDF and download viewers", () => {
  const all: TaskResult = {
    ...result,
    artifacts: [
      result.artifacts[0],
      { id: "md", name: "Guide.md", kind: "markdown", mediaType: "text/markdown", url: "/task-artifact?artifact=md" },
      { id: "v", name: "Demo.mp4", kind: "video", mediaType: "video/mp4", url: "/task-artifact?artifact=v" },
      { id: "a", name: "Narration.mp3", kind: "audio", mediaType: "audio/mpeg", url: "/task-artifact?artifact=a" },
      { id: "p", name: "Report.pdf", kind: "pdf", mediaType: "application/pdf", url: "/task-artifact?artifact=p" },
      {
        id: "doc",
        name: "Outline.docx",
        kind: "file",
        mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        url: "/task-artifact?artifact=doc",
      },
    ],
  };
  expect(resultView(all, "md")).toContain("Loading saved text");
  expect(resultView(all, "v")).toContain("<video");
  expect(resultView(all, "a")).toContain("<audio");
  expect(resultView(all, "p")).toContain("sandbox");
  expect(resultView(all, "doc")).toContain("Preview is unavailable for this format");
  expect(resultView(all)).toContain('aria-label="Outputs"');
});
test("active HTML and SVG outputs stay downloads and user labels cannot inject markup", () => {
  for (const [name, mediaType] of [
    ["demo.html", "text/html"],
    ["graphic.svg", "image/svg+xml"],
  ]) {
    const view = artifactView({ id: "x", name, kind: "image", mediaType, url: "/task-artifact?artifact=x" });
    expect(view).not.toContain("<iframe");
    expect(view).not.toContain("<img");
    expect(view).toContain("Download this file");
  }
  const malicious = artifactView({
    id: "x",
    name: '<img src=x onerror="alert(1)">',
    kind: "file",
    url: "/task-artifact?artifact=x",
  });
  expect(malicious).toContain("&lt;img");
  expect(malicious).not.toContain("<img");
});
test("unsafe URLs never become embedded outputs and mutable live preview is labelled", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///etc/passwd",
    "https://user:secret@example.com",
  ])
    expect(webUrl(url)).toBeNull();
  for (const url of ["https://evil.test/output", "//evil.test/output", "/file?name=x", "/task-artifact\\bad"])
    expect(storedUrl(url)).toBeNull();
  const live = artifactView({ id: "web", name: "Workshop", kind: "website", url: "https://example.com" });
  expect(live).toContain("Live link · mutable");
  expect(live).toContain("Open link");
  expect(live).not.toContain("allow-same-origin");
});
test("missing files and no results explain their limits instead of claiming availability", () => {
  expect(artifactView({ ...result.artifacts[0], missing: true })).toContain("saved file is unavailable");
  expect(resultView(undefined)).toContain("approve a short plan");
});

test("task attention counts acceptance separately from source-control housekeeping", () => {
  const accepted = task("accepted", "completed", { runs: ["done-run"] });
  const ready = task("ready", "needs-you", { runs: ["ready-run"] });
  const cards = [
    { state: accepted.dir, id: "done-run", kind: "run", status: "done", gitDue: true },
    { state: ready.dir, id: "ready-run", kind: "run", status: "done", gitDue: true },
  ];
  expect(waitingCount(cards, [accepted, ready])).toBe(1);
  expect(taskForCard(cards[0], [accepted, ready])?.attention.category).toBe("completed");
  expect(taskForCard(cards[1], [accepted, ready])?.attention.action).toBe("Inspect the current result");
});

const allowed = {
  accept: false,
  stop: false,
  resume: false,
  abandon: false,
  archive: true,
  delete: false,
  start: false,
};
test("Looks good follows the server's allowed list and a leftover pause", () => {
  expect(
    canAcceptTask(task("a", "needs-you", { currentResultId: "r2", actions: { ...allowed, accept: true } }), result),
  ).toBe(true);
  expect(
    canAcceptTask(
      task("a", "needs-you", {
        currentResultId: "r2",
        actions: { ...allowed, accept: false, acceptWhy: "The workflow is still reviewing this result" },
      }),
      result,
    ),
  ).toBe(false);
  expect(canAcceptTask(task("a", "needs-you", { currentResultId: "r2", queuePaused: true }), result)).toBe(false);
});
test("the task page offers Delete only before any run, never says stopped, and draws the actions list", async () => {
  const src = await Bun.file(new URL("../../pages/task-page.tsx", import.meta.url)).text();
  const model = await Bun.file(new URL("../../lib/task/use-task-page.ts", import.meta.url)).text();
  expect(src).not.toContain('"stopped"');
  expect(model).toContain("t.actions?.stop");
  expect(model).toContain("t.actions?.resume");
  // Without a server list: Archive always, Abandon only for a live run, Delete only while no run exists.
  const base = task("a", "needs-you");
  expect(closeActions(base)).toMatchObject({ abandon: false, delete: true });
  expect(closeActions({ ...base, runs: ["r1"] })).toMatchObject({ abandon: false, delete: false });
  expect(closeActions({ ...base, activeRun: "r1" })).toMatchObject({ abandon: true, delete: false });
  expect(closeActions({ ...base, actions: allowed })).toMatchObject({ archive: true, delete: false, abandon: false });
});

import { cleanRequest, cleanTitle, taskTitle, conversationItems, tabFor, tabMarks } from "@lib/task";
test("a task's title is the person's words, never the board's scaffolding", () => {
  expect(cleanTitle("# Request")).toBe("");
  expect(cleanTitle("# Request\n\na fitness app with this brief\n\n# Inbox\n- x <!-- added:1 -->")).toBe(
    "A fitness app with this brief",
  );
  expect(cleanTitle("<!-- added:1 -->\nFix the login")).toBe("Fix the login");
  const t = task("a", "needs-you", {
    title: "# Request",
    goal: "# Request\n\na fitness app with this brief, discuss with me first",
  });
  expect(taskTitle(t)).toBe("A fitness app with this brief, discuss with me first");
  expect(taskTitle(task("b", "needs-you", { title: "Fix the login" }))).toBe("Fix the login");
});
const ev = (id: string, role: string, type: string, text = "t", agent?: string) => ({
  id,
  role,
  type,
  text,
  at: 1,
  ...(agent ? { agent } : {}),
});
test("a request shows as the person's words, without the inbox's headings and stamps", () => {
  expect(cleanRequest("# Request\n\na fitness app with this brief\n\n# Inbox\n\n- started: x <!-- added:1 -->")).toBe(
    "a fitness app with this brief",
  );
  expect(cleanRequest("Fix the login")).toBe("Fix the login");
});
test("the conversation: the plan line only while it waits, a stop is one line, an approval is a quiet line", () => {
  const messages = [
    ev("1", "user", "message", "build it"),
    ev("2", "assistant", "proposal", "plan"),
    ev("3", "system", "stop"),
    ev("4", "system", "stopped"),
  ];
  const waiting = conversationItems({ messages, decision: { id: "d", kind: "proposal", text: "plan" } });
  expect(waiting.map((i) => (i.kind === "line" ? i.text : i.kind))).toEqual([
    "message",
    "Plan ready · needs your approval",
    "Agent stopped · edits kept",
  ]);
  const answered = conversationItems({
    messages: [...messages, ev("5", "user", "confirm", "Plan approved.")],
    decision: null,
  });
  expect(answered.map((i) => (i.kind === "line" ? i.text : i.kind))).toEqual([
    "message",
    "Agent stopped · edits kept",
    "You approved the plan",
  ]);
  expect(answered.some((i) => i.kind === "line" && i.text.startsWith("Plan ready"))).toBe(false);
  // A system warning keeps its own words.
  const warn = conversationItems({
    messages: [ev("6", "system", "result-refused", "The result was not accepted yet")],
    decision: null,
  });
  expect(warn[0]).toMatchObject({ kind: "line", text: "The result was not accepted yet", tone: "warn" });
});
test("a question after an approved plan does not bring the Plan ready line back", () => {
  const messages = [
    ev("1", "assistant", "proposal", "plan"),
    ev("2", "user", "confirm", "Plan approved."),
    ev("3", "assistant", "question", "Which database?"),
  ];
  const q = conversationItems({ messages, decision: { id: "d", kind: "question", text: "Which database?" } });
  expect(q.some((i) => i.kind === "line" && i.text.startsWith("Plan ready"))).toBe(false);
  expect(q.map((i) => i.kind)).toEqual(["line", "message"]);
});
test("a handoff line sits between two agents' messages, and only there", () => {
  const messages = [
    ev("1", "assistant", "reply", "a", "claude"),
    ev("2", "assistant", "reply", "b", "claude"),
    ev("3", "assistant", "result", "c", "codex"),
    ev("4", "assistant", "reply", "d"),
  ];
  const kinds = conversationItems({ messages, decision: null }).map((i) =>
    i.kind === "handoff" ? `${i.from}>${i.to}` : i.kind,
  );
  expect(kinds).toEqual(["message", "message", "Claude>Codex", "message", "message"]);
});
test("the tab that opens, and its mark, follow the task's status", () => {
  const wait = task("a", "needs-you", { status: "waiting", decision: { id: "d", kind: "proposal", text: "p" } });
  expect(tabFor(wait)).toBe("plan");
  expect(tabMarks(wait)).toEqual({ plan: "wait", result: null });
  expect(tabFor(task("b", "in-progress", { status: "working", runStage: "plan" }))).toBe("plan");
  const building = task("c", "in-progress", { status: "working", runStage: "build", currentResultId: "r1" });
  expect(tabFor(building)).toBe("result");
  expect(tabMarks(building)).toEqual({ plan: null, result: "run" });
  const done = task("d", "completed", { status: "accepted", currentResultId: "r1" });
  expect(tabMarks(done)).toEqual({ plan: null, result: "ok" });
});

import { AgentChip } from "./agent-chip.tsx";
import { ChangesView } from "./changes-view.tsx";
import { Composer } from "./composer.tsx";
import { PlanView } from "./plan-view.tsx";
import { ReviewView } from "./review-view.tsx";
import { TaskTabs } from "./task-tabs.tsx";
import { Thread } from "./conversation.tsx";
import { TaskPhone } from "./task-phone.tsx";
import { useTaskPage } from "@lib/task";
import { TooltipProvider } from "@web/ui";
const withTips = (e: ReactElement) => createElement(TooltipProvider, null, e);
test("the agent chip names who is on the task, and is absent when no run has an agent", () => {
  expect(html(createElement(AgentChip, { agents: [] }))).toBe("");
  const two = [
    { agent: "claude", name: "Claude", state: "done" as const, current: false },
    { agent: "codex", name: "Codex", state: "working" as const, current: true },
  ];
  const out = html(createElement(AgentChip, { agents: two, stage: "review" }));
  expect(out).toContain("Codex");
  expect(out).toContain("reviewing");
  expect(out).toContain("Claude");
});
test("the tabs mark the one that needs you, and the thread, plan and run views render in every state", () => {
  const tabs = html(
    createElement(TaskTabs, {
      tabs: [
        { id: "plan", label: "Plan", mark: "wait" },
        { id: "result", label: "Result", mark: "run" },
        { id: "changes", label: "Changes", count: 3 },
      ],
      active: "plan",
      onPick: () => {},
    }),
  );
  expect(tabs).toContain('aria-selected="true"');
  expect(tabs).toContain("Changes");
  const items = conversationItems({
    messages: [
      ev("1", "user", "message", "hi"),
      ev("2", "assistant", "reply", "done", "claude"),
      ev("3", "assistant", "result", "built", "codex"),
    ],
    decision: null,
  });
  const thread = html(createElement(Thread, { items, working: true }));
  expect(thread).toContain("Handed to Codex");
  expect(thread).toContain("Claude");
  const run = {
    id: "r",
    review: "# Review",
    plan: "## Work list\n1. one\n2. two\n\n## Scope\nx",
    findings: [{ n: 1, text: "A finding" }],
    files: [{ path: "a.ts", add: 2, del: 1, code: "M" }],
  };
  expect(html(createElement(PlanView, { run, loaded: true }))).toContain("Approved plan");
  expect(html(createElement(PlanView, { run: null, loaded: true }))).toContain("appears here");
  expect(html(createElement(PlanView, { run: null, loaded: true, planning: true }))).toContain("is planning");
  expect(html(createElement(PlanView, { run: null, loaded: true, waiting: true }))).not.toContain("appears here");
  expect(html(createElement(ChangesView, { run }))).toContain("a.ts");
  expect(html(createElement(ReviewView, { run }))).toContain("A finding");
  expect(html(createElement(ReviewView, { run: null }))).toContain("no review");
  expect(html(createElement(ReviewView, { run: { ...run, review: null, findings: [] } }))).toContain("no review");
  expect(html(createElement(ReviewView, { run: { ...run, findings: [] } }))).toContain("found nothing");
  expect(
    html(
      createElement(Composer, {
        inputRef: { current: null },
        value: "",
        onChange: () => {},
        onSend: () => {},
        help: "h",
      }),
    ),
  ).toContain("Message the agent");
});
test("the phone task renders for a waiting plan, a working agent and a finished result without a thrown error", () => {
  const page = { task: task("p", "needs-you"), results: [] };
  const Probe = ({ t }: { t: TaskView }) => {
    const m = useTaskPage({ ...page, task: t }, t);
    return createElement(TaskPhone, { page: { ...page, task: t }, t, m, permission: null });
  };
  const waiting = task("p1", "needs-you", {
    status: "waiting",
    decision: { id: "d", kind: "proposal", text: "Build it", details: "1. one\n2. two" },
    agents: [{ agent: "claude", name: "Claude", state: "stopped", current: true }],
  });
  const out = html(withTips(createElement(Probe, { t: waiting })));
  expect(out).toContain("Approve plan");
  expect(out).toContain("Ask for changes");
  expect(out).toContain("Detailed plan");
  expect(
    html(
      withTips(createElement(Probe, { t: task("p0", "in-progress", { status: "interrupted", actions: undefined }) })),
    ),
  ).toContain("Resume");
  const working = task("p2", "in-progress", {
    status: "working",
    activeRun: "r1",
    runs: ["r1"],
    agents: [{ agent: "codex", name: "Codex", state: "working", current: true }],
  });
  expect(html(withTips(createElement(Probe, { t: working })))).toContain("Stop");
  const result = {
    id: "x",
    title: "Workshop",
    summary: "Ready",
    createdAt: "2026-01-01",
    artifacts: [],
    checks: [],
  } as unknown as TaskResult;
  const done = task("p3", "needs-you", {
    status: "ready",
    currentResultId: "x",
    actions: { accept: true, stop: false, resume: false, abandon: false, archive: true, delete: false, start: false },
  });
  const Done = () => {
    const m = useTaskPage({ task: done, results: [result] }, done);
    return createElement(TaskPhone, {
      page: { task: done, results: [result] },
      t: done,
      m,
      permission: null,
    });
  };
  const fin = html(withTips(createElement(Done)));
  expect(fin).toContain("Open the result");
  const rich = task("p4", "completed", {
    status: "accepted",
    acceptedResultId: "x",
    currentResultId: "x",
    files: [{ name: "brief.pdf" }],
  });
  const Rich = () => {
    const m = useTaskPage({ task: rich, results: [result, { ...result, id: "y" } as TaskResult] }, rich);
    return createElement(TaskPhone, { page: { task: rich, results: [result] }, t: rich, m, permission: null });
  };
  const richOut = html(withTips(createElement(Rich)));
  expect(richOut).toContain("Reference files");
  expect(richOut).toContain("Accepted. Publishing is a separate action.");
  expect(fin).toContain("Looks good");
});

import { taskProgress } from "@lib/task";
import { PanelFrame, PanelProgress, PanelStrip } from "@components/shared";
import { TaskPanel } from "./task-panel.tsx";
test("the progress bar says what the task waits on, in steps", () => {
  expect(
    taskProgress(
      task("g", "in-progress", {
        status: "queued",
        attention: { category: "in-progress", reason: "Queued", action: "" },
      }),
    ).word,
  ).toBe("Queued");
  expect(
    taskProgress(task("a", "needs-you", { status: "waiting", decision: { id: "d", kind: "proposal", text: "p" } })),
  ).toEqual({ word: "Plan, needs you", pct: 30, tone: "wait" });
  expect(
    taskProgress(task("a", "needs-you", { status: "waiting", decision: { id: "d", kind: "question", text: "q" } }))
      .word,
  ).toBe("Question, needs you");
  expect(taskProgress(task("b", "in-progress", { status: "working", runStage: "build" }))).toEqual({
    word: "Build",
    pct: 62,
    tone: "run",
  });
  expect(taskProgress(task("b", "in-progress", { status: "working", runStage: "review" })).pct).toBe(85);
  expect(taskProgress(task("c", "completed", { status: "accepted" }))).toEqual({ word: "Done", pct: 100, tone: "ok" });
  expect(taskProgress(task("d", "in-progress", { status: "draft" }))).toEqual({
    word: "Not started",
    pct: 0,
    tone: "idle",
  });
  expect(taskProgress(task("e", "needs-you", { status: "ready", currentResultId: "r1" })).word).toBe("Ready for you");
  expect(taskProgress(task("f", "in-progress", { status: "interrupted", runStage: "build" })).word).toBe(
    "Build, stopped",
  );
});
test("the panel frame draws header, body, foot and strip, and only the strip when folded", () => {
  const open = html(
    createElement(PanelFrame, {
      label: "x",
      header: createElement("i", null, "HEAD"),
      body: createElement("i", null, "BODY"),
      foot: createElement("i", null, "FOOT"),
      strip: createElement("i", null, "STRIP"),
    }),
  );
  for (const w of ["HEAD", "BODY", "FOOT", "STRIP"]) expect(open).toContain(w);
  const shut = html(
    createElement(PanelFrame, {
      label: "x",
      folded: true,
      header: createElement("i", null, "HEAD"),
      body: createElement("i", null, "BODY"),
      strip: createElement("i", null, "STRIP"),
    }),
  );
  expect(shut).toContain("STRIP");
  expect(shut).not.toContain("HEAD");
  const strip = html(
    createElement(PanelStrip, {
      items: [{ id: "chat", icon: "request", label: "Conversation", dot: true }],
      active: "chat",
      onPick: () => {},
    }),
  );
  expect(strip).toContain("Hide the panel");
  expect(html(createElement(PanelProgress, { word: "Build", pct: 62, tone: "run" }))).toContain("width:62%");
});
test("the task panel shows the task, its progress, the agent and the foot, and folds to the strip", () => {
  const t = task("p", "needs-you", {
    status: "waiting",
    decision: { id: "d", kind: "proposal", text: "p" },
    agents: [{ agent: "claude", name: "Claude", state: "stopped", current: true }],
  });
  const props = {
    t,
    folded: false,
    onFold: () => {},
    threadRef: { current: null },
    footer: createElement("i", null, "BOX"),
    actions: createElement("i", null, "ACTIONS"),
    projectName: "proj",
  };
  const out = html(withTips(createElement(TaskPanel, props)));
  for (const w of ["Plan, needs you", "proj", "Claude", "BOX", "ACTIONS", "Conversation"]) expect(out).toContain(w);
  // A task missing from the list (a legacy task, the list not loaded) is still its own picker entry.
  expect(out).toContain(t.title);
  const folded = html(withTips(createElement(TaskPanel, { ...props, folded: true })));
  expect(folded).toContain("Conversation, collapsed");
  expect(folded).not.toContain("BOX");
});
