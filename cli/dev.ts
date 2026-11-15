#!/usr/bin/env bun
// `bun run dev`: the board with live reload for front-end work. It builds web/dist, starts the board (KAIZEN_DEV=1: pages
// are read from disk on every request and reload themselves), then rebuilds on every change under web/ and tells the open
// pages to reload. A full build takes well under a second.
//   bun run dev [--port 7431] [--project <dir>]     the project defaults to this checkout
import { watch } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = dirname(import.meta.dir);
const arg = (name: string, d: string) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : d; };
const port = arg("--port", "7431");
const project = resolve(arg("--project", process.cwd()));

const build = async () => {
  const t = performance.now();
  const p = Bun.spawn([process.execPath, join(root, "cli", "build-web.ts")], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) { console.error(`\n  build failed\n${err || out}`); return false; }
  console.log(`  built in ${Math.round(performance.now() - t)} ms`);
  return true;
};
const reload = async () => { try { await fetch(`http://127.0.0.1:${port}/__dev/reload`, { method: "POST" }); } catch {} };

if (!(await build())) process.exit(1);
const board = Bun.spawn([process.execPath, join(root, "cli", "install.ts"), "web", "--port", port, "--no-open"], {
  cwd: project, env: { ...process.env, KAIZEN_DEV: "1" }, stdout: "inherit", stderr: "inherit", stdin: "inherit",
});
console.log(`  dev: watching web/ — pages reload after each rebuild`);

// One build at a time; a change during a build runs one more after it.
let busy = false, again = false, timer: ReturnType<typeof setTimeout> | undefined;
const run = async () => {
  if (busy) { again = true; return; }
  busy = true;
  do { again = false; if (await build()) await reload(); } while (again);
  busy = false;
};
const SRC = [join(root, "web"), join(root, "bot", "web", "app")];
const ignored = (f: string) => /(^|[\\/])(dist|checks)[\\/]|\.test\.tsx?$|\.(png|jpg|svg|map)$|~$|\.swp$/.test(f);
for (const dir of SRC)
  watch(dir, { recursive: true }, (_e, f) => {
    if (!f || ignored(String(f))) return;
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });

const stop = () => { board.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await board.exited;
process.exit(0);
