// Skills the user's agents have that kaizen does not ship: each agent's skills folder (SKILL_HOMES, plus the shared
// ~/.agents/skills that `npx skills` installs into), one row per name with every agent that has it, and the skills
// inside installed Claude Code plugins (read from installed_plugins.json, never the plugin caches or marketplaces).
// Listing only reads, and follows a link only to read the SKILL.md it names. `removeOutside` is the one writer.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, statSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { SKILL_HOMES, frontMatter } from "./skills.ts";
import { recorded, storeRecord } from "./skills-store.ts";
import { MARKET, pluginRecord } from "./plugin-store.ts";

export type OutsideSkill = {
  id: string;
  description: string;
  path: string; // the folder that holds SKILL.md, links resolved
  agents: { agent: string; state: "installed" | "missing" }[];
  origin: "store" | "link" | "folder"; // installed from kaizen's store, a link to elsewhere, or a folder the user made
  source?: string; // owner/repo, when known
};
export type PluginSkills = { plugin: string; marketplace: string; owner?: string; store: boolean; user: boolean; skills: { id: string; description: string }[] };

const GH_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const MAX_SKILLS = 500, MAX_PER_PLUGIN = 200;
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
const isLink = (p: string) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
const target = (p: string) => { const raw = readlinkSync(p); return resolve(isAbsolute(raw) ? raw : join(dirname(p), raw)); };
const describe = (dir: string) => { try { return frontMatter(readFileSync(join(dir, "SKILL.md"), "utf8")); } catch { return ""; } };
const hasSkill = (dir: string) => { try { return statSync(join(dir, "SKILL.md")).isFile(); } catch { return false; } };

// The folders to look in, by agent. ~/.agents/skills is Antigravity's own folder in SKILL_HOMES and also the shared
// folder `npx skills` keeps its copy in, which Codex and Gemini CLI read too (the CLI links nothing into their own
// folders), so a skill there counts for all three.
const SHARED_READERS = ["Antigravity", "Codex", "Gemini CLI"];
const homes = (home: string) => SKILL_HOMES.filter((h) => existsSync(join(home, h.dir))).map((h) => ({ agent: h.name, dir: join(home, h.dir, "skills") }));

export function outsideSkills(home: string, shipped: string[]): OutsideSkill[] {
  const record = storeRecord(home), skip = new Set(shipped), byId = new Map<string, OutsideSkill>();
  const places = homes(home);
  for (const { agent, dir } of places) {
    let names: string[] = [];
    try { names = readdirSync(dir); } catch { continue; }
    for (const id of names) {
      if (!NAME.test(id) || skip.has(id) || id.startsWith(".")) continue;
      const p = join(dir, id);
      if (!hasSkill(p)) continue;
      let row = byId.get(id);
      if (!row) {
        if (byId.size >= MAX_SKILLS) continue;
        const link = isLink(p), real = link ? target(p) : p, rec = recorded(record, id) ? record[id] : undefined;
        row = {
          id, description: describe(p), path: real, agents: [],
          origin: rec ? "store" : link ? "link" : "folder",
          ...(rec ? { source: rec.source } : {}),
        };
        byId.set(id, row);
      }
      row.agents.push({ agent, state: "installed" });
      if (dir === join(home, ".agents", "skills"))
        for (const a of SHARED_READERS) if (places.some((p) => p.agent === a)) row.agents.push({ agent: a, state: "installed" });
    }
  }
  // Every agent on this computer gets a mark, lit or dimmed, like the bundled rows.
  const all = places.map((p) => p.agent);
  for (const row of byId.values()) {
    const has = new Set(row.agents.map((a) => a.agent));
    row.agents = all.map((agent) => ({ agent, state: has.has(agent) ? "installed" : "missing" }));
  }
  // Skills kaizen installed come first, then by name.
  return [...byId.values()].sort((a, b) => Number(b.origin === "store") - Number(a.origin === "store") || a.id.localeCompare(b.id));
}

