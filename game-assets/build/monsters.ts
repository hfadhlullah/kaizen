// Turns the monsters a guild uses (web/monster-map.json) from the Quaternius Ultimate Monsters pack into the raw files pack.ts compresses:
//   bun game-assets/build/monsters.ts [pack folder, default ~/.cache/kaizen-game/ultimate/"Ultimate Monsters"] [raw dir, default ~/.cache/kaizen-game]
// Needs bunx and @gltf-transform/cli (pinned, run from the raw dir). Each source .gltf becomes one self-contained monster-<id>.glb.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import MAP from "../../web/monster-map.json";

const pack = process.argv[2] ?? join(homedir(), ".cache", "kaizen-game", "ultimate", "Ultimate Monsters");
const raw = process.argv[3] ?? join(homedir(), ".cache", "kaizen-game");
for (const [id, src] of Object.entries(MAP.models as Record<string, string>)) {
  const [group, name] = src.split("/");
  const from = join(pack, group!, "glTF", `${name}.gltf`), to = join(raw, `monster-${id}.glb`);
  if (!existsSync(from)) throw new Error(`${from} is not in the pack`);
  const p = Bun.spawnSync(["bunx", "@gltf-transform/cli@4.5.1", "copy", from, to], { cwd: raw, stdout: "inherit", stderr: "inherit" });
  if (p.exitCode) throw new Error(`could not convert ${src}`);
  console.log("ok", id, "<-", src);
}
