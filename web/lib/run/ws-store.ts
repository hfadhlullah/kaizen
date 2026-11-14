// What the run workspace knows about the one it shows: which workspace (`ctx`), the card whose panel is up, the shells and
// agents it read from the server, whether the server can start terminals, and the runs whose own session is open in another
// terminal, and the terminal the sidebar asked for (`selectTerm`). A store, so the actions (ws-actions.ts), the redraw (ws-draw.ts) and the lifecycle (workspace.ts) read one
// place instead of sharing module variables.
import { create } from "zustand";
import { layoutOf, patch, type Saved } from "./layout-store.ts";
import type { RvAgent } from "./run-view-store.ts";

export type WsCtx = { dir: string; ws: string; k: string };
export type WsShell = { key: string; run: string; title: string; agent?: string };
type Ws = { ctx: WsCtx | null; card: any; shells: WsShell[]; agents: RvAgent[]; defAgent: string; noPty: boolean; elsewhere: string[]; selectTerm: string | null };
export const useWs = create<Ws>()(() => ({ ctx: null, card: null, shells: [], agents: [], defAgent: "", noPty: false, elsewhere: [], selectTerm: null }));
export const getWs = useWs.getState;
export const setWs = useWs.setState;
export const cx = () => getWs().ctx!;
// The shown workspace's saved layout, and a change to it.
export const saved = (): Saved => layoutOf(cx().k);
export const edit = (fn: (s: Saved) => Saved) => patch(cx().k, fn);
export const screens = () => saved().screens;
export const addShell = (sh: WsShell) => setWs((s) => (s.shells.some((x) => x.key === sh.key) ? s : { shells: [...s.shells, sh] }));
export const setElsewhere = (k: string, on: boolean) => setWs((s) => ({ elsewhere: on ? [...new Set([...s.elsewhere, k])] : s.elsewhere.filter((x) => x !== k) }));
