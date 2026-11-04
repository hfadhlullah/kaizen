// The dungeon's story, with no drawing in it: one dungeon from GET /game/state becomes a track
// of stages and monsters, and a clock or a live run says where the hero is on it. The three.js
// scene (web/dungeon.ts) only draws what this says; keeping it apart lets bun test it.
export type DungeonIn = {
  stages: { name: string; monsters: number; ms: number | null }[];
  boss: boolean; outcome: "cleared" | "retreat" | "live" | "stalled"; stage: string;
  work: { done: number; items: number } | null; xp: number; pending: number;
};
export type Monster = { i: number; stage: number; x: number; boss: boolean };
export type Seg = { name: string; kind: "plan" | "build" | "review" | "wave"; from: number; gate: number; monsters: number };
export type Script = { segs: Seg[]; monsters: Monster[]; width: number; reached: number; total: number };

const PER = 1.3, LEAD = 2, TAIL = 1.4; // world units: between monsters, before the first, after the last to the gate

export function dungeonScript(d: DungeonIn): Script {
  const segs: Seg[] = [], monsters: Monster[] = [];
  let x = 0;
  d.stages.forEach((s, si) => {
    const from = x;
    for (let k = 0; k < s.monsters; k++) monsters.push({ i: monsters.length, stage: si, x: from + LEAD + k * PER, boss: false });
    x = from + LEAD + Math.max(0, s.monsters - 1) * PER + TAIL;
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
    else if (i === r && i === 1 && d.work) n += Math.min(st.monsters, d.work.done);
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

export type Frame = { x: number; defeated: number; fighting: number | null; done: boolean };
const WALK = 3.2; // units per second

// Where the hero is `ms` into a replay: walk to the next monster, stand and fight it, repeat,
// then walk to the last gate. Each fight lasts `fightMs`, shorter for a very big dungeon so a
// replay stays about a minute.
export function fightMs(n: number) { return Math.min(1500, Math.max(400, Math.floor(50_000 / Math.max(1, n)))); }
export function replay(d: DungeonIn, ms: number): Frame {
  const s = dungeonScript(d), n = playable(d), fm = fightMs(n);
  const mons = s.monsters.slice(0, n);
  let t = Math.max(0, ms), x = 0;
  for (const m of mons) {
    const walk = ((m.x - 0.7 - x) / WALK) * 1000;
    if (t < walk) return { x: x + (t / 1000) * WALK, defeated: m.i, fighting: null, done: false };
    t -= walk; x = m.x - 0.7;
    if (t < fm) return { x, defeated: m.i, fighting: m.i, done: false };
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
  if (next && next.stage <= s.reached) return { x: Math.max(0, next.x - 0.7), defeated, fighting: next.i, done: false };
  return { x: seg ? seg.gate - 0.3 : 0, defeated, fighting: null, done: false }; // every monster up to here is down
}
