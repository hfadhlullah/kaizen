import { expect, test } from "bun:test";
import { agentGroups, defaultPick, missingPick, offerText, type Cfg } from "./onboarding.ts";

const cfg = (o: Partial<Cfg> = {}): Cfg => ({
  show: true,
  resume: false,
  step: 0,
  total: 4,
  default: "",
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

test("the agent picked at the start: the saved default, else the first one found, else none", () => {
  expect(defaultPick(cfg({ default: "claude" }))).toBe("claude");
  expect(defaultPick(cfg({ default: "aider" }))).toBe("codex");
  expect(defaultPick(cfg({ installed: [] }))).toBe("");
});

test("a picked agent that is not installed shows how to install it", () => {
  expect(missingPick(cfg(), "codex")).toBe(null);
  expect(missingPick(cfg(), "claude")?.how?.command).toBe("npm i -g x");
  expect(missingPick(cfg(), "claude")?.agent.name).toBe("Claude");
});

test("the continue popup says where the person was", () => {
  expect(offerText({ step: 0, total: 4 })).toContain("skipped");
  expect(offerText({ step: 2, total: 4 })).toContain("step 3 of 4");
});
