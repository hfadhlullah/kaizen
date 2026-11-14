// The redraw of the run workspace: which tabs it has now (ws-derive.ts over the server and layout stores), what the tab bar,
// the panes and the panel's picker are handed (run-view-store), and the pick of the run the panel shows. Called after every
// change of the tabs, a layout or the server's cards.
import { age } from "@lib/core";
import { cardState as stateOf, titleOf, wsOfCardNow as wsOfCard } from "@lib/rail";
import { cardKey as key, getServer } from "@lib/server";
import { openPanel } from "./panel-actions.ts";
import { deriveTabs, type Tab } from "./ws-derive.ts";
import { awaiting, chosen, dueWord, gitDue, historyOf, leaves, liveIn, newRun, pickable } from "./ws-tabs.ts";
import { evict, touch } from "./kept.ts";
import { getWs, cx, edit, saved, setWs } from "./ws-store.ts";
import { placeItems, setPanel, getPanel, setRunView } from "./index.ts";

export const wsCards = () => (getWs().ctx ? liveIn(getServer().state.cards, cx().dir, cx().ws, wsOfCard) : []);
export const mineNow = () => getServer().state.cards.filter((c) => c.state === cx().dir && wsOfCard(c) === cx().ws);
export function tabs(): Tab[] {
  const w = getWs(),
    { tabs: out, revive } = deriveTabs({
      ctx: cx(), cards: getServer().state.cards, shells: w.shells, agents: w.agents, serverAgents: getServer().state.agents ?? [],
      elsewhere: new Set(w.elsewhere), saved: saved(), wsOfCard, key,
    });
  if (revive.length) edit((s) => ({ ...s, hidden: s.hidden.filter((h) => !revive.includes(h)), hb: Object.fromEntries(Object.entries(s.hb ?? {}).filter(([x]) => !revive.includes(x))) }));
  return out;
}

// The run panel (#panel) stays docked on the right of the centre and shows one run: the one picked
// in its header (run-pick.ts), first the run waiting on you, else the newest. A pick is sticky; a
// run that starts waiting later does not replace it: the picker's trigger and, with the panel
// collapsed, the panel button show a dot. Only a run created during the visit takes the pick
// (followNew). With no run the panel is parked.
export const picked = new Map<string, string>();
// Every card seen in the workspace this visit. It only grows, so a restored run or a /state tick
// missing cards never reads as new.
export const seenRuns = new Map<string, Set<string>>();
export function followNew() {
  const seen = getWs().ctx && seenRuns.get(cx().k);
  if (!seen) return;
  const c = newRun(pickable(getServer().state.cards, cx().dir, cx().ws, wsOfCard), seen, key);
  for (const m of mineNow()) seen.add(key(m));
  if (c) picked.set(cx().k, key(c));
}
// Shows a run in the panel (a picker row, a History row); the centre stays as it is.
export const pickRun = (k: string) => (picked.set(cx().k, k), draw());

export function draw() {
  const ts = tabs(),
    ctx = cx();
  // Every item sits in exactly one screen: new ones are placed, closed ones leave.
  placeItems(ctx.k, ts.map((t) => t.id));
  const s = saved(),
    scs = s.screens,
    cur = scs.find((sc) => sc.id === s.on);
  const item = (id: string) => ts.find((t) => t.id === id)!;
  // The chrome and the panes are React (components/run): they are handed what to show, never an element. A pane is
  // made once per item and kept (hidden while its screen is not shown), so terminals never reconnect.
  const now = Date.now(),
    w = getWs();
  setRunView({
    message: null,
    screens: scs.map((sc) => {
      const ids = leaves(sc.tree),
        { id, kind, title, agent } = item(ids[0]);
      return { id: sc.id, ids, focus: sc.focus, title: ids.map((x) => item(x).title).join(" + "), first: { id, kind, title, agent } };
    }),
    on: s.on,
    split: !!cur,
    agents: w.agents,
    defAgent: w.defAgent,
    pty: !w.noPty,
    titles: Object.fromEntries(ts.map((t) => [t.id, t.title])),
    items: ts,
    wsk: ctx.k,
    ws: ctx,
    history: historyOf(getServer().state.cards, ctx.dir, ctx.ws, wsOfCard).map((c) => ({ k: key(c), title: titleOf(c), state: stateOf(c), line: `${c.status} · ${age(c.moved ?? now, now)} ago` })),
    empty: !scs.length,
  });
  // Every pane stays mounted when the workspace is left, up to the cap (kept.ts): this one is the most recent.
  setRunView((v) => {
    const recent = touch(v.recent, ctx.k).slice(-32);
    return { recent, kept: evict({ ...v.kept, [ctx.k]: { items: ts, ws: ctx } }, recent, ctx.k) };
  });
  mountPanel();
}

export function mountPanel() {
  const ctx = cx(),
    live = pickable(getServer().state.cards, ctx.dir, ctx.ws, wsOfCard),
    hist = historyOf(getServer().state.cards, ctx.dir, ctx.ws, wsOfCard),
    c = chosen(live, hist, picked.get(ctx.k), key);
  setPanel({ parked: !c });
  // Collapsed (a phone: sheet down) and a run waits: a dot on the panel button, no pop-open.
  setRunView({ awaiting: live.some(awaiting) });
  if (!c) return void (setWs({ card: null }), setRunView({ picker: null }));
  picked.set(ctx.k, key(c));
  setPanel({ ro: hist.includes(c) }); // a run from History: no edit buttons (the commit and push ones stay)
  setWs({ card: c });
  // The picker is React (components/run/run-picker.tsx): the run shown, a dot when another needs you, the runs, then History.
  const now = Date.now(),
    row = (r) => ({ k: key(r), title: titleOf(r), state: stateOf(r), line: `${gitDue(r) ? `waiting on you · ${dueWord(r)}` : awaiting(r) ? "needs you" : r.status} · ${age(r.moved ?? now, now)}` });
  setRunView({ picker: { cur: row(c), live: live.map(row), hist: hist.map(row), other: live.some((r) => r !== c && awaiting(r)) } });
  if (getPanel().openKey !== key(c)) openPanel(c);
}
