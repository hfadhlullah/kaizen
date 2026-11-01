// Roadmaps: `.kaizen/roadmaps/<name>.md` holds a project too big for one run, in any
// track. This file only reads them; the main thread writes them (see spec-main.md).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Phase = { n: number; status: "todo" | "doing" | "done" | "blocked"; title: string; goal: string; verify: string; after: number[]; run: string };
export type Roadmap = { name: string; file: string; title: string; phases: Phase[]; decisions: string[] };

const PHASE = /^(\d+)\.\s+\[(todo|doing|done|blocked)\]\s+(.+)$/;

// A phase line: `N. [status] <title> — <goal> — verify: <how> — after: #a, #b — run: <id>`.
export function parsePhase(line: string): Phase | null {
  const m = PHASE.exec(line.trim());
  if (!m) return null;
  const parts = m[3]!.split(" — ").map((p) => p.trim());
  const field = (k: string) => parts.find((p) => p.startsWith(`${k}:`))?.slice(k.length + 1).trim() ?? "";
  const plain = parts.filter((p) => !/^(verify|after|run):/.test(p));
  return { n: Number(m[1]), status: m[2] as Phase["status"], title: plain[0] ?? "", goal: plain[1] ?? "", verify: field("verify"), after: [...field("after").matchAll(/#(\d+)/g)].map((a) => Number(a[1])), run: field("run") };
}

export function parseRoadmap(name: string, file: string, text: string): Roadmap | string {
  const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? name;
  const section = (h: string) => (new RegExp(`^## ${h}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(text)?.[1] ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const phases: Phase[] = [];
  for (const line of section("Phases")) {
    const p = parsePhase(line);
    if (!p) return `${file}: not a phase line: ${line}`;
    phases.push(p);
  }
  if (!phases.length) return `${file}: no phases`;
  const known = new Set(phases.map((p) => p.n));
  if (known.size !== phases.length) return `${file}: two phases share a number`;
  for (const p of phases) for (const a of p.after) if (!known.has(a)) return `${file}: phase ${p.n} is after #${a}, which does not exist`;
  return { name, file, title, phases, decisions: section("Decisions").map((l) => l.replace(/^-\s*/, "")) };
}

export function readRoadmaps(state: string): (Roadmap | string)[] {
  const dir = join(state, "roadmaps");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => parseRoadmap(f.slice(0, -3), join(dir, f), readFileSync(join(dir, f), "utf8")));
}

export const finished = (r: Roadmap) => r.phases.every((p) => p.status === "done");

// A phase in progress comes first, even with a prerequisite undone: its run exists, and
// hiding started work is worse than resuming it out of order. Otherwise the first
// todo whose prerequisites are all done. A blocked phase is never picked.
export function nextPhase(r: Roadmap): Phase | null {
  const done = new Set(r.phases.filter((p) => p.status === "done").map((p) => p.n));
  return r.phases.find((p) => p.status === "doing") ?? r.phases.find((p) => p.status === "todo" && p.after.every((a) => done.has(a))) ?? null;
}

// `kaizen roadmap [list]` and `kaizen roadmap next [name]`. Read-only.
export function roadmapCommand(state: string, verb: string, name?: string): { out: string; code: number } {
  const all = readRoadmaps(state);
  const bad = all.filter((r): r is string => typeof r === "string");
  const good = all.filter((r): r is Roadmap => typeof r !== "string");
  if (verb === "list") {
    if (!all.length) return { out: "no roadmaps", code: 0 };
    const lines = good.flatMap((r) => [`${r.name} — ${r.title}${finished(r) ? " (finished)" : ""}`, ...r.phases.map((p) => `  ${p.n}. [${p.status}] ${p.title}${p.run ? ` (${p.run})` : ""}`)]);
    return { out: [...lines, ...bad].join("\n"), code: bad.length ? 1 : 0 };
  }
  if (verb !== "next") return { out: "kaizen roadmap [list] | next [name]", code: 1 };
  if (name && !good.some((r) => r.name === name)) return { out: bad.find((b) => b.includes(`${name}.md`)) ?? `no roadmap named ${name}`, code: 1 };
  const active = name ? good.filter((r) => r.name === name) : good.filter((r) => !finished(r));
  if (bad.length && !name) return { out: bad.join("\n"), code: 1 };
  if (!active.length) return { out: "no active roadmap", code: 1 };
  if (active.length > 1) return { out: `several active, name one:\n${active.map((r) => `  ${r.name}`).join("\n")}`, code: 1 };
  const r = active[0]!, p = nextPhase(r);
  if (!p) return { out: finished(r) ? `${r.name}: finished` : `${r.name}: nothing ready; waiting on ${r.phases.filter((x) => x.status === "blocked").map((x) => `#${x.n}`).join(", ") || "phases out of order"}`, code: 1 };
  const prev = [...r.phases].reverse().find((x) => x.n < p.n && x.status === "done");
  const after = r.phases.find((x) => x.n > p.n && x.status !== "done");
  return { out: [`roadmap: ${r.name}`, `file: ${r.file}`, `phase: ${p.n} [${p.status}] ${p.title}`, `goal: ${p.goal}`, `verify: ${p.verify}`, `run: ${p.run || "none yet"}`, `previous: ${prev ? `#${prev.n} ${prev.run || prev.title}` : "none"}`, `next: ${after ? `#${after.n} ${after.title}` : "none"}`].join("\n"), code: 0 };
}
