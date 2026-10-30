// Global knowledge: engineering lessons that hold beyond the project they were
// learned in, one Markdown file per track under ~/.kaizen/knowledge/.
//
// `remember` and `recall` are the stable interface. Callers (the reviewer, the
// planner, the SessionStart hook, Codex) only rely on their flags and on the line
// format below; the ranking inside recall() can become FTS5 or hybrid retrieval
// later without any of them changing.
//
// Line format, one lesson per line:
//   - [tag,tag@1.2] lesson text (applies: …) — YYYY-MM-DD · project/run-id
//
// No imports from state.ts: this module stays usable on its own (tests, bun -e).
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";

export const TRACKS = ["code", "writing", "communication", "operations", "research", "preferences"];
// preferences.md is the user's to write by hand in v1: taste is never inferred from work.
const WRITABLE = TRACKS.filter((t) => t !== "preferences");
export const SESSION_HEADER = "Past experience from other projects (kaizen recall) — verify before applying, project rules win:";
// A session hook only injects lines that share at least one tool with the project.
const SESSION_MIN_SCORE = 2;

// Read at call time so a scratch HOME (tests) or KAIZEN_KNOWLEDGE_DIR applies.
export const knowledgeDir = () => process.env.KAIZEN_KNOWLEDGE_DIR || join(homedir(), ".kaizen", "knowledge");
const fileOf = (track: string) => join(knowledgeDir(), `${track}.md`);
const read = (f: string) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };

// Rejects, never redacts: a lesson that needs editing is the reviewer's to reword.
export function secretReason(text: string): string {
  const checks: [RegExp, string][] = [
    [/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|github_pat_\w{8,}|AKIA[0-9A-Z]{12,}|xox[bp]-[\w-]{8,}|AIza[\w-]{20,})/, "looks like an API key"],
    [/-----BEGIN [A-Z ]*PRIVATE KEY/, "contains a private key"],
    [/\b(api[_-]?key|token|secret|password|passwd)\s*[:=]\s*\S{4,}/i, "assigns a credential"],
    [/[A-Za-z0-9+/=_-]{32,}/, "contains a long key-like string"],
    [/[\w.+-]+@[\w-]+(\.[\w-]+)*\.[A-Za-z]{2,}\b/, "contains an email address"],
    [/\b(?!127\.0\.0\.1\b|0\.0\.0\.0\b)(\d{1,3}\.){3}\d{1,3}\b/, "contains an IP address"],
    [/\b[\w-]+(\.[\w-]+)*\.(local|internal|lan|corp|home\.arpa)\b/i, "names a private host"],
  ];
  for (const [re, why] of checks) if (re.test(text)) return why;
  return "";
}

// The opt-out, project config first, then global; the first file that sets it decides.
export function globalAllowed(projectDir: string): boolean {
  for (const f of [join(projectDir, ".kaizen", "config.yml"), join(homedir(), ".kaizen", "config.yml")]) {
    const t = read(f);
    const m = /^knowledge:\n(?:[ \t][^\n]*\n|[ \t]*#.*\n)*?[ \t]+global:[ \t]*["']?(\w+)/m.exec(t) || /^knowledge\.global:[ \t]*["']?(\w+)/m.exec(t);
    if (m) return m[1] !== "false";
  }
  return true;
}

type Line = { n: number; tags: string[]; text: string; date: string; raw: string };
const LINE = /^- \[([^\]]*)\] (.*) — (\d{4}-\d{2}-\d{2}) · (.+)$/;
function lines(track: string): Line[] {
  return read(fileOf(track)).split("\n").flatMap((raw, i) => {
    const m = LINE.exec(raw);
    return m ? [{ n: i + 1, tags: m[1].split(",").map((t) => t.trim().toLowerCase()).filter(Boolean), text: m[2], date: m[3], raw }] : [];
  });
}
const tagsOf = (s: string) => s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

// The project a command runs in: the nearest folder above cwd holding .kaizen/, so a
// reviewer calling from runs/<id>/ or src/ still gets its project's opt-out and name.
export function projectOf(cwd: string): string {
  for (let d = cwd; ; d = dirname(d)) {
    if (existsSync(join(d, ".kaizen"))) return d;
    if (dirname(d) === d) return cwd;
  }
}

export type Remembered = { ok: true; line: string; n: number; similar: string[] } | { ok: false; why: string };

