import { expect, test } from "bun:test";
import type { Card } from "@lib/core";
import { runAgentInfo } from "./run-agent.ts";

const card = (more: Partial<Card> = {}): Card => ({
  kind: "run",
  state: "/p/.kaizen",
  where: "p",
  column: 2,
  status: "running",
  id: "r1",
  stage: "build",
  ...more,
});
test("the run's agent: working while its terminal is open, stopped when it is not, done when the run is over", () => {
  const state = JSON.stringify({ agent: "codex" });
  expect(runAgentInfo(card({ pty: { alive: true, key: "k" } }), state)).toEqual({
    agent: "codex",
    state: "working",
    stage: "build",
    key: "k",
  });
  expect(runAgentInfo(card(), state)).toMatchObject({ agent: "codex", state: "stopped" });
  expect(runAgentInfo(card({ stage: "done", status: "done" }), state)).toMatchObject({ state: "done" });
  // An open agent terminal for the run names the tool even when the state has none.
  expect(runAgentInfo(card(), "{}", [{ key: "t1", dir: "/p/.kaizen", run: "r1", agent: "claude" }])).toMatchObject({
    agent: "claude",
    state: "working",
    key: "t1",
  });
});
test("a task card, a card with no agent and unreadable state give no chip", () => {
  expect(runAgentInfo(card({ kind: "idea" }), '{"agent":"claude"}')).toBeNull();
  expect(runAgentInfo(card(), "{}")).toBeNull();
  expect(runAgentInfo(card(), "not json")).toBeNull();
  expect(runAgentInfo(null, undefined)).toBeNull();
});
