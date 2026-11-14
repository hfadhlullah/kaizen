import { getServer } from "./server-store.ts";
import type { RailTask } from "./types.ts";

export type AttentionTask = RailTask;
type BadgeCard = {
  state?: string;
  archived?: boolean;
  kind: string;
  status: string;
  pty?: { alive: boolean; asking: boolean };
};
// How many runs wait on you (the tab title and the Board's badge): the tasks' own count where it is known, else the cards'.
export function waitingCount(cards: BadgeCard[], tasks: RailTask[] | null = getServer().tasks) {
  if (tasks) {
    const dirs = new Set(cards.map((c) => c.state).filter(Boolean));
    return tasks.filter((t) => (!dirs.size || dirs.has(t.dir)) && t.attention.category === "needs-you").length;
  }
  return cards.filter(
    (c) => !c.archived && ((c.kind === "run" && c.status === "waiting") || (c.pty?.alive && c.pty.asking)),
  ).length;
}
// The side menu's counts: tasks that need you, and new Icebox requests that are awake.
export const needYouCount = (tasks: RailTask[] | null) =>
  tasks?.filter((t) => t.attention.category === "needs-you").length ?? 0;
export const iceNewCount = (sources: any) =>
  (sources?.icebox ?? []).filter((s: any) => s.status === "new" && !s.asleep).length;
// Live terminals: the board's agent sessions plus the shells /shell started.
export const liveTerminals = (cards: any[], shells: unknown[]) =>
  cards.filter((c) => c.pty?.alive).length + shells.length;
