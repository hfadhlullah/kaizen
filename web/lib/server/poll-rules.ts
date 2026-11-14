// The poller's decisions without the network (tested in server.test.ts): when a /state read is worth drawing, how repeated
// cards get distinct keys, which cards moved column or started needing you, and which agents just started asking.
export const QUIET_GAP = 500; // a change event can come several times a second while agents work
export const HIDDEN_GAP = 5000; // a hidden tab only watches for agents asking
export const REDRAW_MS = 30_000; // an identical reply still redraws now and then, for ages and repeat notices
export const BADGE_GAP = 2000; // the all-projects read is hundreds of KB: at most one per gap
export const TASKS_GAP = 2000;
export const SOURCES_GAP = 30_000;

// The reply without its clock: two replies that differ only in `now` are the same.
export const withoutClock = (text: string) => text.replace(/"now":\d+\}$/, "");
// How long a quiet read waits so one runs per gap and the last change is always covered.
export const quietDelay = (now: number, lastQuiet: number, hidden: boolean) =>
  Math.max(0, lastQuiet + (hidden ? HIDDEN_GAP : QUIET_GAP) - now);
// A quiet read of the same reply, drawn recently, skips the redraw.
export const skipRedraw = (quiet: boolean, body: string, last: string, now: number, drawnAt: number) =>
  quiet && body === last && now - drawnAt < REDRAW_MS;

// A card's key: one name per task or run. Two tasks may carry the same text; numberKeys makes the repeats distinct.
export const baseKey = (c: any) =>
  c.kind === "idea" ? "idea:" + c.state + ":" + c.text : "run:" + c.state + ":" + c.id;
export const cardKey = (c: any) => c._k || baseKey(c);
export function numberKeys(cards: any[]) {
  const seen = new Map<string, number>();
  for (const c of cards) {
    const b = baseKey(c),
      n = seen.get(b) || 0;
    seen.set(b, n + 1);
    c._k = n ? b + "#" + n : b;
  }
}

// A run waiting on you, or an agent waiting on input.
export const needsYou = (c: any) => c.status === "waiting" || !!(c.pty?.alive && c.pty.asking);
export type Seen = Map<string, [number, boolean]>;
// Against the last read: the cards that changed column (they slide), the ones that started needing you (they flash), and
// what to compare the next read to. `before` null is the first read, which is not news.
export function changes(before: Seen | null, cards: any[]) {
  const moved: string[] = [],
    flash: string[] = [];
  for (const c of before ? cards : []) {
    const b = before!.get(cardKey(c));
    if (b && b[0] !== c.column) moved.push(cardKey(c));
    if (b && !b[1] && needsYou(c)) flash.push(cardKey(c));
  }
  return {
    moved,
    flash,
    next: new Map(cards.map((c) => [cardKey(c), [c.column, needsYou(c)] as [number, boolean]])) as Seen,
  };
}
// In-card agents waiting on input, by session key.
export const askingNow = (cards: any[]) =>
  new Map(cards.filter((c) => !c.archived && c.pty?.alive && c.pty.asking).map((c) => [c.pty.key as string, c]));
// The ones that started asking since `asked` (null: the first read, what already asks is not news).
export const newlyAsking = (asked: Set<string> | null, now: Map<string, any>) =>
  asked ? [...now].filter(([k]) => !asked.has(k)).map(([, c]) => c) : [];
