// Which monster the dungeon draws: the run's guild picks a family (a minion and a boss, web/monster-map.json), and a downloaded
// monster-<id>.glb (Quaternius Ultimate Monsters, CC0) is cloned for each monster, with idle, attack and death clips. No file, no
// model: the dungeon keeps its cone. The pure part (`monsterOf`, `groupOf`) is tested by cli/monsters.test.ts.
import { AnimationMixer, Box3, Color, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Group, type Material, type Mesh } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Kit } from "./scene-kit.ts";
import MAP from "./monster-map.json";

type Family = { minion: string; boss: string };
export const MODELS = MAP.models as Record<string, string>;
export const FAMILIES = MAP.families as Record<string, Family>;
export const GENERIC = MAP.generic as Family;

// The model id for a monster of a guild; a guild with no family of its own (one founded by hand) gets the generic one.
export const monsterOf = (guild: string, boss: boolean): string => (Object.hasOwn(FAMILIES, guild) ? FAMILIES[guild]! : GENERIC)[boss ? "boss" : "minion"];
// "Big", "Blob" or "Flying": the source folder in the pack, which decides the clip names.
export const groupOf = (id: string): keyof typeof MAP.clips => MODELS[id]!.split("/")[0] as keyof typeof MAP.clips;

// idle/attack loop; hit plays the flinch once and returns to what it was doing; die plays once and stays down; setFlash (0 to 1) reddens it,
// setAlpha (0 to 1) fades it. `height` is how tall it stands, for placing a health bar over it.
export type Actor = { root: Group; height: number; idle(): void; attack(): void; hit(): void; die(): void; dead(): boolean; tick(ms: number): void; setFlash(v: number): void; setAlpha(v: number): void; dispose(): void };
export type Maker = (boss: boolean) => Actor | null;

// Loads the one or two files a guild needs; null per kind when the file is not there or cannot be read.
export async function loadFamily(kit: Kit, art: string[], guild: string): Promise<Maker> {
  const made = new Map<string, { scene: Group; animations: AnimationClip[] } | null>();
  for (const boss of [false, true]) {
    const id = monsterOf(guild, boss);
    if (made.has(id)) continue;
    made.set(id, art.includes(`monster-${id}`) ? await kit.gltf(`monster-${id}`) : null);
  }
  return (boss) => {
    const id = monsterOf(guild, boss), src = made.get(id);
    if (!src) return null;
    const g = groupOf(id), names = MAP.clips[g];
    const root = clone(src.scene) as Group;
    // Stand on the floor at a size that suits the part: boss or minion, whatever the model's own scale.
    const box = new Box3().setFromObject(root), h = box.max.y - box.min.y || 1, s = (boss ? MAP.height.boss : MAP.height.minion) / h;
    root.scale.setScalar(s); root.position.y = -box.min.y * s + ((MAP.hover as Record<string, number>)[g] ?? 0);
    root.rotation.y = -Math.PI / 2;                       // faces the hero, who stands to its left
    // each monster has its own materials, so one can flash red or fade while the others stay as they are
    const mats: (Material & { emissive?: Color })[] = [];
    root.traverse((o) => { const m = o as Mesh; if (!m.isMesh) return; m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone(); mats.push(...([] as Material[]).concat(m.material)); });
    const mixer = new AnimationMixer(root), acts = new Map<string, AnimationAction>();
    for (const key of ["idle", "attack", "hit", "die"] as const) {
      const clip = src.animations.find((c) => c.name === names[key]);
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      if (key === "die") { a.setLoop(LoopOnce, 1); a.clampWhenFinished = true; } else if (key === "hit") a.setLoop(LoopOnce, 1); else a.setLoop(LoopRepeat, Infinity);
      acts.set(key, a);
    }
    let cur = "", dead = false, base = "idle", hitUntil = 0;
    const play = (k: string) => {
      const a = acts.get(k);
      if (!a || k === cur || dead) return;
      const prev = acts.get(cur);
      a.reset().fadeIn(0.1).play(); prev?.fadeOut(0.1); cur = k;
    };
    const hitClip = acts.get("hit");
    return { root, height: (boss ? MAP.height.boss : MAP.height.minion) + ((MAP.hover as Record<string, number>)[g] ?? 0),
      idle: () => { base = "idle"; if (!hitUntil) play("idle"); }, attack: () => { base = "attack"; if (!hitUntil) play("attack"); },
      hit: () => { if (dead || !hitClip) return; hitUntil = performance.now() + hitClip.getClip().duration * 1000; play("hit"); },
      die: () => { hitUntil = 0; play("die"); dead = true; }, dead: () => dead,
      tick: (ms) => { mixer.update(ms / 1000); if (hitUntil && performance.now() > hitUntil) { hitUntil = 0; const b = base; cur = "hit"; play(b); } },
      // stops the clips and drops the mixer's cache of this model, for when the monster is replaced (a replay stands it up again)
      dispose: () => { mixer.stopAllAction(); mixer.uncacheRoot(root); for (const m of mats) m.dispose(); },
      setFlash: (v) => { for (const m of mats) if (m.emissive) m.emissive.setRGB(0.5 * v, 0.04 * v, 0.02 * v); },
      setAlpha: (v) => { for (const m of mats) { m.transparent = v < 1; m.opacity = v; } } };
  };
}
