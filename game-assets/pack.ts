// Compress the raw scenes from Blender and write dist/ (the release files) with a manifest of sha256 and sizes.
// Usage: bun game-assets/pack.ts [raw dir, default ~/.cache/kaizen-game]. Needs python3 and bunx (gltf-transform, pinned).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const raw = process.argv[2] ?? join(homedir(), ".cache", "kaizen-game");
const dist = join(import.meta.dir, "dist");
// the scenes and the hero, plus every hair-, beard- and monster-<id>.glb the Blender scripts left in the raw folder
const SCENES = ["forest", "dungeon", "town", "hero", ...readdirSync(raw).filter((f) => /^(hair|beard|monster)-[a-z0-9]{1,16}\.glb$/.test(f)).map((f) => f.slice(0, -4))];
const MAX = 15 * 1024 * 1024;
mkdirSync(dist, { recursive: true });
const run = (cmd: string[]) => { const p = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" }); if (p.exitCode) throw new Error(cmd.join(" ")); };
const files: Record<string, { sha256: string; size: number }> = {};
for (const s of SCENES) {
  const mid = join(dist, `${s}.tmp.glb`), out = join(dist, `${s}.glb`);
  run(["bunx", "@gltf-transform/cli@4.5.1", "optimize", join(raw, `${s}.glb`), mid, "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "1024", "--palette", "false"]);
  run(["python3", join(import.meta.dir, "build", "cutout.py"), mid, out]);
  rmSync(mid, { force: true });
  const b = readFileSync(out), size = statSync(out).size;
  if (size > MAX) throw new Error(`${s}.glb is ${size} bytes, over the 15 MB budget`);
  files[`${s}.glb`] = { sha256: createHash("sha256").update(b).digest("hex"), size };
}
writeFileSync(join(dist, "manifest.json"), JSON.stringify({ version: 1, files }, null, 2) + "\n");
console.log(files);
