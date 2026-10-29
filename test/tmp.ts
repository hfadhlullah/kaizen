// Preloaded by `bun test`: every scratch dir a test (or a program it spawns) makes under the
// temp dir lands in one folder for this run, removed when the run exits. Tests that never
// clean up after themselves used to leave tens of thousands of folders in /tmp.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "bun:test";

const dir = mkdtempSync(join(tmpdir(), "kz-test-"));
process.env.TMPDIR = process.env.TMP = process.env.TEMP = dir;
// A preload's afterAll runs once, after every file; bun test does not fire "exit" for it.
afterAll(() => rmSync(dir, { recursive: true, force: true }));