// Appends by default; replaces a line only when told which one. It never judges two
// lessons the same itself: it hands back the same-tag lines for the caller to decide.
export function remember(o: { track: string; tags: string; text: string; applies: string; source: string; replace?: number; projectDir: string }): Remembered {
  if (!WRITABLE.includes(o.track)) return { ok: false, why: o.track === "preferences" ? "preferences are written by hand, not by remember" : `unknown track "${o.track}" (${WRITABLE.join(", ")})` };
  if (!globalAllowed(o.projectDir)) return { ok: false, why: "knowledge.global is false for this project; nothing written" };
  const tags = tagsOf(o.tags);
  if (!tags.length) return { ok: false, why: "--tags is required" };
  const bad = tags.find((t) => !/^[a-z0-9][a-z0-9._@+\/-]*$/.test(t));
  if (bad) return { ok: false, why: `tag "${bad}" may only hold letters, digits and . _ @ + / -` };
  const applies = o.applies.replace(/\s+/g, " ").trim();
  if (!applies) return { ok: false, why: "--applies is required: say where the lesson holds (versions, platform, limits)" };
  if (!/^[^\s\/]+\/[^\s]+$/.test(o.source.trim())) return { ok: false, why: "--source must be <project>/<run id>" };
  const text = o.text.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, why: "the lesson text is empty" };
  const why = secretReason(`${o.tags} ${text} ${applies}`);
  if (why) return { ok: false, why: `rejected (secret check): ${why}` };

  const line = `- [${tags.join(",")}] ${text} (applies: ${applies}) — ${new Date().toISOString().slice(0, 10)} · ${o.source.trim()}`;
  const before = lines(o.track);
  const similar = before.filter((l) => l.tags.some((t) => tags.includes(t)) && l.n !== o.replace).map((l) => `${l.n}: ${l.raw}`);
  const f = fileOf(o.track);
  mkdirSync(knowledgeDir(), { recursive: true });
  if (o.replace !== undefined) {
    if (!before.some((l) => l.n === o.replace)) return { ok: false, why: `line ${o.replace} is not a lesson in ${o.track}.md` };
    const all = read(f).split("\n");
    all[o.replace - 1] = line;
    writeFileSync(f, all.join("\n"));
    return { ok: true, line, n: o.replace, similar };
  }
  const cur = read(f);
  const head = cur ? (cur.endsWith("\n") ? "" : "\n") : `# Global knowledge — ${o.track}\n\n`;
  appendFileSync(f, head + line + "\n");
  return { ok: true, line, n: (cur + head).split("\n").length, similar };
}

// ponytail: keyword scoring (3 per shared tag, 2 for another version, 1 per query word in the text), linear
// scan; swap for FTS5 here when tag matching visibly misses lessons.
export function recall(o: { track?: string; tags?: string; query?: string; limit?: number; min?: number }): string[] {
  const want = tagsOf(o.tags ?? "");
  const words = (o.query ?? "").toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const tracks = o.track ? [o.track] : TRACKS;
  const scored = tracks.flatMap((t) => lines(t)).map((l) => {
    const bare = l.tags.map((t) => t.split("@")[0]);
    // An exact tag (bun@1.2) outranks the same tool at another version (bun@1.1).
    const tagScore = want.reduce((n, w) => n + (l.tags.includes(w) ? 3 : bare.includes(w.split("@")[0]) ? 2 : 0), 0);
    const text = l.text.toLowerCase();
    return { l, score: tagScore + words.filter((w) => text.includes(w)).length };
  });
  return scored.filter((s) => s.score >= (o.min ?? 1))
    .sort((a, b) => b.score - a.score || b.l.date.localeCompare(a.l.date))
    .slice(0, o.limit ?? 20).map((s) => s.l.raw);
}

// What a project is made of, read from its manifests: the tags a session recalls by.
export function stackTags(dir: string): string[] {
  const tags = new Set<string>();
  const has = (f: string) => existsSync(join(dir, f));
  if (has("package.json")) {
    tags.add("node");
    try {
      const p = JSON.parse(read(join(dir, "package.json")));
      for (const k of Object.keys({ ...p.dependencies, ...p.devDependencies })) tags.add(k.toLowerCase());
    } catch { /* a broken package.json still says node */ }
  }
  if (has("bun.lock") || has("bun.lockb") || has("bunfig.toml")) tags.add("bun");
  if (has("go.mod")) tags.add("go");
  if (has("Cargo.toml")) tags.add("rust");
  if (has("pyproject.toml") || has("requirements.txt")) tags.add("python");
  if (has("Gemfile")) tags.add("ruby");
  return [...tags];
}

