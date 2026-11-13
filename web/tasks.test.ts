import { expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtifactView } from "./components/artifact-view.tsx";
import { ResultChecks } from "./components/result-checks.tsx";
import { ResultView } from "./components/result-view.tsx";
import { storedUrl, webUrl, type TaskArtifact, type TaskResult } from "./lib/task-results.ts";
import { canAcceptTask, closeActions, filteredTasks, taskHref, type TaskView } from "./lib/tasks.ts";
import { waitingCount, taskForCard } from "./board/badge.ts";

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
  const src = await Bun.file(new URL("./pages/task-page.tsx", import.meta.url)).text();
  expect(src).not.toContain('"stopped"');
  expect(src).toContain("t.actions?.stop");
  expect(src).toContain("t.actions?.resume");
  // Without a server list: Archive always, Abandon only for a live run, Delete only while no run exists.
  const base = task("a", "needs-you");
  expect(closeActions(base)).toMatchObject({ abandon: false, delete: true });
  expect(closeActions({ ...base, runs: ["r1"] })).toMatchObject({ abandon: false, delete: false });
  expect(closeActions({ ...base, activeRun: "r1" })).toMatchObject({ abandon: true, delete: false });
  expect(closeActions({ ...base, actions: allowed })).toMatchObject({ archive: true, delete: false, abandon: false });
});
