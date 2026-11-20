// kaizen's own look at a skill before it installs: Cisco AI Defense's open-source skill-scanner
// (github.com/cisco-ai-defense/skill-scanner, Apache-2.0) on each skill folder, pinned, run through `uvx` so nothing
// is installed into the user's Python. A `skill-scanner` already on PATH is used as is. Rules only, no LLM judge: the
// scanner's own README says rules alone catch a small share, so a clean scan is a weak signal and the page says so.
import { run as runCmd, type Run } from "./rea.ts";

export const SCANNER_PKG = "cisco-ai-skill-scanner==2.3.2";
const RANK: Record<string, number> = { SAFE: 0, INFO: 1, LOW: 2, MEDIUM: 3, HIGH: 4, CRITICAL: 5 };
export type Finding = { severity: string; title: string; file: string };
export type Scan =
  | { ran: true; worst: string; careful: boolean; findings: Finding[]; count: number }
  | { ran: false; careful: boolean; why: string };

type Which = (bin: string) => string | null;
const which: Which = (b) => Bun.which(b, { PATH: process.env.PATH });

// The command that runs the scanner here, or null when neither it nor uvx is on the computer.
export function scannerArgv(w: Which = which): string[] | null {
  const own = w("skill-scanner");
  if (own) return [own];
  const uvx = w("uvx");
  return uvx ? [uvx, "--from", SCANNER_PKG, "skill-scanner"] : null;
}

// One folder's JSON report, read defensively.
export function readReport(out: string): { worst: string; findings: Finding[] } | null {
  const at = out.indexOf("{");
  let j: any;
  try { j = JSON.parse(at < 0 ? out : out.slice(at)); } catch { return null; }
  if (!j || typeof j !== "object" || !Array.isArray(j.findings)) return null;
  const findings = j.findings.map((f: any) => ({
    severity: String(f?.severity ?? "").toUpperCase(),
    title: String(f?.title ?? f?.rule_id ?? "finding").slice(0, 160),
    file: String(f?.file_path ?? "").slice(0, 200),
  }));
  const worst = findings.reduce((w: string, f: Finding) => ((RANK[f.severity] ?? 0) > (RANK[w] ?? 0) ? f.severity : w), String(j.max_severity ?? "SAFE").toUpperCase());
  return { worst, findings };
}

// Scans every folder; a finding at MEDIUM or above, or any folder that could not be scanned, makes the install
// careful (the second, ticked confirm). No scanner on the computer leaves the decision to the audits.
export async function scanFolders(dirs: string[], sh: Run = runCmd, w: Which = which): Promise<Scan> {
  if (!dirs.length) return { ran: false, careful: false, why: "no skills inside to scan" };
  const base = scannerArgv(w);
  if (!base) return { ran: false, careful: false, why: "the scan needs uv (or skill-scanner) on this computer" };
  const all: Finding[] = [];
  let worst = "SAFE";
  for (const dir of dirs.slice(0, 50)) {
    const r = await sh([...base, "scan", dir, "--format", "json"], 3 * 60_000);
    const rep = readReport(r.out);
    if (!rep) return { ran: false, careful: true, why: "the scan did not finish: " + (r.err || r.out || "").trim().split("\n").filter(Boolean).slice(-1)[0]?.slice(0, 200) };
    all.push(...rep.findings);
    if ((RANK[rep.worst] ?? 0) > (RANK[worst] ?? 0)) worst = rep.worst;
  }
  all.sort((a, b) => (RANK[b.severity] ?? 0) - (RANK[a.severity] ?? 0));
  return { ran: true, worst, careful: (RANK[worst] ?? 0) >= RANK.MEDIUM!, findings: all.slice(0, 10), count: all.length };
}
