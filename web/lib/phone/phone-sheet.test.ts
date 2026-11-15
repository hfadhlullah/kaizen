import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENT_MARKS, agentMark } from "./phone-sheet.ts";

test("an agent shows its own mark when the sprite has one, else the generic mark", () => {
  expect(agentMark("Codex")).toBe("codex");
  expect(agentMark("Claude")).toBe("claude");
  expect(agentMark("someother")).toBe("ai");
  expect(agentMark("")).toBe("ai");
});

test("every agent mark named here is a symbol of the sprite, and the sprite has no agent mark that is not named", () => {
  const sprite = readFileSync(join(import.meta.dir, "../../components/shell/sprite.tsx"), "utf8");
  for (const m of AGENT_MARKS) expect(sprite).toContain(`<symbol id="i-${m}"`);
  expect(sprite).toContain('<symbol id="i-ai"'); // the generic mark
});
