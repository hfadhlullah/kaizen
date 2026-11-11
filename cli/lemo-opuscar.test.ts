// The Lemo-Opuscar wrapper ships off by default and unlinked; the library itself is fetched on use.
import { test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { bundledSkills, skillsHeld } from "./skills.ts";

const repo = join(import.meta.dir, "..");
test("lemo-opuscar is an optional skill, off by default, with its licence and setup script", () => {
  const s = bundledSkills(repo).find((x) => x.id === "lemo-opuscar")!;
  expect(s.group).toBe("optional");
  expect(s.offByDefault).toBe(true);
  expect(skillsHeld(repo, "/nonexistent-home")).toContain("lemo-opuscar");
  for (const f of ["LICENSE", "scripts/setup.sh"]) expect(existsSync(join(repo, "skills/optional/lemo-opuscar", f))).toBe(true);
});