export function claudeSkills(home: string): PluginSkills[] {
  let reg: any;
  try { reg = JSON.parse(readFileSync(join(home, ".claude", "plugins", "installed_plugins.json"), "utf8")); } catch { return []; }
  const out: PluginSkills[] = [], mine = pluginRecord(home);
  // Who runs each marketplace on GitHub, for the row's picture: known_marketplaces.json's `owner/repo`.
  let known: any = null;
  try { known = JSON.parse(readFileSync(join(home, ".claude", "plugins", "known_marketplaces.json"), "utf8")); } catch { /* none */ }
  const ownerOf = (m: string) => {
    const src = known && Object.hasOwn(known, m) ? known[m]?.source : null;
    const o = src?.source === "github" && typeof src.repo === "string" ? src.repo.split("/")[0] : "";
    return GH_OWNER.test(o) ? o : undefined;
  };
  for (const [key, installs] of Object.entries(reg?.plugins ?? {})) {
    const at = (Array.isArray(installs) ? installs : []).find((i: any) => typeof i?.installPath === "string");
    if (!at) continue;
    const [plugin = key, marketplace = ""] = key.split("@");
    const dir = join(at.installPath, "skills");
    let names: string[] = [];
    try { names = readdirSync(dir); } catch { names = []; }
    const skills = names.sort().filter((n) => NAME.test(n) && hasSkill(join(dir, n))).slice(0, MAX_PER_PLUGIN)
      .map((n) => ({ id: `${plugin}:${n}`, description: describe(join(dir, n)) }));
    // A plugin kaizen installed from the store is listed even with no skills, so it can be removed here.
    const store = marketplace === MARKET && Object.hasOwn(mine, plugin);
    // Only a plugin installed for the user can be removed here; one for a project only is listed without Remove.
    const user = (installs as any[]).some((i: any) => i?.scope === "user");
    const owner = ownerOf(marketplace);
    if (skills.length || store) out.push({ plugin, marketplace, ...(owner ? { owner } : {}), store, user, skills });
  }
  return out.sort((a, b) => a.plugin.localeCompare(b.plugin));
}

// Removes a skill from every agent's skills folder. A link is unlinked and what it points at stays; a folder moves to
// ~/.kaizen/removed-skills/<time>/<agent folder>/<name>, so a skill that can't be installed again is never lost. Never
// follows a link, and never touches kaizen's own skills or one kaizen installed from the store (`npx skills remove`).
export function removeOutside(home: string, name: string, shipped: string[], now = new Date()) {
  if (!NAME.test(name) || name.includes(":") || shipped.includes(name)) return { ok: false as const, why: "kaizen does not remove this skill here" };
  if (recorded(storeRecord(home), name)) return { ok: false as const, why: "kaizen installed this skill from the store; it is removed through skills.sh" };
  const bin = join(home, ".kaizen", "removed-skills", now.toISOString().replace(/[:.]/g, "-"));
  let n = 0, moved = false;
  for (const h of SKILL_HOMES) {
    const p = join(home, h.dir, "skills", name);
    let link = false;
    try { const st = lstatSync(p); link = st.isSymbolicLink(); if (!link && !st.isDirectory()) continue; } catch { continue; }
    // A link goes whatever its target: one into a folder moved aside a moment ago, or one already broken, is still a link.
    if (link) { unlinkSync(p); n++; continue; }
    if (!hasSkill(p)) continue;
    const to = join(bin, h.dir, name);
    mkdirSync(dirname(to), { recursive: true });
    try { renameSync(p, to); } catch (e: any) {
      if (e?.code !== "EXDEV") throw e;
      cpSync(p, to, { recursive: true, verbatimSymlinks: true });
      rmSync(p, { recursive: true });
    }
    n++; moved = true;
  }
  return n ? { ok: true as const, name, ...(moved ? { movedTo: bin } : {}) } : { ok: false as const, why: "no skill by that name in your agents' folders" };
}
