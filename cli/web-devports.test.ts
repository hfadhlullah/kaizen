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
