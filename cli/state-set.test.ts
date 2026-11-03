// `kaizen state`: the one writer for a run's state.json (spec.md, Stage 0).
import { test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const script = join(dirname(import.meta.path), "install.ts");
const roots: string[] = [];
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

const before = '{"id":"r1","mode":"approve","runner":"lite","agent":"claude","track":"code","stage":"plan","awaiting":"approvals.plan","iteration":0,"updated":"2026-01-01T00:00:00Z"}';
function project() {
  const root = mkdtempSync(join(tmpdir(), "kz-state-")); roots.push(root);
  const dir = join(root, "p"), home = join(root, "home");
  mkdirSync(join(dir, ".kaizen", "runs", "r1"), { recursive: true }); mkdirSync(home);
  const file = join(dir, ".kaizen", "runs", "r1", "state.json");
  writeFileSync(file, before);
  const kz = (...a: string[]) => {
    const p = Bun.spawnSync([process.execPath, script, "state", ...a], { cwd: dir, env: { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home } });
    return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
  };
  return { file, kz, read: () => readFileSync(file, "utf8") };
}

test("a legal write sets the keys, refreshes updated, and keeps two-space JSON", () => {
  const p = project();
  expect(p.kz("r1", "stage=build", "awaiting=null", "iteration=1").code).toBe(0);
  const s = JSON.parse(p.read());
  expect(s).toMatchObject({ stage: "build", awaiting: null, iteration: 1, track: "code" });
  expect(s.updated).not.toBe("2026-01-01T00:00:00Z");
  expect(p.read()).toBe(JSON.stringify(s, null, 2) + "\n");
});

test("a word no board knows is refused and the file is unchanged", () => {
  const p = project();
  for (const bad of ["stage=building", "stage=done", "awaiting=approval", "iteration=one", "updated=x", "nokey"]) {
    const r = p.kz("r1", bad);
    expect(r.code).toBe(1);
    expect(p.read()).toBe(before);
  }
  expect(p.kz("r1", "stage=done").out).toContain("kaizen done");
});

test("a missing run or no pairs fails clearly", () => {
  const p = project();
  expect(p.kz("nope", "stage=build").out).toContain("no run nope");
  expect(p.kz("r1").out).toContain("nothing to set");
  expect(p.kz().code).toBe(1);
});
