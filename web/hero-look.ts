// What a player may choose for their hero, and the one place that says what is valid. No drawing and no files in
// here: the server (cli/game.ts) checks a write against it, the creator panel (web/creator.ts) builds its controls
// from it, and bun tests it from cli/game-look.test.ts.
export const HAIRS = ["bald", "short", "long", "bob", "shaggy"] as const;
export const BEARDS = ["none", "scruffy", "faun", "sigmund", "viking", "moustache"] as const;
// Sliders run from -1 to 1 around the neutral body; 0 is the default. `gender` runs from -1 (female) through 0 (neutral) to 1 (male).
export const SLIDERS = ["gender", "tall", "build", "muscle"] as const;
export const COLORS = ["skinColor", "hairColor", "facialHairColor", "eyeColor"] as const;
export type HeroLook = { hair: string; beard: string; gender: number; tall: number; build: number; muscle: number; skinColor: string; hairColor: string; facialHairColor: string; eyeColor: string };
export const HERO_DEFAULTS: HeroLook = { hair: "short", beard: "none", gender: 0, tall: 0, build: 0, muscle: 0, skinColor: "#e0ac8a", hairColor: "#4a2f1b", facialHairColor: "#4a2f1b", eyeColor: "#3b6b8f" };
export const LOOK_KEYS = ["hair", "beard", ...SLIDERS, ...COLORS] as const;

// A set of looks to start from: the gallery of presets in the creator.
export const PRESETS: { name: string; look: Partial<HeroLook> }[] = [
  { name: "Wanderer", look: { hair: "short", beard: "scruffy", gender: 0.5, tall: 0, build: 0, muscle: 0.2 } },
  { name: "Knight", look: { hair: "short", beard: "moustache", gender: 1, tall: 0.4, build: 0.2, muscle: 0.8, skinColor: "#c68863", hairColor: "#2b2118", facialHairColor: "#2b2118" } },
  { name: "Scholar", look: { hair: "bob", beard: "none", gender: -0.8, tall: -0.1, build: -0.5, muscle: -0.4, skinColor: "#f1c7a8", hairColor: "#7a4b25", eyeColor: "#4d7a4a" } },
  { name: "Ranger", look: { hair: "long", beard: "none", gender: -0.4, tall: 0.2, build: -0.2, muscle: 0.3, skinColor: "#a8714f", hairColor: "#3a2618", facialHairColor: "#3a2618", eyeColor: "#6b4a2b" } },
  { name: "Elder", look: { hair: "bald", beard: "viking", gender: 0.9, tall: -0.2, build: 0.3, muscle: -0.2, skinColor: "#d9a98a", facialHairColor: "#c9c9c9", eyeColor: "#5a7d9a" } },
  { name: "Brawler", look: { hair: "shaggy", beard: "sigmund", gender: 1, tall: 0.3, build: 0.7, muscle: 1, skinColor: "#8d5a3d", hairColor: "#171310", facialHairColor: "#171310", eyeColor: "#2f2a25" } },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
export type Checked = { ok: true; look: Partial<HeroLook> } | { ok: false; error: string };

// Checks a patch of look values. Unknown keys, a style that is not in the lists, a slider outside -1..1 and a
// colour that is not #rrggbb are all refused as a whole: nothing of a bad patch is kept.
export function checkLook(patch: unknown): Checked {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { ok: false, error: "the look must be an object" };
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!(LOOK_KEYS as readonly string[]).includes(k)) return { ok: false, error: `"${k}" is not something you can choose` };
    if (k === "hair") { if (typeof v !== "string" || !(HAIRS as readonly string[]).includes(v)) return { ok: false, error: `hair must be one of ${HAIRS.join(", ")}` }; out[k] = v; }
    else if (k === "beard") { if (typeof v !== "string" || !(BEARDS as readonly string[]).includes(v)) return { ok: false, error: `beard must be one of ${BEARDS.join(", ")}` }; out[k] = v; }
    else if ((SLIDERS as readonly string[]).includes(k)) { if (typeof v !== "number" || !Number.isFinite(v) || v < -1 || v > 1) return { ok: false, error: `${k} must be a number from -1 to 1` }; out[k] = Math.round(v * 1000) / 1000; }
    else { if (typeof v !== "string" || !HEX.test(v)) return { ok: false, error: `${k} must be a colour like #a1b2c3` }; out[k] = v.toLowerCase(); }
  }
  return { ok: true, look: out as Partial<HeroLook> };
}
