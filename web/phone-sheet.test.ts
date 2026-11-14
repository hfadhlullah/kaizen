import { expect, test } from "bun:test";
import { agentMark } from "./lib/phone-sheet.ts";

test("an agent shows its own mark when the sprite has one, else the generic mark", () => {
  const has = (id: string) => id === "i-codex";
  expect(agentMark("Codex", has)).toBe("codex");
  expect(agentMark("someother", has)).toBe("ai");
  expect(agentMark("", has)).toBe("ai");
});