// The SessionStart hook's output: matching lessons only, or nothing at all.
export function sessionText(dir: string): string {
  const tags = stackTags(dir);
  if (!tags.length) return "";
  const hit = recall({ track: "code", tags: tags.join(","), limit: 20, min: SESSION_MIN_SCORE });
  return hit.length ? `${SESSION_HEADER}\n${hit.join("\n")}\n` : "";
}

export const hookCommand = () => process.platform === "win32" ? "kaizen.cmd recall --session" : "kaizen recall --session";

// Merge into ~/.claude/settings.json without touching anything else. Invalid JSON is
// left byte-identical: the user's config is never rewritten from a guess.
export function addSessionHook(settings: string): string {
  const cur = read(settings);
  let s: any;
  try { s = cur.trim() ? JSON.parse(cur) : {}; } catch { return `${settings} is not valid JSON; session hook not added`; }
  const cmd = hookCommand();
  s.hooks ??= {};
  s.hooks.SessionStart ??= [];
  if (JSON.stringify(s.hooks.SessionStart).includes(cmd)) return "";
  s.hooks.SessionStart.push({ hooks: [{ type: "command", command: cmd }] });
  mkdirSync(join(settings, ".."), { recursive: true });
  writeFileSync(settings, JSON.stringify(s, null, 2) + "\n");
  return "added";
}

export function removeSessionHook(settings: string): boolean {
  const cur = read(settings);
  let s: any;
  try { s = JSON.parse(cur); } catch { return false; }
  const list = s?.hooks?.SessionStart;
  if (!Array.isArray(list)) return false;
  const ours = (h: any) => typeof h?.command === "string" && h.command.endsWith("recall --session") && /^kaizen(\.cmd)? /.test(h.command);
  const kept = list.map((m: any) => ({ ...m, hooks: (m.hooks ?? []).filter((h: any) => !ours(h)) })).filter((m: any) => m.hooks.length);
  if (kept.length === list.length && JSON.stringify(kept) === JSON.stringify(list)) return false;
  if (kept.length) s.hooks.SessionStart = kept; else delete s.hooks.SessionStart;
  if (!Object.keys(s.hooks).length) delete s.hooks;
  writeFileSync(settings, JSON.stringify(s, null, 2) + "\n");
  return true;
}

// CLI: `kaizen remember …` / `kaizen recall …`. Returns the exit code.
export function cli(argv: string[], cwd = process.cwd()): number {
  const [cmd, ...rest] = argv;
  const flag = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest.splice(i, 2)[1] : undefined; };
  if (cmd === "recall") {
    if (rest.includes("--session")) { process.stdout.write(sessionText(cwd)); return 0; }
    const track = flag("--track"), tags = flag("--tags"), query = flag("--query"), limit = Number(flag("--limit") ?? 20);
    if (!Number.isInteger(limit) || limit < 1) { console.log("--limit must be a whole number above 0"); return 1; }
    if (track && !TRACKS.includes(track)) { console.log(`unknown track "${track}"`); return 1; }
    const out = recall({ track, tags, query: query ?? rest.join(" "), limit });
    console.log(out.length ? out.join("\n") : "Recalled: none");
    return 0;
  }
  if (cmd === "remember") {
    const track = flag("--track") ?? "", tags = flag("--tags") ?? "", applies = flag("--applies") ?? "";
    const project = projectOf(cwd);
    const run = flag("--run"), source = flag("--source") ?? (run ? `${basename(project).replace(/\s+/g, "-")}/${run}` : "");
    const rep = flag("--replace");
    const r = remember({ track, tags, applies, source, text: rest.join(" "), replace: rep ? Number(rep) : undefined, projectDir: project });
    if (!r.ok) { console.log(r.why); return 1; }
    console.log(`Remembered (global): ${r.line}`);
    if (r.similar.length) console.log(`Same-tag lessons already in ${track}.md (replace one with --replace <n> if this says the same thing):\n${r.similar.join("\n")}`);
    return 0;
  }
  console.log(`kaizen remember --track <${WRITABLE.join("|")}> --tags a,b@1.2 --applies "<where it holds>" (--run <run id> | --source <project>/<run>) [--replace <n>] "<lesson>"
kaizen recall [--track <track>] [--tags a,b] [--query "<words>"] [--limit 20]
kaizen recall --session`);
  return 1;
}
