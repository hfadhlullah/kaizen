// The tabs a workspace has, derived from what the server lists and what the layout saved. No DOM, no store, tested alone
// (ws-derive.test.ts): workspace.ts reads the stores and hands them in.
import { liveIn, stageTabs } from "./ws-tabs.ts";
import type { Saved, SavedTab } from "./layout-store.ts";

export type Tab = SavedTab & { kind: "agent" | "shell" | "local" | "preview" | "note" | "wait" | "history" };
export const AGENTS = ["claude", "codex", "gemini", "agy", "opencode", "cursor"];
export type DeriveIn = {
  ctx: { dir: string; ws: string; k: string };
  cards: any[];
  shells: { key: string; run: string; title: string; agent?: string }[];
  agents: { name: string; cmd: string }[]; // every agent installed for the project (/agents)
  serverAgents: any[]; // the sessions the board lists (state.agents)
  elsewhere: ReadonlySet<string>; // runs whose own session is open in another terminal
  saved: Saved;
  wsOfCard: (c: any) => string;
  key: (c: any) => string;
};
// `revive`: closed agent tabs that come back. A tab closed stays hidden only for that agent: one started again under the
// same key (a resume) is a new agent (`born` differs) and the sidebar lists it, so its tab returns (the caller saves it).
export function deriveTabs(i: DeriveIn): { tabs: Tab[]; revive: string[] } {
  const { ctx, cards, shells, agents, key } = i,
    out: Tab[] = [],
    named = (a?: string) => agents.find((x) => x.cmd === a)?.name ?? "Agent",
    live = liveIn(cards, ctx.dir, ctx.ws, i.wsOfCard),
    liveKeys = new Set(live.map(key)),
    mineCards = cards.filter((c) => c.state === ctx.dir && i.wsOfCard(c) === ctx.ws),
    // A finished run's agent that is still open keeps its tab, as the sidebar keeps it.
    open = mineCards.filter((c) => !liveKeys.has(key(c)) && c.pty?.alive),
    sh = (x: (typeof shells)[number]): Tab => ({ id: "sh:" + x.key, kind: x.agent ? "agent" : "shell", agent: x.agent || undefined, title: x.title, key: x.key });
  // Each live run's terminals: its stage terminals ("Build · Claude"), other sessions, shells, the waiting note.
  for (const c of [...live, ...open]) {
    const k = key(c),
      runAgent = AGENTS.find((a) => a === c.pty?.agent) ?? AGENTS.find((a) => c.tags?.includes(a)) ?? undefined;
    for (const t of stageTabs(c, named(runAgent))) out.push({ id: "agent:" + t.key, kind: "agent", agent: runAgent, title: t.title, key: t.key });
    for (const x of shells.filter((x) => x.run === k)) out.push(sh(x));
    // The run's own session is running in another terminal: a tab that says so.
    if (i.elsewhere.has(k)) out.push({ id: "wait:" + k, kind: "wait", agent: "claude", title: named("claude") });
  }
  // The workspace's own shells and agents, and those of its finished runs.
  const owned = new Set(mineCards.map(key));
  for (const x of shells.filter((x) => x.run === ctx.k || (owned.has(x.run) && !liveKeys.has(x.run)))) out.push(sh(x));
  const hb = i.saved.hb,
    revive = i.serverAgents.map((a) => "agent:" + a.key).filter((id, n) => hb && id in hb && hb[id] !== (i.serverAgents[n].born ?? 0)),
    hidden = i.saved.hidden.filter((h) => !revive.includes(h)),
    // Opened by hand: History, localhost, Preview, notes. "local" was saved before the rename to Browser.
    mine = i.saved.tabs.map((t) => (t.kind === "local" ? { ...t, title: "Browser" } : t)) as Tab[],
    all = [...out.filter((t) => !hidden.includes(t.id)), ...mine];
  return { tabs: all.filter((t, n) => all.findIndex((x) => x.id === t.id) === n), revive };
}
