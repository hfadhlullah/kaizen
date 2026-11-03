// An unknown first word is an error, never a reinstall (cli/install.ts, COMMANDS).
import { test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const script = join(dirname(import.meta.path), "install.ts");
const roots: string[] = [];
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

function scratch() {
  const root = mkdtempSync(join(tmpdir(), "kz-unknown-")); roots.push(root);
  const home = join(root, "home"), cwd = join(root, "p");
  mkdirSync(home); mkdirSync(cwd);
  const kz = (...a: string[]) => {
    const p = Bun.spawnSync([process.execPath, script, ...a], { cwd, env: { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home }, stdin: "ignore" });
    return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
  };
  return { home, cwd, kz };
}

test("an unknown first word exits 1 with an error and writes nothing", () => {
  const s = scratch();
  for (const w of ["stauts", "staus", "install", "status"]) {
    const r = s.kz(w, "--yes");
    expect(r.code).toBe(1);
    expect(r.out).toContain(`unknown command "${w}"`);
  }
  // Bun and mise may create their own caches (.bun, .local) in HOME; kaizen's folders must not appear.
  expect(readdirSync(s.home).filter((f) => [".kaizen", ".claude", ".codex", ".gemini", "kaizen"].includes(f))).toEqual([]);
  expect(readdirSync(s.cwd)).toEqual([]);
});

test("real commands and flags still work", () => {
  const s = scratch();
  expect(s.kz("version").out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  expect(s.kz("--version").out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  expect(s.kz("help").code).toBe(0);
  expect(s.kz("help").out).toContain("commands:");
  // `kaizen init` (README) reaches the installer as it always did, not the error.
  expect(s.kz("init").out).not.toContain("unknown command");
  const r = s.kz("stats");
  expect(r.out).not.toContain("unknown command");
});

test("every word install.ts dispatches on is in COMMANDS", () => {
  const src = readFileSync(script, "utf8");
  const list = JSON.parse("[" + /const COMMANDS = \[([^\]]+)\]/.exec(src)![1]!.replace(/\s+/g, " ") + "]") as string[];
  const used = new Set<string>();
  for (const m of src.matchAll(/Bun\.argv\[2\] === "([a-z][a-z-]*)"|args\.has\("([a-z][a-z-]*)"\)/g)) used.add((m[1] ?? m[2])!);
  expect([...used].filter((w) => !list.includes(w))).toEqual([]);
});
