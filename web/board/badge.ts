type BadgeCard = { archived?: boolean; kind: string; status: string; pty?: { alive: boolean; asking: boolean } };

export function waitingCount(cards: BadgeCard[]) {
  return cards.filter((c) => !c.archived && ((c.kind === "run" && c.status === "waiting") || (c.pty?.alive && c.pty.asking))).length;
}

// The rail's Projects list draws from the same cards: one fetch feeds both.
let onCards: ((cards: any[], projects?: any[]) => void) | null = null;
export const onBoardCards = (f: typeof onCards) => { onCards = f; };

export function boardBadge(cards: BadgeCard[], projects?: unknown[]) {
  generation++;
  onCards?.(cards, projects);
  const a = document.querySelector<HTMLElement>('.rail a[data-view="board"]');
  if (!a) return;
  const n = waitingCount(cards);
  if (n) a.dataset.n = String(n);
  else delete a.dataset.n;
  a.title = n ? `Board: ${n} waiting on you` : "Board";
  a.setAttribute("aria-label", a.title);
}

let generation = 0;
let loading = false;
let again = false;
export async function refreshBoardBadge() {
  if (loading) { again = true; return; }
  loading = true;
  do {
    again = false;
    const current = generation;
    try {
      const r = await fetch("/state?all=1");
      if (!r.ok) continue;
      const { cards, projects } = await r.json();
      if (!again && current === generation) boardBadge(cards, projects);
    } catch { /* keep the last count while the board is offline */ }
  } while (again);
  loading = false;
}
