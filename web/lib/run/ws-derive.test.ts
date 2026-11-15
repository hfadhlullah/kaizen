import { expect, test } from "bun:test";
import { deriveTabs, type DeriveIn } from "./ws-derive.ts";
import { EMPTY } from "./layout-store.ts";

const ctx = { dir: "/p", ws: "/p/wt", k: "/p\n/p/wt" };
const base = (o: Partial<DeriveIn> = {}): DeriveIn => ({
  ctx, cards: [], shells: [], agents: [{ name: "Claude", cmd: "claude" }], serverAgents: [], elsewhere: new Set(), saved: EMPTY,
  wsOfCard: () => "/p/wt", key: (c) => c.id, ...o,
});
const run = (o: any = {}) => ({ kind: "run", id: "r1", state: "/p", status: "building", column: 2, ...o });

test("a workspace with nothing open has no tabs", () => {
  expect(deriveTabs(base())).toEqual({ tabs: [], revive: [] });
});

test("shells of the workspace and of a live run become tabs, other workspaces' do not", () => {
  const shells = [
    { key: "a", run: ctx.k, title: "Shell" },
    { key: "b", run: "r1", title: "Shell 2" },
    { key: "c", run: "elsewhere", title: "Other" },
  ];
  const { tabs } = deriveTabs(base({ shells, cards: [run()] }));
  expect(tabs.map((t) => t.id)).toEqual(["sh:b", "sh:a"]);
});

test("an agent started as a shell is an agent tab", () => {
  const { tabs } = deriveTabs(base({ shells: [{ key: "a", run: ctx.k, title: "Claude", agent: "claude" }] }));
  expect(tabs[0]).toMatchObject({ id: "sh:a", kind: "agent", agent: "claude" });
});

test("a run whose session is open elsewhere gets a wait tab", () => {
  const { tabs } = deriveTabs(base({ cards: [run()], elsewhere: new Set(["r1"]) }));
  expect(tabs).toContainEqual({ id: "wait:r1", kind: "wait", agent: "claude", title: "Claude" });
});

test("tabs opened by hand follow the terminals; a saved local tab is the Browser; duplicates go", () => {
  const saved = { ...EMPTY, tabs: [{ id: "local", kind: "local", title: "localhost" }, { id: "sh:a", kind: "shell", title: "dup", key: "a" }] };
  const { tabs } = deriveTabs(base({ saved, shells: [{ key: "a", run: ctx.k, title: "Shell" }] }));
  expect(tabs.map((t) => [t.id, t.title])).toEqual([["sh:a", "Shell"], ["local", "Browser"]]);
});

test("a closed agent tab stays hidden, and returns when the agent was born again", () => {
  const saved = { ...EMPTY, hidden: ["sh:a", "agent:k1"], hb: { "agent:k1": 5 } };
  const shells = [{ key: "a", run: ctx.k, title: "Shell" }];
  expect(deriveTabs(base({ saved, shells, serverAgents: [{ key: "k1", born: 5 }] }))).toEqual({ tabs: [], revive: [] });
  expect(deriveTabs(base({ saved, shells, serverAgents: [{ key: "k1", born: 6 }] })).revive).toEqual(["agent:k1"]);
});

test("a finished run's shell keeps its tab in the workspace that owns it", () => {
  const done = run({ status: "abandoned", pty: { alive: false } });
  const shells = [{ key: "x", run: "r1", title: "Shell" }];
  expect(deriveTabs(base({ cards: [done], shells })).tabs.map((t) => t.id)).toEqual(["sh:x"]);
  expect(deriveTabs(base({ shells })).tabs).toEqual([]); // no card owns run r1 here: not this workspace's
});
