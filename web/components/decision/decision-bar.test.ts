import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionBar } from "./decision-bar.tsx";

// The task page's section layout of DecisionBar, rendered for each kind of decision. It once threw on every
// render (a prop used but never read) and no test drew it.
const noop = () => {};
const draw = (decision: any, extra: any = {}) =>
  renderToStaticMarkup(createElement(DecisionBar, { decision, onApprove: noop, onAnswer: noop, onProject: noop, ...extra }));

test("a plan waiting for approval shows its text and the Approve plan button", () => {
  const out = draw({ id: "d1", kind: "proposal", text: "Build the page", details: "## Plan\n1. one" });
  expect(out).toContain("Build the page");
  expect(out).toContain("Approve plan");
});
test("a question shows its text and one button per option", () => {
  const out = draw({ id: "d2", kind: "question", text: "Which date?", options: ["Today", "Tomorrow"] });
  expect(out).toContain("Which date?");
  expect(out).toContain("Today");
  expect(out).toContain("Tomorrow");
});
test("no decision draws nothing but the project choice when one is needed", () => {
  expect(draw(null)).toBe("");
  expect(draw(null, { needsProject: true, projects: [{ dir: "/p/a", name: "a", label: "a" }] })).toContain("Where should this task belong?");
});
