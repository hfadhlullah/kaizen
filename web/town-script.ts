// The town's story, with no drawing in it: the guilds from GET /game/state become buildings on a
// grid. A founded guild grows with its level (a floor every three levels, six at most) and gets a
// wing for each learned skill (three at most); a guild not founded yet is an empty plot.
export type TownGuild = { id: string; name: string; founded: boolean; level: number; skills: { learned: boolean }[] };
export type Building = { id: string; name: string; founded: boolean; level: number; floors: number; wings: number; col: number; row: number; x: number; z: number };

export const GAP = 6, ROW_GAP = 8; // world units between building centres, along a row and between rows
export const MAX_FLOORS = 6, MAX_WINGS = 3;
export const floorsOf = (founded: boolean, level: number) => (founded ? Math.min(MAX_FLOORS, 1 + Math.floor(Math.max(0, level) / 3)) : 0);
export const wingsOf = (founded: boolean, learned: number) => (founded ? Math.min(MAX_WINGS, Math.max(0, learned)) : 0);

// `cols` buildings to a row, in the engine's guild order, front row first.
export function townScript(guilds: TownGuild[], cols = 5): { buildings: Building[]; cols: number; rows: number } {
  const c = Math.max(1, Math.floor(cols));
  const buildings = guilds.map((g, i) => {
    const col = i % c, row = Math.floor(i / c);
    return {
      id: g.id, name: g.name, founded: g.founded, level: g.level,
      floors: floorsOf(g.founded, g.level), wings: wingsOf(g.founded, g.skills.filter((s) => s.learned).length),
      col, row, x: col * GAP, z: -row * ROW_GAP,
    };
  });
  return { buildings, cols: Math.min(c, Math.max(1, guilds.length)), rows: Math.max(1, Math.ceil(guilds.length / c)) };
}
