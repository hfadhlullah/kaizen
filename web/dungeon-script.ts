// The dungeon's story, with no drawing in it: one dungeon from GET /game/state becomes a track
// of stages and monsters, and a clock or a live run says where the hero is on it. The three.js
// scene (web/dungeon.ts) only draws what this says; keeping it apart lets bun test it.
export type DungeonIn = {
  stages: { name: string; monsters: number; ms: number | null }[];
  boss: boolean; outcome: "cleared" | "retreat" | "live" | "stalled"; stage: string;
  work: { done: number; items: number } | null; xp: number; pending: number; waited?: number | null;
};
export type Monster = { i: number; stage: number; x: number; boss: boolean };
export type Seg = { name: string; kind: "plan" | "build" | "review" | "wave"; from: number; gate: number; monsters: number };
export type Script = { segs: Seg[]; monsters: Monster[]; width: number; reached: number; total: number };

const PER = 3.1, LEAD = 3, TAIL = 2.4, BOSS_GAP = 1.2; // world units: between monsters, before the first, after the last to the gate, and the extra room the boss gets

export function dungeonScript(d: DungeonIn): Script {
  const segs: Seg[] = [], monsters: Monster[] = [];
  let x = 0;
  d.stages.forEach((s, si) => {
    const from = x;
    // the review's last monster is the boss (below) and gets extra room, since it is the biggest
    const roomy = d.boss && si === 2 && s.monsters > 0 ? BOSS_GAP : 0;
    for (let k = 0; k < s.monsters; k++) monsters.push({ i: monsters.length, stage: si, x: from + LEAD + k * PER + (k === s.monsters - 1 ? roomy : 0), boss: false });
    x = from + LEAD + Math.max(0, s.monsters - 1) * PER + roomy + TAIL;
    const kind = si === 0 ? "plan" : si === 1 ? "build" : si === 2 ? "review" : "wave";
    segs.push({ name: s.name, kind, from, gate: x, monsters: s.monsters });
  });
  // The boss is the review's last monster, once the review exists (the engine's `boss`).
  if (d.boss) { const last = [...monsters].reverse().find((m) => m.stage === 2); if (last) last.boss = true; }
  return { segs, monsters, width: x, reached: reachedOf(d), total: monsters.length };
}

// The stage the run is in: a live run's own stage (plus the fix round it is on), a finished or
// stopped run's last stage that has a time. Index into `stages`.
export function reachedOf(d: DungeonIn): number {
  const last = d.stages.length - 1;
  if (d.outcome === "cleared") return last;
  if (d.outcome === "live") {
    const base = d.stage === "plan" ? 0 : d.stage === "build" ? 1 : 2;
    return Math.min(last, base === 2 ? last : base); // in the review, the newest wave is the one being fought
  }
  let r = 0;
  d.stages.forEach((s, i) => { if (s.ms !== null && i < 3) r = i; });
  return r;
}

// How many monsters, from the front, are down in a live run. Plan: one, once past it. Build: the
// Work-list items ticked in progress.md (none kept: none counted, nothing invented). Review and
// waves: all of the stage before the one being fought.
export function defeatedLive(d: DungeonIn): number {
  const s = dungeonScript(d), r = s.reached;
  let n = 0;
  d.stages.forEach((st, i) => {
    if (i < r) n += st.monsters;
    else if (i === r && i === 1 && d.work && d.work.items > 0) {
      // the work list and the plan's steps are different lists: 2 of 5 items ticked is 2/5 of however many build monsters there are
      n += Math.min(st.monsters, d.work.done >= d.work.items ? st.monsters : Math.floor((d.work.done / d.work.items) * st.monsters));
    }
  });
  return Math.min(n, s.total);
}

// The monsters a replay plays: all of them for a cleared run, up to the stage reached for a run
// that stopped.
export function playable(d: DungeonIn): number {
  const s = dungeonScript(d);
  if (d.outcome === "cleared") return s.total;
  return s.monsters.filter((m) => m.stage <= s.reached).length;
}

// `fight` is how far into the current fight a replay is (0 to 1); a live run has no such figure.
export type Frame = { x: number; defeated: number; fighting: number | null; done: boolean; fight?: number };
const WALK = 5.6; // units per second (the monsters stand further apart, so the hero walks faster to keep a replay about the same length)
const STAND = 1.2; // how far in front of a monster the hero stands to fight it; the boss, being bigger, gets more
export const standAt = (m: Monster) => m.x - (m.boss ? STAND + 0.8 : STAND);

