import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { pageId, placeOf, SETTINGS_NAV } from "./settings-pages.ts";

const pages = new Set(SETTINGS_NAV.flatMap(([, ps]) => ps.map((p) => p.id)));
const keys = [...readFileSync(new URL("../../cli/settings.ts", import.meta.url), "utf8").matchAll(/\{ key: "([\w.]+)", label:/g)].map((m) => m[1]);

test("every setting lands on a real page, under a named subsection", () => {
  expect(keys.length).toBeGreaterThan(30);
  for (const k of keys) {
    const [page, sub] = placeOf(k);
    expect(pages.has(page)).toBe(true);
    expect([k, sub === "Other"]).toEqual([k, false]);
  }
});

test("a setting not placed yet falls back to General", () => {
  expect(placeOf("new.thing")).toEqual(["general", "Other"]);
});

test("the Orchestration page exists and holds its three settings", () => {
  expect(pages.has("orchestration")).toBe(true);
  for (const k of ["enabled", "max_workers", "permissions", "worker_model.claude"]) expect(placeOf(`orchestration.${k}`)).toEqual(["orchestration", "Workers"]);
});

test("the Automations page sits under Workflow", () => {
  expect(SETTINGS_NAV.find(([g]) => g === "Workflow")![1].some((p) => p.id === "automations")).toBe(true);
});

test("models, the run's workflow and dictation each have their own page", () => {
  for (const k of ["subagents.model", "subagents.reviewer", "agent.model.codex"]) expect(placeOf(k)).toEqual(["models", "Models"]);
  expect(placeOf("agent.handoff_model.claude")).toEqual(["models", "Handoff session"]);
  for (const k of ["preset", "runner", "explore.enabled", "build.executor", "review.executor"]) expect(placeOf(k)).toEqual(["runs", "Workflow"]);
  for (const k of ["review.write_memory", "review.memory_max_lines"]) expect(placeOf(k)).toEqual(["runs", "Memory"]);
  expect(placeOf("dictation.model")).toEqual(["keyboard", "Dictation"]);
  expect(placeOf("board.chat_hotkey")).toEqual(["keyboard", "Shortcuts"]);
  expect(placeOf("state.keep_runs")).toEqual(["general", "Storage"]);
  expect(placeOf("board.projects_dir")).toEqual(["general", "Folders"]);
  expect(placeOf("board.open")).toEqual(["general", "App"]);
});

test("old page addresses open the page they were merged into", () => {
  expect(pageId("voice")).toBe("keyboard");
  expect(pageId("shortcuts")).toBe("keyboard");
  expect(pageId("mobile")).toBe("mobile");
  expect(pages.has("mobile")).toBe(true);
});

test("every page has a tile icon that exists in the board's icon set", () => {
  const board = readFileSync(new URL("../board.html", import.meta.url), "utf8");
  for (const p of SETTINGS_NAV.flatMap(([, ps]) => ps)) expect([p.id, board.includes(`id="i-${p.ico}"`)]).toEqual([p.id, true]);
});
