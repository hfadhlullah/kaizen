// Live eval: a cold planner reads the real contract and frames each sample request.
// Costs real tokens. Usage: bun evals/run-planner.ts [model]. Writes no files.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const model = process.argv[2] ?? "opus";
const root = join(import.meta.dir, "..");
const cases: { request: string; want: string }[] = JSON.parse(readFileSync(join(import.meta.dir, "roadmap-cases.json"), "utf8"));

async function plan(request: string) {
  const prompt = `Act as the kaizen planner. Read ${root}/skills/kaizen/spec.md and ${root}/skills/kaizen/spec-plan.md. Assume discovery answers are the sensible default. Write no files. Print only the plan's Framing, and its ## Roadmap section if the contract calls for one. If it does not, print the line: NO ROADMAP.\n\nRequest: ${request}`;
  const p = Bun.spawn(["claude", "-p", prompt, "--model", model, "--max-turns", "6", "--allowedTools", "Read", "--add-dir", root], { cwd: import.meta.dir, stdin: "ignore", stdout: "pipe", stderr: "ignore" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out;
}

let passed = 0;
await Promise.all(cases.map(async (c) => {
  const out = await plan(c.request);
  const got = /^#*\s*Roadmap|## Roadmap/m.test(out) && !/NO ROADMAP/.test(out) ? "ROADMAP" : /NO ROADMAP/.test(out) ? "ONE" : "UNCLEAR";
  if (got === c.want) passed++;
  console.log(`${got === c.want ? "PASS" : "FAIL"} want=${c.want} got=${got} | ${c.request}\n${out.split("\n").filter((l) => /^\d+\./.test(l)).slice(0, 4).join("\n")}\n`);
}));
console.log(`${passed}/${cases.length} passed`);
process.exit(passed === cases.length ? 0 : 1);
