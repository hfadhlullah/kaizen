export type AttentionTask = {
  id: string;
  dir: string;
  title: string;
  status?: string;
  activeRun?: string | null;
  runs?: (string | { id: string })[];
  runIds?: string[];
  legacy?: { kind: string; id?: string; index?: number };
  attention: { category: string; reason: string; action: string };
};
export let attentionTasks: AttentionTask[] | null = null;
export const taskForCard = (c: any, tasks = attentionTasks) =>
  tasks?.find(
    (t) =>
      t.dir === c.state &&
      (t.id === c.taskId ||
        (c.kind === "run" &&
          [
            t.activeRun,
            ...(t.runs ?? t.runIds ?? []).map((r) => (typeof r === "string" ? r : r.id)),
            ...(t.legacy?.kind === "run" ? [t.legacy.id] : []),
          ].includes(c.id))),
  );
export function setTaskAttention(tasks: AttentionTask[]) {
  attentionTasks = tasks;
  if (typeof document !== "undefined") {
    const count = tasks.filter((t) => t.attention.category === "needs-you").length;
    document.querySelectorAll<HTMLElement>('.rail a[data-view="tasks"]').forEach((a) => {
      if (count) a.dataset.n = String(count);
      else delete a.dataset.n;
      a.title = count ? `Tasks · ${count} need you` : "Tasks";
      a.setAttribute("aria-label", a.title);
    });
    dispatchEvent(new Event("kz-task-attention"));
  }
}
type BadgeCard = {
  state?: string;
  archived?: boolean;
  kind: string;
  status: string;
  pty?: { alive: boolean; asking: boolean };
};

export function waitingCount(cards: BadgeCard[], tasks = attentionTasks) {
  if (tasks) {
    const dirs = new Set(cards.map((c) => c.state).filter(Boolean));
    return tasks.filter((t) => (!dirs.size || dirs.has(t.dir)) && t.attention.category === "needs-you").length;
  }
  return cards.filter(
    (c) => !c.archived && ((c.kind === "run" && c.status === "waiting") || (c.pty?.alive && c.pty.asking)),
  ).length;
}

// The rail's Projects list draws from the same cards: one fetch feeds both.
export let allBoardCards: any[] | null = null;

let onCards: ((cards: any[], projects?: any[], agents?: any[]) => void) | null = null;
export const onBoardCards = (f: typeof onCards) => {
  onCards = f;
};

export function boardBadge(cards: BadgeCard[], projects?: unknown[], agents?: unknown[]) {
  generation++;
  allBoardCards = cards;
  if (typeof window !== "undefined") dispatchEvent(new Event("kz-all-cards"));
  onCards?.(cards, projects, agents);
}

let generation = 0;
let lastAll = "";
let loading = false;
let again = false;
// The badge reads every project's state (hundreds of KB), and a busy agent triggers a
// board refresh a couple of times a second: at most one badge read per BADGE_GAP, the
// last request still served when the gap ends.
const BADGE_GAP = 2000;
let lastRun = 0;
let waiting: ReturnType<typeof setTimeout> | undefined;
export async function refreshBoardBadge() {
  if (loading) {
    again = true;
    return;
  }
  const gap = lastRun + BADGE_GAP - Date.now();
  if (gap > 0) {
    waiting ??= setTimeout(() => {
      waiting = undefined;
      void refreshBoardBadge();
    }, gap);
    return;
  }
  lastRun = Date.now();
  loading = true;
  do {
    again = false;
    const current = generation;
    try {
      const r = await fetch("/state?all=1");
      if (!r.ok) continue;
      const text = await r.text();
      const body = text.replace(/"now":\d+\}$/, "");
      if (body === lastAll) continue;
      const { cards, projects, rail, agents } = JSON.parse(text);
      if (!again && current === generation) {
        lastAll = body;
        boardBadge(cards, [...projects, ...(rail ?? [])], agents);
      }
    } catch {
      /* keep the last count while the board is offline */
    }
  } while (again);
  loading = false;
}
