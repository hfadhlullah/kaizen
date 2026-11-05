// The player's hero in 3D: loads hero.glb (a skinned human with height, build and muscle morph targets and the clips idle,
// walk, ready, attack, hit and die), applies a look from web/hero-look.ts, and plays a clip. Drawing only: the look itself
// is validated by the server (cli/game.ts setLook) and the creator panel (web/creator.ts) is what changes it.
import { AnimationMixer, Color, LoopOnce, LoopRepeat, type AnimationAction, type Bone, type Group, type Material, type Object3D, type SkinnedMesh } from "three";
import type { Kit } from "./scene-kit.ts";
import { HERO_DEFAULTS, type HeroLook } from "./hero-look.ts";

export type Clip = "idle" | "walk" | "ready" | "attack" | "hit" | "die";
export type Hero = {
  root: Group;
  setLook(look: Partial<HeroLook>): void;
  play(clip: Clip): void;
  readonly clip: Clip | null;
  tick(ms: number): void;
};
const ONCE: Clip[] = ["hit", "die"];

// null when the file is not downloaded or cannot be read; the caller keeps its placeholder.
export async function loadHero(kit: Kit, art: string[], first: Partial<HeroLook> = {}): Promise<Hero | null> {
  if (!art.includes("hero")) return null;
  const g = await kit.gltf("hero");
  if (!g) return null;
  const root = g.scene;
  const bodies: SkinnedMesh[] = [];                  // one skinned mesh per material (skin, eyes), each with the same morph targets
  const mats = new Map<string, Material[]>(), named = new Map<string, Object3D>();
  root.traverse((o) => {
    if (/^(hair-|beard-|brows$)/.test(o.name)) named.set(o.name, o);
    const m = o as SkinnedMesh;
    if (m.isSkinnedMesh && m.morphTargetDictionary && "tall" in m.morphTargetDictionary) bodies.push(m);
    if ((o as { isMesh?: boolean }).isMesh) for (const mt of ([] as Material[]).concat((o as unknown as { material: Material | Material[] }).material)) {
      const key = mt.name.replace(/\.\d+$/, ""); mats.set(key, [...(mats.get(key) ?? []), mt]);
    }
  });
  if (!bodies.length) return null;
  const mixer = new AnimationMixer(root), actions = new Map<Clip, AnimationAction>();
  for (const c of g.animations) {
    const a = mixer.clipAction(c), name = c.name as Clip;
    if (ONCE.includes(name)) { a.setLoop(LoopOnce, 1); a.clampWhenFinished = true; } else a.setLoop(LoopRepeat, Infinity);
    actions.set(name, a);
  }
  const look: HeroLook = { ...HERO_DEFAULTS };
  const paint = (names: string[], hex: string) => { for (const n of names) for (const m of mats.get(n) ?? []) (m as unknown as { color: Color }).color.set(hex); };
  let cur: Clip | null = null;
  const hero: Hero = {
    root,
    setLook(l) {
      Object.assign(look, l);
      // the slider -1..1 drives the two gender targets (female below zero, male above) and the three body targets directly
      const weights: Record<string, number> = { female: Math.max(0, -look.gender), male: Math.max(0, look.gender), tall: look.tall, build: look.build, muscle: look.muscle };
      for (const b of bodies) for (const [k, w] of Object.entries(weights)) { const i = b.morphTargetDictionary?.[k]; if (i !== undefined && b.morphTargetInfluences) b.morphTargetInfluences[i] = w; }
      paint(["skin"], look.skinColor); paint(["iris"], look.eyeColor);
      // hair and beard styles are meshes in the same file on the same skeleton: show the chosen one, tint it with its colour
      for (const [n, o] of named) {
        const isHair = n.startsWith("hair-"), isBeard = n.startsWith("beard-");
        if (isHair) o.visible = n === `hair-${look.hair}`; else if (isBeard) o.visible = n === `beard-${look.beard}`;
        const hex = isBeard ? look.facialHairColor : look.hairColor;
        // The hair and beard textures are dark, and a colour multiplied onto them stays dark: lift the colour and add a little of it as
        // light of its own, so a grey beard looks grey and a blond head blond.
        o.traverse((c) => { for (const mt of ([] as Material[]).concat((c as unknown as { material?: Material | Material[] }).material ?? [])) { const m = mt as unknown as { color: Color; emissive?: Color }; m.color.set(hex).multiplyScalar(1.7); m.emissive?.set(hex).multiplyScalar(0.3); } });
      }
    },
    play(c) {
      const next = actions.get(c);
      if (!next || c === cur) return;
      const prev = cur ? actions.get(cur) : null;
      next.reset().fadeIn(0.18).play();
      prev?.fadeOut(0.18);
      cur = c;
    },
    get clip() { return cur; },
    tick(ms) { mixer.update(ms / 1000); },
  };
  hero.setLook(first);
  return hero;
}

// The bone a part (hair, beard) is fastened to: found by name on the skeleton.
export const boneOf = (root: Object3D, name: string): Bone | null => { let b: Bone | null = null; root.traverse((o) => { if ((o as Bone).isBone && o.name === name) b = o as Bone; }); return b; };
