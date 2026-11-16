import { expect, test } from "bun:test";
import { agentGroups, ASK, COPY, defaultPick, FLOW, missingPick, NAMES, next, offerText, openFlow, pickPreset, STEP, useOnboarding, type Cfg } from "./onboarding.ts";

const cfg = (o: Partial<Cfg> = {}): Cfg => ({
  show: true,
  resume: false,
  step: 0,
  total: 5,
  default: "",
  preset: "medium",
  installed: ["codex"],
  agents: [
    { cmd: "claude", name: "Claude" },
    { cmd: "codex", name: "Codex" },
    { cmd: "aider", name: "Aider" },
  ],
  install: { claude: { command: "npm i -g x", docs: "https://x.test" } },
  ...o,
});

test("only the tools agent.default accepts are offered, found ones first", () => {
  const g = agentGroups(cfg());
  expect(g.detected.map((a) => a.cmd)).toEqual(["codex"]);
  expect(g.rest.map((a) => a.cmd)).toEqual(["claude"]);
  expect(g.all.map((a) => a.cmd)).toEqual(["claude", "codex"]);
});

test("the agent picked at the start: the saved default when it is installed, else the first one found, else none", () => {
  expect(defaultPick(cfg({ default: "codex" }))).toBe("codex");
  expect(defaultPick(cfg({ default: "claude" }))).toBe("codex"); // saved but not installed: never ticked
  expect(defaultPick(cfg({ default: "claude", installed: ["claude", "codex"] }))).toBe("claude");
  expect(defaultPick(cfg({ default: "aider" }))).toBe("codex");
  expect(defaultPick(cfg({ installed: [] }))).toBe("");
  expect(defaultPick(cfg({ default: "claude", installed: [] }))).toBe(""); // a machine with no agent: nothing ticked
});

test("a picked agent that is not installed shows how to install it", () => {
  expect(missingPick(cfg(), "codex")).toBe(null);
  expect(missingPick(cfg(), "claude")?.how?.command).toBe("npm i -g x");
  expect(missingPick(cfg(), "claude")?.agent.name).toBe("Claude");
});

test("the continue popup says where the person was", () => {
  expect(offerText({ step: 0, total: 5 })).toContain("skipped");
  expect(offerText({ step: 2, total: 5 })).toContain("step 3 of 5");
  expect(offerText({ step: 4, total: 5 })).toBe("One step left: add your first project.");
});

test("five steps in order, and the how-it-works picture names plan, approval, build and review", () => {
  expect(COPY.length).toBe(5); expect(NAMES.length).toBe(5);
  expect(COPY[STEP.works]!.title).toBe("How kaizen works");
  expect(COPY[STEP.ask]!.title).toBe("How much should kaizen ask you?");
  expect(COPY[STEP.phone]!.sub).toMatch(/^Optional\./);
  expect(FLOW.map((f) => f.name)).toEqual(["ask", "plan", "approve", "build", "review"]);
  expect(FLOW.filter((f) => f.you).map((f) => f.name)).toEqual(["ask", "approve"]); // where you decide
  expect(ASK.map((a) => a.id)).toEqual(["low", "medium", "ultra"]);                 // the presets' own names
  for (const w of ["full", "lite", "subagent", "inline"]) expect(JSON.stringify([COPY, ASK])).not.toContain(w);
});

// What the flow sends: the board's answers are not needed, only the calls it makes.
async function run(go: () => Promise<void> | void) {
  const calls: [string, any][] = [], real = globalThis.fetch;
  globalThis.fetch = (async (u: any, init?: any) => (calls.push([String(u), init?.body ? JSON.parse(init.body) : undefined]), new Response("{}"))) as any;
  try { await go(); } finally { globalThis.fetch = real; }
  return calls;
}
const start = (at: number, o: Partial<Cfg> = {}) => { useOnboarding.setState({ cfg: cfg(o), flow: null }); openFlow(at); };

test("the preset is saved only when the user picked a different one", async () => {
  start(STEP.ask);
  expect(useOnboarding.getState().flow!.preset).toBe("medium"); // starts on the board's own
  expect(await run(() => next())).toEqual([["/onboarding", { step: STEP.look }]]); // nothing touched: no settings call
  start(STEP.ask); pickPreset("ultra");
  const calls = await run(() => next());
  expect(calls[0]).toEqual(["/settings", { key: "preset", value: "ultra" }]);
  expect(useOnboarding.getState().cfg!.preset).toBe("ultra");
});

test("the last step opens Add a project without marking setup done, so a cancelled dialog leaves it waiting", async () => {
  start(STEP.phone);
  const calls = await run(() => next());
  expect(calls).toEqual([["/onboarding", { step: STEP.phone }]]);
  expect(JSON.stringify(calls)).not.toContain("done");
  expect(useOnboarding.getState().flow).toBeNull(); // the panel closed; the add dialog took over
});

test("custom settings are never replaced unless the user picks a card", async () => {
  start(STEP.ask, { preset: "custom" });
  expect(useOnboarding.getState().flow!.preset).toBe(""); // nothing ticked
  expect(await run(() => next())).toEqual([["/onboarding", { step: STEP.look }]]); // Continue without a pick: no settings call
  start(STEP.ask, { preset: "custom" }); pickPreset("low");
  expect((await run(() => next()))[0]).toEqual(["/settings", { key: "preset", value: "low" }]);
});
