type BadgeCard = { archived?: boolean; kind: string; status: string; pty?: { alive: boolean; asking: boolean } };

export function waitingCount(cards: BadgeCard[]) {
  return cards.filter((c) => !c.archived && ((c.kind === "run" && c.status === "waiting") || (c.pty?.alive && c.pty.asking))).length;
}

// The rail's Projects list draws from the same cards: one fetch feeds both.
export let allBoardCards: any[] | null = null;

let onCards: ((cards: any[], projects?: any[], agents?: any[]) => void) | null = null;
export const onBoardCards = (f: typeof onCards) => { onCards = f; };

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
  if (loading) { again = true; return; }
  const gap = lastRun + BADGE_GAP - Date.now();
  if (gap > 0) {
    waiting ??= setTimeout(() => { waiting = undefined; void refreshBoardBadge(); }, gap);
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
      if (!again && current === generation) { lastAll = body; boardBadge(cards, [...projects, ...(rail ?? [])], agents); }
    } catch { /* keep the last count while the board is offline */ }
  } while (again);
  loading = false;
}
