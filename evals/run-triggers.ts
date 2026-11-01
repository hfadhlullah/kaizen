// Live trigger eval: does each prompt fire the right skill? Costs real tokens.
// Usage: bun evals/run-triggers.ts [model]. It reads the installed skills, not this checkout's.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const model = process.argv[2] ?? "haiku";
const cases: { prompt: string; expect: string | null }[] = JSON.parse(readFileSync(join(import.meta.dir, "triggers.json"), "utf8")).filter((c: { prompt: string }) => new RegExp(process.env.EVAL_MATCH ?? "").test(c.prompt));

async function fired(prompt: string) {
  const cwd = mkdtempSync(join(tmpdir(), "kaizen-eval-"));
  // Sample files, so a prompt that names a project or a file is a fair test.
  writeFileSync(join(cwd, "package.json"), '{"name":"sample-app","scripts":{"start":"node index.js"}}');
  writeFileSync(join(cwd, "index.js"), "console.log('app')\n");
  writeFileSync(join(cwd, "README.md"), "# Sample app\n\nThis is teh app.\n");
  writeFileSync(join(cwd, "manuscript.docx"), "");
  writeFileSync(join(cwd, "report.pptx"), "");
  const p = Bun.spawn(["claude", "-p", prompt, "--model", model, "--max-turns", "2", "--output-format", "stream-json", "--verbose"], { cwd, stdout: "pipe", stderr: "ignore" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  rmSync(cwd, { recursive: true, force: true });
  return [...out.matchAll(/"name":"Skill","input":\{"skill":"([^"]+)"/g)].map((m) => m[1]!);
}

const pass = (want: string | null, got: string[]) =>
  want === null ? !got.some((s) => s.startsWith("kaizen")) : want.startsWith("not:") ? !got.includes(want.slice(4)) : got.includes(want);

const RUNS = 3; // one run can miss by chance
const results: boolean[] = [];
const jobs = cases.flatMap((c) => Array.from({ length: RUNS }, () => c));
for (let i = 0; i < jobs.length; i += 4) {
  await Promise.all(jobs.slice(i, i + 4).map(async (c) => {
    const got = await fired(c.prompt);
    const ok = pass(c.expect, got);
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"} want=${c.expect} got=${got.join(",") || "none"} | ${c.prompt}`);
  }));
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
