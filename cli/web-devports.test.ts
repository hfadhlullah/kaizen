import { expect, test } from "bun:test";
import { devPorts } from "./web.ts";

test("devPorts keeps only ports whose process works inside the workspace", () => {
  const ss = [
    'LISTEN 0 4096 127.0.0.1:8000 0.0.0.0:* users:(("php",pid=1,fd=7))',
    'LISTEN 0 4096 127.0.0.1:8123 0.0.0.0:* users:(("php",pid=2,fd=7))',
    'LISTEN 0 511 [::1]:5173 [::]:* users:(("node",pid=3,fd=22))',
    'LISTEN 0 511 127.0.0.1:9000 0.0.0.0:* users:(("node",pid=4,fd=22))',
  ].join("\n");
  const cwd = { "1": "/p/other/public", "2": "/p/app/public", "3": "/p/app", "4": "/p/app-old" };
  expect(devPorts(ss, (pid) => cwd[pid], "/p/app")).toEqual([5173, 8123]);
});

test("devPorts never offers an agent's own port as the workspace's app", () => {
  const ss = [
    'LISTEN 0 512 127.0.0.1:33017 0.0.0.0:* users:(("claude",pid=5,fd=24))',
    'LISTEN 0 511 [::1]:5173 [::]:* users:(("node",pid=6,fd=22))',
  ].join("\n");
  expect(devPorts(ss, () => "/p/app", "/p/app", ["claude", "codex"])).toEqual([5173]);
});

test("devCommand runs the folder's dev script, else start, with the lockfile's package manager", async () => {
  const { devCommand } = await import("./web.ts");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const d = mkdtempSync(join(tmpdir(), "kz-dev-"));
  expect(devCommand(d)).toBeNull();
  writeFileSync(join(d, "package.json"), JSON.stringify({ scripts: { build: "x" } }));
  expect(devCommand(d)).toBeNull();
  writeFileSync(join(d, "package.json"), JSON.stringify({ scripts: { start: "node s", dev: "vite" } }));
  expect(devCommand(d)).toEqual(["npm", "run", "dev"]);
  writeFileSync(join(d, "pnpm-lock.yaml"), "");
  expect(devCommand(d)).toEqual(["pnpm", "run", "dev"]);
  writeFileSync(join(d, "bun.lock"), "");
  writeFileSync(join(d, "package.json"), JSON.stringify({ scripts: { start: "node s" } }));
  expect(devCommand(d)).toEqual(["bun", "run", "start"]);
});

// Issue #90: a route that threw reached the page as Bun's HTML 500, shown only as "That did not work".
test("routeError answers a thrown route as JSON with its message", async () => {
  const { routeError } = await import("./web.ts");
  const log = console.error;
  console.error = () => {};
  try {
    const r = routeError(new Error("ENOENT: no such file or directory, posix_spawn 'bun'"));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "ENOENT: no such file or directory, posix_spawn 'bun'" });
  } finally { console.error = log; }
});

// Issue #90 follow-up: a board that is a systemd service's own process exits for its unit to restart it after an Update;
// any other board (a terminal's, or one an Update spawned and systemd adopted later) spawns the next board itself.
test("serviceBoard: only a Linux board whose parent at start is systemd, inside a service", async () => {
  const { serviceBoard } = await import("./web.ts");
  const unit = { INVOCATION_ID: "abc" };
  expect(serviceBoard("linux", unit, () => "systemd\n")).toBe(true);
  expect(serviceBoard("linux", unit, () => "zsh\n")).toBe(false);
  expect(serviceBoard("linux", {}, () => "systemd\n")).toBe(false);
  expect(serviceBoard("darwin", unit, () => "systemd\n")).toBe(false);
  expect(serviceBoard("linux", unit, () => { throw new Error("no /proc"); })).toBe(false);
});

// Issue #90: runUpgrade lives outside the request handler (the automatic update calls it too), where the handler's `srv`
// does not exist; it threw a ReferenceError after every install, so the board never restarted.
test("runUpgrade uses no name that only the request handler has", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const src = readFileSync(join(import.meta.dir, "web.ts"), "utf8");
  const body = src.slice(src.indexOf("const runUpgrade = async"), src.indexOf("const autoUpd = "));
  expect(body.length).toBeGreaterThan(500);
  expect(body.replace(/\/\/.*$/gm, "")).not.toMatch(/\b(srv|req)\b/);
});
