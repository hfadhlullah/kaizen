import { expect, test, beforeAll } from "bun:test";
import { artifactView, resultView, storedUrl, webUrl, type TaskResult } from "./task-results.ts";
import { waitingCount, taskForCard } from "./badge.ts";
import type { TaskView } from "./task-page.ts";

let canAcceptTask: typeof import("./task-page.ts").canAcceptTask;
let filteredTasks: typeof import("./tasks.ts").filteredTasks;
let taskHref: typeof import("./task-page.ts").taskHref;
// Import browser state with just its environment reads available, then restore the
// host. These tests exercise the actual presentation rules, with lifecycle fixtures.
beforeAll(async () => {
  const names = ["location", "addEventListener"] as const;
  const old = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "" } });
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, value: () => {} });
  try {
    ({ canAcceptTask, taskHref } = await import("./task-page.ts"));
    ({ filteredTasks } = await import("./tasks.ts"));
  } finally {
    names.forEach((name, i) =>
      old[i] ? Object.defineProperty(globalThis, name, old[i]!) : delete (globalThis as any)[name],
    );
  }
});
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
  const view = String(resultView(result));
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
  expect(String(resultView(all, "md"))).toContain("data-text-artifact");
  expect(String(resultView(all, "v"))).toContain("<video");
  expect(String(resultView(all, "a"))).toContain("<audio");
  expect(String(resultView(all, "p"))).toContain("sandbox");
  expect(String(resultView(all, "doc"))).toContain("Preview is unavailable for this format");
  expect(String(resultView(all))).toContain('aria-label="Outputs"');
});
test("active HTML and SVG outputs stay downloads and user labels cannot inject markup", () => {
  for (const [name, mediaType] of [
    ["demo.html", "text/html"],
    ["graphic.svg", "image/svg+xml"],
  ]) {
    const view = String(
      artifactView({ id: "x", name, kind: "image", mediaType, url: "/task-artifact?artifact=x" }, true),
    );
    expect(view).not.toContain("<iframe");
    expect(view).not.toContain("<img");
    expect(view).toContain("Download this file");
  }
  const malicious = String(
    artifactView(
      { id: "x", name: '<img src=x onerror="alert(1)">', kind: "file", url: "/task-artifact?artifact=x" },
      true,
    ),
  );
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
  const live = String(artifactView({ id: "web", name: "Workshop", kind: "website", url: "https://example.com" }, true));
  expect(live).toContain("Live link · mutable");
  expect(live).toContain("Open link");
  expect(live).not.toContain("allow-same-origin");
});
test("missing files and no results explain their limits instead of claiming availability", () => {
  expect(String(artifactView({ ...result.artifacts[0], missing: true }, true))).toContain("saved file is unavailable");
  expect(String(resultView(undefined))).toContain("confirm a short proposal");
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
