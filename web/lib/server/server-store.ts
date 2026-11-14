// What the server says, as slices of one Zustand store: this page's /state (cards, projects, the picked project), the
// all-projects cards and agents the side menu and the Terminal page list, the tasks' attention, the Icebox's /sources and
// the live shells. One poller (poller.ts) is the only writer; components read the slice they draw.
import { create } from "zustand";
import type { Agent, RailTask } from "./types.ts";

export type Shell = { key: string; dir: string; title: string; agent: string; run?: string };
export type Every = { cards: any[]; projects: any[]; agents: Agent[] };
export type Server = {
  state: any; // GET /state for the project this page is on (or all of them)
  loaded: boolean; // the first /state has come
  all: boolean; // the page shows every project
  dir: string | null; // the project this page picked; null is wherever the board started
  every: Every | null; // GET /state?all=1: every project's cards and agents (null until read)
  tasks: RailTask[] | null; // GET /tasks?all=1: what needs you
  sources: any | null; // GET /sources: request sources and every Icebox signal
  shells: Shell[]; // GET /shells
  changed: number; // counts the server's "changed" events, for pages that refetch their own data
};
export const useServer = create<Server>()(() => ({
  state: { project: null, projects: [], cards: [], now: Date.now(), all: false, dir: null },
  loaded: false,
  all: typeof location === "undefined" ? true : new URLSearchParams(location.search).get("all") !== "0",
  dir: null,
  every: null,
  tasks: null,
  sources: null,
  shells: [],
  changed: 0,
}));
export const getServer = useServer.getState;
export const setServer = useServer.setState;
// Runs `fn` when one slice changes (the engines that react to a read: a changed /state, new shells).
export const onServer = <T>(pick: (s: Server) => T, fn: (next: T, prev: T) => void) =>
  useServer.subscribe((s, p) => (pick(s) !== pick(p) ? fn(pick(s), pick(p)) : undefined));
export const onState = (fn: (next: any, prev: any) => void) => onServer((s) => s.state, fn);

export const setTasks = (tasks: RailTask[]) => setServer({ tasks });
export const setShells = (shells: Shell[]) => setServer({ shells });
