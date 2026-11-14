// The side menu's state: what the old code feeds it on every refresh (cards, projects, agents, tasks) and what this browser
// keeps (the filter, folded projects, pinned worktrees, expanded agent lists). Drawn by components/rail.
import { create } from "zustand";
import { forgetAgents } from "./agents.ts";
import { ALLF, pinKey, type RailData, type RailFilt } from "./rules.ts";

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
const K = { filt: "kz-rail-filter2", folded: "kz-rail-folded", pins: "kz-ws-pins", open: "kz-wsopen" };

type Rail = {
  data: RailData;
  filt: RailFilt;
  folded: string[];
  pins: string[];
  open: Record<string, true>;
  q: string; // the filter popup's search
  loc: string; // location.search at the last touch: the row it names is lit
  tick: number; // bumped when a held "working" agent may turn done
};
export const useRail = create<Rail>()(() => ({
  data: { cards: [], projects: [], agents: [], tasks: null },
  filt: { ...ALLF, ...read<Partial<RailFilt>>(K.filt, {}) },
  folded: read<string[]>(K.folded, []),
  pins: read<string[]>(K.pins, []),
  open: read<Record<string, true>>(K.open, {}),
  q: "",
  loc: typeof location === "undefined" ? "" : location.search,
  tick: 0,
}));

export function setRailData(data: RailData) {
  forgetAgents(data.agents);
  useRail.setState({ data });
}
// The address changed without a redraw (a card opened in place): light the row it names.
export const touchRail = () => useRail.setState({ loc: location.search });
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
  const d = useRail.getState().data;
  useRail.setState({
    data: { ...d, projects: [...d.projects].sort((a, b) => (rank.get(a.dir) ?? 1e9) - (rank.get(b.dir) ?? 1e9)) },
  });
}
