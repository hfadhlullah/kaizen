import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { onboardingView, readOnboarding, writeOnboarding, installHelp, STEPS } from "./onboarding.ts";

const home = () => realpathSync(mkdtempSync(join(tmpdir(), "kz-onb-")));

test("a new user, with no project, is shown the flow", () => {
  expect(onboardingView(home(), 0)).toEqual({ show: true, resume: false, step: 0, total: STEPS });
});

test("a board with any project never shows it, saved state or not", () => {
  const h = home();
  expect(onboardingView(h, 1)).toMatchObject({ show: false, resume: false });
  writeOnboarding(h, { step: 1 });
  expect(onboardingView(h, 2)).toMatchObject({ show: false, resume: false });
  writeOnboarding(h, { outcome: "skipped" });
  expect(onboardingView(h, 1)).toMatchObject({ show: false, resume: false });
});

test("skipped or left half done comes back as resume at the step reached; done and dismissed never do", () => {
  const h = home();
  writeOnboarding(h, { step: 2 });
  expect(onboardingView(h, 0)).toMatchObject({ show: false, resume: true, step: 2 });
  writeOnboarding(h, { outcome: "skipped" });
  expect(onboardingView(h, 0)).toMatchObject({ resume: true, step: 2 });
  writeOnboarding(h, { outcome: "dismissed" });
  expect(onboardingView(h, 0)).toMatchObject({ show: false, resume: false });
  writeOnboarding(h, { outcome: "done" });
  expect(onboardingView(h, 0)).toMatchObject({ show: false, resume: false });
});

test("a flow opened but not advanced shows again rather than resuming", () => {
  const h = home();
  writeOnboarding(h, { step: 0 });
  expect(onboardingView(h, 0)).toMatchObject({ show: true, resume: false });
});

test("writes merge, persist in the board's own file, and refuse anything else", () => {
  const h = home();
  expect(writeOnboarding(h, { step: 1 })).toEqual({ step: 1, outcome: null });
  expect(writeOnboarding(h, { outcome: "skipped" })).toEqual({ step: 1, outcome: "skipped" });
  expect(JSON.parse(readFileSync(join(h, ".kaizen", "onboarding.json"), "utf8"))).toEqual({ step: 1, outcome: "skipped" });
  for (const bad of [{ step: -1 }, { step: STEPS }, { step: 1.5 }, { step: "1" }, { outcome: "finished" }, { outcome: 1 }])
    expect(writeOnboarding(h, bad)).toEqual({ error: expect.any(String) });
  expect(readOnboarding(h)).toEqual({ step: 1, outcome: "skipped" });
});

test("a corrupt file reads as never started, and the next write replaces it", () => {
  const h = home();
  mkdirSync(join(h, ".kaizen"));
  writeFileSync(join(h, ".kaizen", "onboarding.json"), "{nope");
  expect(readOnboarding(h)).toBeNull();
  expect(onboardingView(h, 0)).toMatchObject({ show: true });
  expect(writeOnboarding(h, { step: 1 })).toEqual({ step: 1, outcome: null });
});

test("installHelp covers every agent the step offers, with the same commands and pages as the installer", () => {
  const src = readFileSync(join(import.meta.dir, "install.ts"), "utf8");
  for (const win of [false, true]) {
    const h = installHelp(win);
    expect(Object.keys(h).sort()).toEqual(["agy", "claude", "codex", "gemini", "opencode"]);
    for (const [cmd, x] of Object.entries(h)) {
      expect(src).toContain(x.docs);
      if (x.command) expect(src).toContain(x.command);
      else expect(cmd).toBe("agy"); // only Antigravity has no command
    }
  }
});
