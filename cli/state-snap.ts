// The slow, file-and-git half of GET /state, run on a Worker. The board's main thread also
// relays every terminal's bytes, so a rebuild there (about 250ms across all projects) froze
// typing in each open agent. Anything that needs the live sessions stays in web.ts.
import { join } from "node:path";
import { backlogCards, boardCards, cardsGit, healRuns, home, reviewFindings, type Card } from "./state.ts";

export type Snap = {
  cards: Card[];
  // By card index: what the panel's commit, push and Fix findings forms offer.
  extra: { git?: string; gitDue?: "commit" | "push"; open?: number }[];
  backlog: ReturnType<typeof backlogCards>;
};
type GitMark = { at: number; ids: string; marks: Record<string, string>; dues: Record<string, "commit" | "push"> };

const GIT_MS = 5000;
const gitCache = new Map<string, GitMark>();
let gitSeen = 0;

// gitGen moves whenever the page changed something, so a commit shows at once, not after GIT_MS.
export function snapshot(dirs: string[], gitGen: number): Snap {
  if (gitGen !== gitSeen) { gitCache.clear(); gitSeen = gitGen; }
  for (const d of dirs) healRuns(d);
  const cards = boardCards(dirs, Date.now());
  const outside = (c: Card) => c.state !== join(home, ".kaizen");
  // The git mark, for the cards whose panel offers commit and push: one status per project.
  const markable = (c: Card) => c.kind === "run" && !c.archived && (c.status === "done" || c.awaiting === "approvals.review") && outside(c);
  for (const d of new Set(cards.filter(markable).map((c) => c.state))) {
    const ids = cards.filter((c) => markable(c) && c.state === d).map((c) => c.id!), idKey = ids.join("\n"), had = gitCache.get(d);
    if (had?.ids === idKey && Date.now() - had.at < GIT_MS) continue;
    const dues: Record<string, "commit" | "push"> = {}, marks = cardsGit(d, ids, dues);
    gitCache.set(d, { at: Date.now(), ids: idKey, marks, dues });
  }
  // Open findings the panel's Fix findings form would offer, on the same runs.
  const openFindings = (c: Card) => c.kind === "run" && !c.archived && (c.status === "done" || c.awaiting === "findings" || c.awaiting === "approvals.review") && outside(c)
    ? reviewFindings(c.state, c.id!).filter((f) => !f.done).length || undefined : undefined;
  const extra = cards.map((c) => {
    const g = markable(c) ? gitCache.get(c.state) : undefined;
    return { git: g?.marks[c.id!], gitDue: g?.dues[c.id!], open: openFindings(c) };
  });
  return { cards, extra, backlog: backlogCards(dirs) };
}

// Replies carry the request's id. A worker that dies fails what is waiting, and the caller
// builds the snapshot itself: a slow board beats an empty one.
export function snapWorker() {
  let worker: Worker | null = null, next = 0;
  const waiting = new Map<number, { ok: (s: Snap) => void; no: (e: unknown) => void }>();
  const fail = (e: unknown) => {
    worker?.terminate();
    worker = null;
    for (const w of waiting.values()) w.no(e);
    waiting.clear();
  };
  return (dirs: string[], gitGen: number) => new Promise<Snap>((ok, no) => {
    if (!worker) {
      worker = new Worker(new URL("./state-snap.ts", import.meta.url).href);
      worker.unref(); // a board or test ending does not wait on it
      worker.onmessage = (e) => {
        const w = waiting.get(e.data.id);
        waiting.delete(e.data.id);
        if (e.data.snap) w?.ok(e.data.snap); else w?.no(new Error(e.data.error));
      };
      worker.onerror = (e) => fail(e);
    }
    waiting.set(++next, { ok, no });
    worker.postMessage({ id: next, dirs, gitGen });
  });
}

declare const self: Worker;
if (!Bun.isMainThread) self.onmessage = (e: MessageEvent) => {
  const { id, dirs, gitGen } = e.data;
  try { self.postMessage({ id, snap: snapshot(dirs, gitGen) }); }
  catch (err) { self.postMessage({ id, error: String(err) }); }
};
