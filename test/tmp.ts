// Preloaded by `bun test`: every scratch dir a test (or a program it spawns) makes under the
// temp dir lands in one folder for this run, removed when the run exits. Tests that never
// clean up after themselves used to leave tens of thousands of folders in /tmp.
import { mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "bun:test";

// The real path: macOS's /var is a link and Windows hands out 8.3 names, and code under test
// resolves paths, so an unresolved root makes every comparison with it fail there.
const root = realpathSync.native(tmpdir());
// A run killed mid-way (ctrl-c, crash) never reaches afterAll: the next run removes its folder,
// named after its pid, once that process is gone.
const alive = (pid: number) => {
  try {
    return process.kill(pid, 0), true;
  } catch (e: any) {
    return e.code === "EPERM";
  }
};
for (const f of readdirSync(root)) {
  const pid = Number(/^kz-test-(\d+)-/.exec(f)?.[1]);
  if (pid && !alive(pid)) rmSync(join(root, f), { recursive: true, force: true });
}
const dir = mkdtempSync(join(root, `kz-test-${process.pid}-`));
process.env.TMPDIR = process.env.TMP = process.env.TEMP = dir;
// A preload's afterAll runs once, after every file; bun test does not fire "exit" for it.
// Windows can hold a file a moment after its process ends; a leftover folder is swept by the next run.
afterAll(() => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* next run */ } });
