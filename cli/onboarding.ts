// The board's first-run onboarding: where a user got to is kept in ~/.kaizen/onboarding.json, on the
// machine that runs the board, so a phone, a second browser and a fresh HOME each see the right thing.
// Pure and sync: web.ts adds the routes, the page draws it.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const STEPS = 5; // how it works, default agent, how much to ask, look and notifications, phone; adding a project is the last button, not a step
export type Outcome = "done" | "skipped" | "dismissed" | null;
export type Saved = { step: number; outcome: Outcome };

// The new screen an old step lands on: the first one that person has not seen (agent done → how much to ask, and so on).
const OLD_STEPS = [0, 2, 3, 4];
const file = (home: string) => join(home, ".kaizen", "onboarding.json");
const OUTCOMES = ["done", "skipped", "dismissed", null];

export function readOnboarding(home: string): Saved | null {
  try {
    const d = JSON.parse(readFileSync(file(home), "utf8"));
    // A file from before the five steps (no `v`) held an index into four: agent, look, notifications, phone.
    const at = Number.isInteger(d?.step) ? (d.v === 2 ? d.step : (OLD_STEPS[d.step] ?? 0)) : 0;
    const step = Math.max(0, Math.min(STEPS - 1, at));
    return { step, outcome: OUTCOMES.includes(d?.outcome) ? d.outcome : null };
  } catch {
    return null;
  }
}

// What the page does: `show` opens the flow now, `resume` offers to continue it. A board that already
// has a project is a board someone set up, so it never shows; nor does a finished or dismissed one.
export function onboardingView(home: string, projects: number) {
  const s = readOnboarding(home);
  const none = { show: false, resume: false, step: 0, total: STEPS };
  if (s?.outcome === "done" || s?.outcome === "dismissed") return none;
  if (projects > 0) return none;
  if (!s) return { ...none, show: true };
  if (s.outcome === "skipped" || s.step > 0) return { ...none, resume: true, step: s.step };
  return { ...none, show: true };
}

// A page's progress: a step reached, an outcome, or both. Anything else is refused, never stored.
export function writeOnboarding(home: string, body: unknown): Saved | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const cur = readOnboarding(home) ?? { step: 0, outcome: null };
  if ("step" in b && !(Number.isInteger(b.step) && (b.step as number) >= 0 && (b.step as number) < STEPS)) return { error: "bad step" };
  if ("outcome" in b && !OUTCOMES.includes(b.outcome as Outcome)) return { error: "bad outcome" };
  // The furthest step reached is kept: going back a screen, or opening the flow again, does not make setup look not started.
  const next: Saved = { step: "step" in b ? Math.max(cur.step, b.step as number) : cur.step, outcome: "outcome" in b ? (b.outcome as Outcome) : cur.outcome };
  const dir = join(home, ".kaizen");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = file(home) + ".tmp";
  writeFileSync(tmp, JSON.stringify({ ...next, v: 2 }) + "\n");
  renameSync(tmp, file(home));
  return next;
}

// How to install each agent the board can set as its default, for the step that finds none on PATH.
// ponytail: the commands repeat the AGENTS table in install.ts (importing that file runs the installer);
// onboarding.test.ts fails when they drift. Antigravity and Cursor have a download page, not a command.
export function installHelp(win: boolean): Record<string, { command?: string; docs: string }> {
  const npm = (pkg: string) => `npm install -g ${pkg}`;
  return {
    claude: { command: win ? "irm https://claude.ai/install.ps1 | iex" : "curl -fsSL https://claude.ai/install.sh | bash", docs: "https://docs.claude.com/en/docs/claude-code" },
    codex: { command: npm("@openai/codex"), docs: "https://github.com/openai/codex" },
    agy: { docs: "https://antigravity.google" },
    opencode: { command: win ? npm("opencode-ai") : "curl -fsSL https://opencode.ai/install | bash", docs: "https://opencode.ai" },
    gemini: { command: npm("@google/gemini-cli"), docs: "https://github.com/google-gemini/gemini-cli" },
  };
}
