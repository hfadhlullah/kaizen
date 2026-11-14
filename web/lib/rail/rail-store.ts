// The side menu's state: what this browser keeps (the filter, folded projects, pinned worktrees, expanded agent lists). The
// cards, projects, agents and tasks it lists come from the server store (lib/server). Drawn by components/rail.
import { create } from "zustand";
import { getServer, onServer, setServer } from "@lib/server";
import { forgetAgents } from "./agents.ts";
import { taskForCard } from "./rules.ts";
import { ALLF, pinKey, type RailFilt } from "./rules.ts";

const read = <T>(k: string, d: T): T => {
  try {
    return JSON.parse(localStorage.getItem(k) || "null") ?? d;
  } catch {
    return d;
  }
};
const keep = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
// The held "working" status forgets an agent the server no longer lists.
onServer(
  (s) => s.every,
  (e) => e && forgetAgents(e.agents),
);
// The task that carries a card, by what the server last said needs attention.
export const attentionFor = (c: any) => taskForCard(c, getServer().tasks);
const K = { filt: "kz-rail-filter2", folded: "kz-rail-folded", pins: "kz-ws-pins", open: "kz-wsopen" };

type Rail = {
  filt: RailFilt;
  folded: string[];
  pins: string[];
  open: Record<string, true>;
  q: string; // the filter popup's search
  tick: number; // bumped when a held "working" agent may turn done
};
export const useRail = create<Rail>()(() => ({
  filt: { ...ALLF, ...read<Partial<RailFilt>>(K.filt, {}) },
  folded: read<string[]>(K.folded, []),
  pins: read<string[]>(K.pins, []),
  open: read<Record<string, true>>(K.open, {}),
  q: "",
  tick: 0,
}));

export const bumpRail = () => useRail.setState((s) => ({ tick: s.tick + 1 }));
export const setRailQuery = (q: string) => useRail.setState({ q });
export function setRailFilter(f: Partial<RailFilt>) {
  const filt = { ...useRail.getState().filt, ...f };
  keep(K.filt, filt);
  useRail.setState({ filt });
}
export function foldProjects(dirs: string[], shut: boolean) {
  const s = new Set(useRail.getState().folded);
  for (const d of dirs) shut ? s.add(d) : s.delete(d);
  const folded = [...s];
  keep(K.folded, folded);
  useRail.setState({ folded });
}
export const foldProject = (dir: string) => foldProjects([dir], !useRail.getState().folded.includes(dir));
export function togglePin(dir: string, ws: string) {
  const k = pinKey(dir, ws),
    pins = useRail.getState().pins;
  const next = pins.includes(k) ? pins.filter((x) => x !== k) : [...pins, k];
  keep(K.pins, next);
  useRail.setState({ pins: next });
}
export function toggleAgents(dir: string, ws: string) {
  const k = pinKey(dir, ws),
    open = { ...useRail.getState().open };
  if (open[k]) delete open[k];
  else open[k] = true;
  keep(K.open, open);
  useRail.setState({ open });
}
// A drag dropped a project: the list shows the new order at once (the server saves it for every device).
export function orderProjects(dirs: string[]) {
  const rank = new Map(dirs.map((x, i) => [x, i]));
  const e = getServer().every;
  if (e)
    setServer({
      every: { ...e, projects: [...e.projects].sort((a, b) => (rank.get(a.dir) ?? 1e9) - (rank.get(b.dir) ?? 1e9)) },
    });
}
