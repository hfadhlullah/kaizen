// Live eval of the split rule: does it keep small work as one run and split big projects?
// Fast but shallow: it asks the rule directly. evals/run-planner.ts drives the real contract.
// Costs real tokens. Usage: bun evals/run-roadmap.ts [model]. Tests the rule in this checkout.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const model = process.argv[2] ?? "opus";
const RUNS = 3;
const root = join(import.meta.dir, "..");
const spec = readFileSync(join(root, "skills/kaizen/spec-plan.md"), "utf8");
const rule = spec.slice(spec.indexOf("**One run is the default."), spec.indexOf("- **`## Discovery`**"));
const cases: { request: string; want: string }[] = JSON.parse(readFileSync(join(import.meta.dir, "roadmap-cases.json"), "utf8"));

async function ask(request: string) {
  const prompt = `You are a planner. Apply this rule and nothing else:\n\n${rule}\n\nRequest: ${request}\n\nReply with exactly one word: ONE or ROADMAP.`;
  const p = Bun.spawn(["claude", "-p", prompt, "--model", model, "--max-turns", "1"], { cwd: import.meta.dir, stdin: "ignore", stdout: "pipe", stderr: "ignore" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return /ROADMAP/.test(out) ? "ROADMAP" : /\bONE\b/.test(out) ? "ONE" : `? ${out.slice(0, 60)}`;
}

let passed = 0, total = 0;
for (const c of cases) {
  const got = await Promise.all(Array.from({ length: RUNS }, () => ask(c.request)));
  for (const g of got) { total++; if (g === c.want) passed++; }
  console.log(`${got.every((g) => g === c.want) ? "PASS" : "FAIL"} want=${c.want} got=${got.join(",")} | ${c.request}`);
}
console.log(`${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
