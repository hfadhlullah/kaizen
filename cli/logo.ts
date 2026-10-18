// A project's logo, when it has one: the first of a fixed list of files in the project
// folder (the parent of its .kaizen). Fixed names only, so the board never serves a path
// a request chose.
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const LOGO_TYPES: Record<string, string> = { png: "image/png", svg: "image/svg+xml", jpg: "image/jpeg", webp: "image/webp", ico: "image/x-icon" };
const NAMES = ["logo", "icon", "favicon"];
const DIRS = ["", "assets", "public", "static", ".github", "docs", "web"];

export function projectLogo(stateDir: string): string | null {
  const root = dirname(stateDir);
  for (const d of DIRS)
    for (const n of NAMES)
      for (const e of Object.keys(LOGO_TYPES)) {
        const f = join(root, d, `${n}.${e}`);
        try { if (existsSync(f) && statSync(f).isFile() && statSync(f).size < 2_000_000) return f; } catch {}
      }
  return null;
}
