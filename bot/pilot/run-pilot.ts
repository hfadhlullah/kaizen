// The local pilot, end to end on this machine's Docker, through the same approve path
// the page uses. Prints one JSON summary; the report is written from it.
// Usage: bun pilot/run-pilot.ts [tasks=50] [out.json]
// Uses a scratch database and data folder (left in the OS temp folder for evidence); never the real bot.db.
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, loadavg } from "node:os";
import { openStore } from "../src/db";
import { createApp } from "../src/server";
import { docker, runTask, sweep, type Docker } from "../src/computer";

const N = Number(process.argv[2] ?? 50);
const root = mkdtempSync(join(tmpdir(), "kz-pilot-"));
const env = { PROVIDER: "anthropic", MODEL: "m", ANTHROPIC_API_KEY: "unused" };
const URLS = [["http://fixture.test/"], ["https://example.com/"], ["http://fixture.test/", "https://example.com/"], ["https://example.org/", "https://www.example.com/", "http://fixture.test/"]];

const leftovers = async () => {
  const c = await docker(["ps", "-aq", "--filter", "label=kaizen.sandbox=1"]);
  const n = await docker(["network", "ls", "-q", "--filter", "label=kaizen.sandbox=1"]);
  return (new TextDecoder().decode(c.out) + new TextDecoder().decode(n.out)).split("\n").filter(Boolean).length;
};
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] ?? 0; };

async function app(o: { docker?: Docker; taskMs?: number } = {}) {
  const store = openStore(":memory:");
  const tech = store.createBot("tech", "Tech Lead");
  const a = createApp({ store, env, watch: false, dataDir: root, computer: o });
  const post = (path: string, body: unknown) => a.handle(new Request(`http://127.0.0.1:7430${path}`, { method: "POST", headers: { host: "127.0.0.1:7430", "content-type": "application/json" }, body: JSON.stringify(body) }));
  await post("/settings", { computerBot: tech.id, computerEnabled: true });
  const card = (urls: string[]) => store.addAction(tech.id, { kind: "computer", body: { urls, purpose: "pilot" }, summary: "pilot" });
  const done = async () => { while (a.computerRunning()) await Bun.sleep(50); };
  return { store, a, post, card, done };
}

const out: Record<string, unknown> = { started: new Date().toISOString(), host: { load: loadavg() } };
if (await leftovers()) throw new Error("labelled sandbox resources exist before the pilot; run the sweeper or clean them first");

// 1. Isolation probes.
const probe = await runTask({ id: 900000, urls: ["https://example.com/"], dir: join(root, "artifacts"), logDir: join(root, "computer-logs"), probes: true, onState: () => {} });
const probeText = readFileSync(join(root, "computer-logs", "900000-probes.txt"), "utf8");
out.probes = { ok: probe.ok, passed: probeText.split("\n").filter((l) => l.startsWith("PASS")).length, failed: probeText.split("\n").filter((l) => l.startsWith("FAIL")), clean: probe.clean };

