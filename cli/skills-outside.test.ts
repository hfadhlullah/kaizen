import { expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeSkills, outsideSkills, removeOutside } from "./skills-outside.ts";

const skill = (dir: string, desc: string) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: x\ndescription: ${desc}\n---\nbody\n`);
};

test("outside skills: one row per name with every agent that has it; kaizen's own and folders without SKILL.md left out", () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "kz-out-")));
  for (const d of [".claude", ".codex", ".agents", ".gemini"]) mkdirSync(join(home, d), { recursive: true });
  skill(join(home, ".agents", "skills", "pdf"), "PDF tools.");
  mkdirSync(join(home, ".claude", "skills"), { recursive: true });
  symlinkSync(join(home, ".agents", "skills", "pdf"), join(home, ".claude", "skills", "pdf"), "junction"); // npx skills links it
  skill(join(home, ".claude", "skills", "mine"), "My own skill.");
  skill(join(home, ".claude", "skills", "kaizen"), "kaizen itself.");
  mkdirSync(join(home, ".codex", "skills", "empty"), { recursive: true });
  skill(join(home, ".codex", "skills", "-flag"), "A name that starts like a flag.");
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  writeFileSync(join(home, ".kaizen", "skills-store.json"), JSON.stringify({ pdf: { source: "anthropics/skills", at: 1 } }));
  const rows = outsideSkills(home, ["kaizen", "kaizen-help"]);
  expect(rows.map((r) => r.id)).toEqual(["pdf", "mine"]); // store installs first
  const pdf = rows[0]!;
  expect(pdf.origin).toBe("store");
  expect(pdf.source).toBe("anthropics/skills");
  expect(pdf.description).toBe("PDF tools.");
  // ~/.agents/skills is read by Antigravity, Codex and Gemini CLI; the link puts it in Claude Code's.
  expect(pdf.agents.filter((a) => a.state === "installed").map((a) => a.agent).sort()).toEqual(["Antigravity", "Claude Code", "Codex", "Gemini CLI"]);
  // Every agent on the computer gets a mark, lit or dimmed.
  expect(rows[1]!.agents.map((a) => `${a.agent}:${a.state}`).sort()).toEqual(["Antigravity:missing", "Claude Code:installed", "Codex:missing", "Gemini CLI:missing"]);
  expect(rows[1]!.origin).toBe("folder");
});

test("Claude Skills come only from installed plugins, never caches or marketplaces", () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "kz-plug-")));
  const plugins = join(home, ".claude", "plugins");
  const at = join(plugins, "cache", "m", "caveman", "abc");
  skill(join(at, "skills", "caveman"), "Terse replies.");
  skill(join(at, "skills", "caveman-commit"), "Terse commits.");
  skill(join(plugins, "marketplaces", "m", "other", "skills", "not-installed"), "Never listed.");
  skill(join(plugins, "cache", "m", "old", "1", "skills", "stale"), "A cache with no install.");
  writeFileSync(join(plugins, "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "caveman@m": [{ scope: "user", installPath: at }] } }));
  // The row's picture comes from the marketplace's GitHub owner; anything that isn't a plain owner name is dropped.
  writeFileSync(join(plugins, "known_marketplaces.json"), JSON.stringify({ m: { source: { source: "github", repo: "JuliusBrussee/caveman" } } }));
  const got = claudeSkills(home);
  expect(got).toEqual([{ plugin: "caveman", marketplace: "m", owner: "JuliusBrussee", store: false, user: true, skills: [
    { id: "caveman:caveman", description: "Terse replies." },
    { id: "caveman:caveman-commit", description: "Terse commits." },
  ] }]);
  expect(claudeSkills(realpathSync(mkdtempSync(join(tmpdir(), "kz-none-"))))).toEqual([]);
});

test("removing a skill from elsewhere: links unlinked with their target kept, folders moved aside, kaizen's own and the store's refused", () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "kz-rm-")));
  const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), "kz-rm-target-")));
  skill(join(elsewhere, "omarchy"), "System skill.");
  skill(join(home, ".claude", "skills", "mine"), "My own skill.");
  skill(join(home, ".agents", "skills", "mine"), "A second copy.");
  skill(join(home, ".claude", "skills", "kaizen"), "kaizen itself.");
  skill(join(home, ".agents", "skills", "pdf"), "PDF tools.");
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  writeFileSync(join(home, ".kaizen", "skills-store.json"), JSON.stringify({ pdf: { source: "anthropics/skills", at: 1 } }));
  try { symlinkSync(join(elsewhere, "omarchy"), join(home, ".claude", "skills", "omarchy"), "junction"); } catch { /* no links here */ }
  // A link in a later agent's folder to a folder that moves aside first, and a link that was already broken.
  mkdirSync(join(home, ".gemini", "skills"), { recursive: true });
  try { symlinkSync(join(home, ".agents", "skills", "mine"), join(home, ".gemini", "skills", "mine"), "junction"); } catch { /* no links */ }
  try { mkdirSync(join(home, ".codex", "skills"), { recursive: true }); symlinkSync(join(elsewhere, "gone"), join(home, ".codex", "skills", "broken"), "junction"); } catch { /* no links */ }
  const shipped = ["kaizen"];
  for (const n of ["kaizen", "pdf", "nothing", "..", "../x", "-rf", "a:b", "constructor"]) expect(removeOutside(home, n, shipped).ok).toBe(false);
  expect(existsSync(join(home, ".claude", "skills", "kaizen", "SKILL.md"))).toBe(true);
  const r = removeOutside(home, "mine", shipped, new Date("2026-11-20T08:00:00Z"));
  expect(r.ok).toBe(true);
  expect(existsSync(join(home, ".claude", "skills", "mine")) || existsSync(join(home, ".agents", "skills", "mine"))).toBe(false);
  const bin = join(home, ".kaizen", "removed-skills", "2026-11-20T08-00-00-000Z");
  expect(r.ok && r.movedTo).toBe(bin);
  expect(readdirSync(bin).sort()).toEqual([".agents", ".claude"]);
  expect(existsSync(join(bin, ".claude", "mine", "SKILL.md"))).toBe(true);
  const isLink = (p: string) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
  expect(isLink(join(home, ".gemini", "skills", "mine"))).toBe(false); // no link left pointing at the moved folder
  if (isLink(join(home, ".codex", "skills", "broken"))) {
    expect(removeOutside(home, "broken", shipped).ok).toBe(true);
    expect(isLink(join(home, ".codex", "skills", "broken"))).toBe(false);
  }
  let linked = false;
  try { linked = lstatSync(join(home, ".claude", "skills", "omarchy")).isSymbolicLink(); } catch { /* none */ }
  if (linked) {
    const l = removeOutside(home, "omarchy", shipped);
    expect(l.ok && !("movedTo" in l)).toBe(true);
    expect(existsSync(join(home, ".claude", "skills", "omarchy"))).toBe(false);
    expect(existsSync(join(elsewhere, "omarchy", "SKILL.md"))).toBe(true); // what the link pointed at stays
  }
});