// Where the hero is `ms` into a replay: walk to the next monster, stand and fight it, repeat,
// then walk to the last gate. Each fight lasts `fightMs`, shorter for a very big dungeon so a
// replay stays about a minute.
export function fightMs(n: number) { return Math.min(1500, Math.max(400, Math.floor(50_000 / Math.max(1, n)))); }
export function replay(d: DungeonIn, ms: number): Frame {
  const s = dungeonScript(d), n = playable(d), fm = fightMs(n);
  const mons = s.monsters.slice(0, n);
  let t = Math.max(0, ms), x = 0;
  for (const m of mons) {
    const walk = ((standAt(m) - x) / WALK) * 1000;
    if (t < walk) return { x: x + (t / 1000) * WALK, defeated: m.i, fighting: null, done: false };
    t -= walk; x = standAt(m);
    if (t < fm) return { x, defeated: m.i, fighting: m.i, done: false, fight: t / fm };
    t -= fm;
  }
  const end = (mons.length ? s.segs[Math.min(s.reached, s.segs.length - 1)]!.gate : 0);
  const walk = ((end - x) / WALK) * 1000;
  if (t < walk) return { x: x + (t / 1000) * WALK, defeated: n, fighting: null, done: false };
  return { x: end, defeated: n, fighting: null, done: true };
}

// Where a live run's hero stands: in front of the first monster still up, or at the gate when
// the stage's monsters are all down.
export function liveFrame(d: DungeonIn): Frame {
  const s = dungeonScript(d), defeated = defeatedLive(d), next = s.monsters[defeated];
  const seg = s.segs[Math.min(s.reached, s.segs.length - 1)];
  if (next && next.stage <= s.reached) return { x: Math.max(0, standAt(next)), defeated, fighting: next.i, done: false };
  return { x: seg ? seg.gate - 0.3 : 0, defeated, fighting: null, done: false }; // every monster up to here is down
}

// Which Blender scene a run's dungeon is drawn in: a stable pick per run, one run in three walks a forest path and
// the rest go underground. Only a choice of backdrop: it changes nothing the engine counts.
export const sceneOf = (id: string): "dungeon" | "forest" => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 3 === 0 ? "forest" : "dungeon";
};

// How full the health bar of monster `i` is. Empty once it is down; a replay drains the bar of the monster being fought over that fight, so it
// reaches zero as the monster falls. A live run cannot say how far along its item is, so the bar drains with the time the run has spent on it
// (`waitedMs`, over `EXPECT_MS`, the time an item is expected to take) down to a sliver, and stays there: it empties only when the run really
// finishes the item, which is when the monster is defeated.
export const EXPECT_MS = 180_000, SLIVER = 0.05;
export function hpOf(f: Frame, i: number, waitedMs: number): number {
  if (i < f.defeated) return 0;
  if (f.fighting !== i) return 1;
  if (f.fight !== undefined) return Math.max(0, Math.min(1, 1 - f.fight));
  return 1 - (1 - SLIVER) * Math.max(0, Math.min(1, waitedMs / EXPECT_MS));
}

// An idle-game view of a live run. The engine knows how many items the run has really finished, not how far it is inside one, so the picture
// runs a little ahead: the hero fights the real monster, its bar drains over EST_MS, it dies and he walks to the next, again and again, but never
// past the stage's last monster (a stage ends only when the run really ends it, and the review boss falls only then). A real tick of the run
// resets `waitedMs` and the picture snaps back to the true position. `estimated` is how many monsters the picture is ahead by (0 when exact).
export const EST_MS = 45_000;
export function liveEstimated(d: DungeonIn, waitedMs: number): Frame & { estimated: number } {
  const f = liveFrame(d), s = dungeonScript(d);
  if (f.fighting === null) return { ...f, estimated: 0 };
  const cur = s.monsters[f.fighting]!, stage = s.monsters.filter((m) => m.stage === cur.stage), cap = Math.max(0, stage[stage.length - 1]!.i - 1 - f.fighting);
  const turns = Math.floor(Math.max(0, waitedMs) / EST_MS), k = Math.min(turns, cap);
  const frac = turns <= cap ? (Math.max(0, waitedMs) % EST_MS) / EST_MS : Math.min(1 - SLIVER, (waitedMs - cap * EST_MS) / EST_MS);
  const at = s.monsters[f.fighting + k]!;
  return { x: Math.max(0, standAt(at)), defeated: f.defeated + k, fighting: f.fighting + k, done: false, fight: frac, estimated: k };
}