// 2. N tasks through approve.
const { store, post, card, done } = await app();
const tasks: any[] = [];
for (let i = 0; i < N; i++) {
  const c = card(URLS[i % URLS.length]!);
  const r = await post(`/actions/${c.id}`, { op: "approve" });
  if (r.status !== 200) { tasks.push({ ok: false, error: `approve ${r.status}: ${await r.text()}` }); continue; }
  await done();
  const x = store.action(c.id)!, s = JSON.parse(x.snapshot!);
  tasks.push({ ok: x.status === "done", error: x.status === "done" ? null : x.result, urls: URLS[i % URLS.length]!.length, ms: s.ms, usage: s.usage, proxy: s.proxy, clean: s.clean, files: (s.artifacts ?? []).length, left: await leftovers() });
}
const ok = tasks.filter((t) => t.ok);
out.tasks = {
  n: N, ok: ok.length, rate: ok.length / N, errors: tasks.filter((t) => !t.ok).map((t) => t.error),
  start_ms: { p50: pct(ok.map((t) => t.ms.start), 50), p95: pct(ok.map((t) => t.ms.start), 95) },
  task_ms: { p50: pct(ok.map((t) => t.ms.task), 50), p95: pct(ok.map((t) => t.ms.task), 95) },
  export_ms: { p50: pct(ok.map((t) => t.ms.export), 50), p95: pct(ok.map((t) => t.ms.export), 95) },
  total_ms: { p50: pct(ok.map((t) => t.ms.total), 50), p95: pct(ok.map((t) => t.ms.total), 95) },
  mem_peak_mb_max: Math.max(...ok.map((t) => t.usage?.memPeakMb ?? 0)), cpu_sec_max: Math.max(...ok.map((t) => t.usage?.cpuSec ?? 0)),
  proxy_allowed: tasks.reduce((n, t) => n + (t.proxy?.allowed ?? 0), 0), proxy_denied: tasks.reduce((n, t) => n + (t.proxy?.denied ?? 0), 0),
  not_clean: tasks.filter((t) => t.clean === false).length, leftovers_after_any_task: Math.max(...tasks.map((t) => t.left ?? 0)),
};
// Every allowed line in every proxy log is a GET or HEAD.
let writes = 0;
for (const x of store.actions()) {
  try { for (const l of readFileSync(join(root, "computer-logs", `${x.id}.jsonl`), "utf8").split("\n").filter(Boolean)) { const j = JSON.parse(l); if (j.decision === "ALLOW" && j.method !== "GET" && j.method !== "HEAD") writes++; } } catch { /* no log */ }
}
out.non_get_allowed = writes;

// 3. Every other exit path, each followed by a leftover count.
const paths: Record<string, unknown> = {};
{ // cancel
  const { store, post, card, done } = await app();
  const c = card(["https://example.com/", "http://fixture.test/", "https://example.org/"]);
  await post(`/actions/${c.id}`, { op: "approve" });
  while (JSON.parse(store.action(c.id)!.snapshot!).state !== "running") await Bun.sleep(20);
  await post(`/actions/${c.id}`, { op: "cancel" });
  await done();
  paths.cancel = { status: store.action(c.id)!.status, result: store.action(c.id)!.result, left: await leftovers() };
}
{ // timeout
  const { store, post, card, done } = await app({ taskMs: 300 });
  const c = card(["https://example.com/"]);
  await post(`/actions/${c.id}`, { op: "approve" });
  await done();
  paths.timeout = { status: store.action(c.id)!.status, result: store.action(c.id)!.result, left: await leftovers() };
}
{ // a failing task: the real containers, with the task's exec answering an error
  const failing: Docker = (args, o) => args[0] === "exec" && args[2] === "/opt/task.sh"
    ? Promise.resolve({ code: 1, out: new Uint8Array(), err: "simulated task failure", truncated: false }) : docker(args, o);
  const { store, post, card, done } = await app({ docker: failing });
  const c = card(["https://example.com/"]);
  await post(`/actions/${c.id}`, { op: "approve" });
  await done();
  paths.error = { status: store.action(c.id)!.status, result: store.action(c.id)!.result, left: await leftovers() };
}
{ // the bot server killed mid-task (SIGKILL: no finally runs), then a restart's sweep
  const child = Bun.spawn(["bun", "-e", `import { runTask } from ${JSON.stringify(join(import.meta.dir, "../src/computer.ts"))};
    await runTask({ id: 900001, urls: ["https://example.com/","http://fixture.test/","https://example.org/"], dir: ${JSON.stringify(join(root, "artifacts"))}, logDir: ${JSON.stringify(join(root, "computer-logs"))}, onState: (s) => console.log(s) });`], { stdout: "pipe" });
  const reader = child.stdout.getReader();
  let seen = "";
  while (!seen.includes("running")) { const { value, done } = await reader.read(); if (done) break; seen += new TextDecoder().decode(value); }
  child.kill(9);
  await child.exited;
  const before = await leftovers();
  const swept = await sweep(() => false);
  paths.killed = { left_after_kill: before, swept: swept.length, left: await leftovers() };
}
out.exit_paths = paths;
out.host = { ...(out.host as object), load_after: loadavg() };
out.finished = new Date().toISOString();
const text = JSON.stringify(out, null, 1);
console.log(text);
if (process.argv[3]) writeFileSync(process.argv[3], text);
