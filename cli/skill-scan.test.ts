import { expect, test } from "bun:test";
import { readReport, scanFolders, scannerArgv, SCANNER_PKG } from "./skill-scan.ts";

// Shapes recorded from cisco-ai-skill-scanner 2.3.2 on 2026-11-20.
const SAFE = JSON.stringify({ skill_name: "pdf", is_safe: true, max_severity: "SAFE", findings_count: 0, findings: [] });
const BAD = JSON.stringify({ skill_name: "bad", is_safe: false, max_severity: "CRITICAL", findings_count: 2, findings: [
  { severity: "LOW", title: "Vague skill description", file_path: "SKILL.md" },
  { severity: "CRITICAL", title: "Credential file read and sent out", file_path: "run.py" },
] });
const LOWONLY = JSON.stringify({ is_safe: true, max_severity: "LOW", findings: [{ severity: "LOW", title: "Vague skill description", file_path: "SKILL.md" }] });
const w = (have: string[]) => (b: string) => (have.includes(b) ? `/bin/${b}` : null);

test("the scanner runs pinned through uvx, or as installed; with neither it says so and decides nothing", async () => {
  expect(scannerArgv(w(["uvx"]))).toEqual(["/bin/uvx", "--from", SCANNER_PKG, "skill-scanner"]);
  expect(scannerArgv(w(["uvx", "skill-scanner"]))).toEqual(["/bin/skill-scanner"]);
  expect(scannerArgv(w([]))).toBeNull();
  const none = await scanFolders(["/x"], async () => ({ ok: true, out: SAFE }), w([]));
  expect(none).toMatchObject({ ran: false, careful: false });
});

test("a finding at medium or above, or a scan that breaks, makes the install careful; low alone does not", async () => {
  const runs: string[][] = [];
  const sh = (out: string) => async (argv: string[]) => { runs.push(argv); return { ok: true, out }; };
  expect(await scanFolders(["/a"], sh(SAFE), w(["uvx"]))).toMatchObject({ ran: true, careful: false, worst: "SAFE", count: 0 });
  expect(runs[0]!.slice(-4)).toEqual(["scan", "/a", "--format", "json"]);
  expect(await scanFolders(["/a"], sh(LOWONLY), w(["uvx"]))).toMatchObject({ ran: true, careful: false, worst: "LOW" });
  const bad = await scanFolders(["/a"], sh(BAD), w(["uvx"]));
  expect(bad).toMatchObject({ ran: true, careful: true, worst: "CRITICAL", count: 2 });
  if (bad.ran) expect(bad.findings[0]!.severity).toBe("CRITICAL"); // worst first
  expect(await scanFolders(["/a"], sh("Traceback: boom"), w(["uvx"]))).toMatchObject({ ran: false, careful: true });
  expect(readReport("noise\n" + SAFE)?.worst).toBe("SAFE");
});
