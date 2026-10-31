import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { placeOf, SETTINGS_NAV } from "./settings-pages.ts";

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

test("the Automations page sits under Workflows", () => {
  expect(SETTINGS_NAV.find(([g]) => g === "Workflows")![1].some((p) => p.id === "automations")).toBe(true);
});
