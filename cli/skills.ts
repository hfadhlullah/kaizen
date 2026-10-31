// The skills kaizen ships: each folder under skills/ with a SKILL.md, plus an optional
// skill.json ({ title, group, needs }), so a new folder needs no change elsewhere.
// Turning one off removes kaizen's own links for this user; a real folder, or a link to
// anything else, under the same name stays. ~/.kaizen/skills-off.json keeps the choice.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

export type Skill = { id: string; rel: string; title: string; description: string; group: "core" | "media" | "optional"; needs: string[] };
export const SKILL_HOMES = [
  { name: "Claude Code", dir: ".claude" }, { name: "Codex", dir: ".codex" }, { name: "Antigravity", dir: ".agents" },
  { name: "OpenCode", dir: ".opencode" }, { name: "Cursor", dir: ".cursor" }, { name: "Gemini CLI", dir: ".gemini" },
];

// Core by name, so a lost manifest or an edited off-list can never remove the workflow.
const CORE = ["kaizen", "kaizen-help"];

function frontMatter(text: string) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const d = /^description:[ \t]*(?:[>|][-+]?[ \t]*\r?\n)?([\s\S]*?)(?=\r?\n[A-Za-z_-]+:|(?![\s\S]))/m.exec(fm)?.[1] ?? "";
  const line = d.replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim();
  const first = /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
  return first.length <= 200 ? first : first.slice(0, 200).replace(/\s+\S*$/, "") + "…";
}

export function bundledSkills(repo: string): Skill[] {
  const root = join(repo, "skills");
  const rels = [...readdirSync(root), ...(existsSync(join(root, "media")) ? readdirSync(join(root, "media")).map((n) => `media/${n}`) : [])];
  return rels.filter((rel) => existsSync(join(root, rel, "SKILL.md"))).map((rel) => {
    let m: any = {};
    try { m = JSON.parse(readFileSync(join(root, rel, "skill.json"), "utf8")); } catch { /* a folder alone is enough */ }
    const group = CORE.includes(basename(rel)) ? "core" : m.group === "media" || rel.startsWith("media/") ? "media" : "optional";
    return { id: basename(rel), rel, title: String(m.title ?? basename(rel)), description: frontMatter(readFileSync(join(root, rel, "SKILL.md"), "utf8")), group, needs: Array.isArray(m.needs) ? m.needs.map(String) : [] };
  });
}

const offFile = (home: string) => join(home, ".kaizen", "skills-off.json");
export function skillsOff(home: string): string[] {
  try { const v = JSON.parse(readFileSync(offFile(home), "utf8")); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}

// What an install links. The off-list is the user's global choice: a project install is
// its own decision, and core is never off.
export const skillsToLink = (rels: string[], off: string[], global: boolean) =>
  rels.filter((r) => !global || CORE.includes(basename(r)) || !off.includes(basename(r)));

const isLink = (p: string) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
// Ours: a link into some kaizen clone's skills/<rel>, this one or the installed one.
function ours(p: string, rel: string) {
  if (!isLink(p)) return false;
  const raw = readlinkSync(p), target = resolve(isAbsolute(raw) ? raw : join(dirname(p), raw));
  const tail = `${sep}skills${sep}${rel.split("/").join(sep)}`;
  return target.endsWith(tail) && existsSync(join(target.slice(0, -tail.length), "cli", "install.ts"));
}

export function skillStatus(skill: Skill, home: string) {
  return SKILL_HOMES.filter((h) => existsSync(join(home, h.dir))).map((h) => {
    const p = join(home, h.dir, "skills", skill.id);
    const present = existsSync(p) || isLink(p);
    return { agent: h.name, state: !present ? "missing" : ours(p, skill.rel) ? "installed" : "other" };
  });
}

// The clone the core link points at, so a restored link matches its neighbours.
function installedClone(home: string, repo: string) {
  for (const h of SKILL_HOMES) {
    const p = join(home, h.dir, "skills", "kaizen");
    if (!ours(p, "kaizen")) continue;
    const raw = readlinkSync(p);
    return dirname(dirname(resolve(isAbsolute(raw) ? raw : dirname(p), raw)));
  }
  return repo;
}

// Returns an error, or null. Global links only: a project's own install is left alone.
export function setSkill(repo: string, home: string, id: string, on: boolean): string | null {
  const skill = bundledSkills(repo).find((s) => s.id === id);
  if (!skill) return "unknown skill";
  if (skill.group === "core") return "Core skills can't be turned off";
  const clone = installedClone(home, repo);
  for (const h of SKILL_HOMES) {
    if (!existsSync(join(home, h.dir))) continue;
    const dir = join(home, h.dir, "skills"), p = join(dir, id);
    if (!on) { if (ours(p, skill.rel)) unlinkSync(p); continue; }
    if (existsSync(p) || isLink(p)) continue;
    mkdirSync(dir, { recursive: true });
    symlinkSync(join(clone, "skills", skill.rel), p, process.platform === "win32" ? "junction" : undefined);
  }
  const off = new Set(skillsOff(home));
  on ? off.delete(id) : off.add(id);
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  const tmp = `${offFile(home)}.tmp`;
  writeFileSync(tmp, JSON.stringify([...off], null, 2));
  renameSync(tmp, offFile(home));
  return null;
}
