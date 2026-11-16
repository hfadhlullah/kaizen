import { test, expect } from "bun:test";
import { parseClaudeCatalog, parseCodexCache, parseGemini, parseAgy, parseOpencode } from "./models.ts";

test("Claude catalog: newest file wins, hidden and deprecated models are left out", () => {
  const f = (at: number, ids: any[]) => JSON.stringify({ fetchedAt: at, catalog: { config: { models: ids } } });
  const rows = parseClaudeCatalog([f(1, [{ id: "claude-old", name: "Old" }]), f(2, [{ id: "claude-opus-5-5", name: "Opus 5.5" }, { id: "x", name: "X", hidden: true }, { id: "y", name: "Y", deprecated: true }]), "not json"]);
  expect(rows).toEqual([{ id: "claude-opus-5-5", name: "Opus 5.5" }]);
});
test("Codex cache: only listed models", () => {
  const t = JSON.stringify({ models: [{ slug: "gpt-6-luna", display_name: "GPT-6-Luna", visibility: "list" }, { slug: "codex-auto-review", visibility: "hide" }] });
  expect(parseCodexCache(t)).toEqual([{ id: "gpt-6-luna", name: "GPT-6-Luna" }]);
  expect(parseCodexCache("nope")).toEqual([]);
});
test("Gemini, Antigravity and OpenCode lists", () => {
  expect(parseGemini("Available Gemini Models:\n\nauto (Auto)\n  Description: x\n\ngemini-3.5-flash (gemini-3.5-flash)\n  Context limit: 1\n")).toEqual([{ id: "auto", name: "Auto" }, { id: "gemini-3.5-flash", name: "gemini-3.5-flash" }]);
  expect(parseAgy("Fetching available models...\nclaude-opus-5-5-high\tClaude Opus 5.5 (High)\n")).toEqual([{ id: "claude-opus-5-5-high", name: "Claude Opus 5.5 (High)" }]);
  expect(parseOpencode("opencode/big-pickle\nnoise line\n")).toEqual([{ id: "opencode/big-pickle", name: "opencode/big-pickle" }]);
});
