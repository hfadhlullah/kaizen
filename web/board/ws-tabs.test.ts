import { expect, test } from "bun:test";
import { agentStatus, agentsHtml, forgetAgents, lineOf, settleIn, toggleOpen, wsAgents, SETTLE_MS, awaiting, dueWord, chosen, newRun, loopbackUrl, toOpen, stageKeys, stageTabs, finished, historyOf, liveIn, migrate, pickable, prune, wsKey } from "./ws-tabs.ts";

const run = (id: string, status: string, o: any = {}) => ({ kind: "run", state: "/p/.kaizen", id, status, moved: 1, ws: "/p", ...o });
const wsOf = (c) => c.ws;
const cards = [
  run("a", "waiting"),
  run("b", "building"),
  run("c", "done", { moved: 5 }),
  run("d", "abandoned", { moved: 9 }),
  run("e", "done", { accept: "needs" }), // finished, waiting on an approval: still a tab
  run("f", "building", { ws: "/p/.kaizen/wt/x" }),
  run("g", "done", { moved: 7, archived: true }),
  { kind: "idea", state: "/p/.kaizen", text: "t", kind: "run", pty: { key: "k" }, ws: "/p" },
  { kind: "idea", state: "/p/.kaizen", text: "no agent", ws: "/p" },
];

test("live runs get terminals; an idea only with its agent; a run waiting on approval stays", () => {
  expect(liveIn(cards, "/p/.kaizen", "/p", wsOf).map((c) => c.id ?? c.text)).toEqual(["a", "b", "e", "t"]);
  expect(liveIn(cards, "/p/.kaizen", "/p/.kaizen/wt/x", wsOf).map((c) => c.id)).toEqual(["f"]);
  expect(finished(cards[4])).toBe(false);
});

test("History: done and abandoned runs of the workspace, newest first, nothing else", () => {
  expect(historyOf(cards, "/p/.kaizen", "/p", wsOf).map((c) => c.id)).toEqual(["d", "g", "c"]);
  expect(historyOf(cards, "/p/.kaizen", "/p/.kaizen/wt/x", wsOf)).toEqual([]);
});

test("migrate: a run's saved layout moves to its workspace; unknown keys stay; nothing is lost", () => {
  const key = (c) => (c.kind === "idea" ? "idea:" + c.state + ":" + c.text : "run:" + c.state + ":" + c.id);
  const all: any = {
    "run:/p/.kaizen:a": { tabs: [{ id: "local" }], hidden: ["agent:1"], screens: [{ id: "s1", tree: "local", focus: "local" }], on: "s1" },
    "run:/p/.kaizen:b": { tabs: [{ id: "local" }, { id: "preview" }], hidden: [], screens: [{ id: "s2", tree: { dir: "cols", kids: ["local", "preview"], sizes: [1, 1] }, focus: "local" }], on: "s2" },
    "run:/p/.kaizen:gone": { tabs: [{ id: "note:x" }], hidden: [], screens: [], on: null },
    "kz-other": { tabs: [], hidden: [], screens: [], on: null },
  };
  expect(migrate(all, cards, key, wsOf)).toBe(true);
  const to = all[wsKey("/p/.kaizen", "/p")];
  expect(to.tabs.map((t) => t.id)).toEqual(["local", "preview"]);
  expect(to.hidden).toEqual(["agent:1"]);
  // "local" is in the first screen already: the second keeps only "preview"
  expect(to.screens.map((s) => s.tree)).toEqual(["local", "preview"]);
  expect(to.on).toBe("s1");
  expect(Object.keys(all).sort()).toEqual(["kz-other", "run:/p/.kaizen:gone", wsKey("/p/.kaizen", "/p")].sort());
  expect(migrate(all, cards, key, wsOf)).toBe(false); // once
});

test("awaiting: waiting, accept-needed and asking runs are not closable; a building run is", () => {
  expect(awaiting(run("a", "waiting"))).toBe(true);
  expect(awaiting(run("e", "done", { accept: "needs" }))).toBe(true);
  expect(awaiting(run("p", "building", { kind: "run", pty: { alive: true, asking: true } }))).toBe(true);
  expect(awaiting(run("b", "building"))).toBe(false);
  expect(awaiting(run("c", "done"))).toBe(false);
});
test("stageKeys: recorded impl/review terminals; plan is the unclaimed first agent until a stage is launched", () => {
  expect(stageKeys({ kind: "run", column: 1, pty: { all: ["a"] } })).toEqual({ plan: "a" });
  // A lone unrecorded session is named by the run's current stage, never a wrong one; plain when that is unknown.
  expect(stageKeys({ kind: "run", column: 2, pty: { all: ["a"] } })).toEqual({ impl: "a" });
  expect(stageKeys({ kind: "run", column: 3, pty: { all: ["a"] } })).toEqual({ review: "a" });
  expect(stageKeys({ kind: "run", column: 4, pty: { all: ["a"] } })).toEqual({});
  expect(stageTabs({ kind: "run", column: 2, pty: { all: ["a"] } }, "Claude Code")).toEqual([{ key: "a", title: "Build · Claude Code" }]);
  expect(stageTabs({ kind: "run", column: 4, pty: { all: ["a"] } }, "Claude Code")).toEqual([{ key: "a", title: "Claude Code" }]);
  expect(stageKeys({ kind: "run", pty: { all: ["a", "b"], stages: { impl: "b" } } })).toEqual({ impl: "b" });
  expect(stageKeys({ kind: "run", pty: { all: ["b", "c"], stages: { impl: "b", review: "c" } } })).toEqual({ impl: "b", review: "c" });
  expect(stageKeys({ kind: "run", pty: { all: ["x"], stages: { impl: "gone" } } })).toEqual({});
  expect(stageKeys({ kind: "run", pty: { all: ["p", "b"], stages: { plan: "p", impl: "b" } } })).toEqual({ plan: "p", impl: "b" });
  expect(stageKeys({ kind: "run", pty: { all: ["p", "x"], stages: { plan: "p" } } })).toEqual({ plan: "p" });
  expect(stageKeys({ kind: "idea", pty: { all: ["a"] } })).toEqual({});
});

test("loopbackUrl: the first localhost address in a Preview; other hosts and none give undefined", () => {
  expect(loopbackUrl("Run `bun dev`, open http://localhost:5173/app) now")).toBe("http://localhost:5173/app");
  expect(loopbackUrl("see [x](http://127.0.0.1:8080)")).toBe("http://127.0.0.1:8080");
  expect(loopbackUrl("http://[::1]:3000/")).toBe("http://[::1]:3000/");
  expect(loopbackUrl("https://example.com/ and ![shot](a.png)")).toBeUndefined();
  expect(loopbackUrl(null)).toBeUndefined();
});

test("toOpen: a run that moves into review or done opens the Browser once; others do not", () => {
  const cs = [run("a", "running", { column: 2 }), run("b", "waiting", { column: 3 }), run("c", "done", { column: 4 }), run("e", "abandoned", { column: 4 })];
  const key = (c) => c.id;
  expect(toOpen(cs, new Set(), [], key).map(key)).toEqual(["b", "c"]);
  expect(toOpen(cs, new Set(["b"]), [], key).map(key)).toEqual(["c"]); // b was already reviewing
  expect(toOpen(cs, new Set(), ["c"], key).map(key)).toEqual(["b"]); // c already opened once
});

test("pickable: waiting first, then newest; done+approved, abandoned, archived and ideas are not listed", () => {
  const cs = [run("old", "building", { moved: 1 }), run("new", "building", { moved: 9 }), run("w", "waiting", { moved: 2 }), run("e", "done", { accept: "needs", moved: 3 }), ...cards.slice(2, 4), cards[6], cards[7], cards[5]];
  expect(pickable(cs, "/p/.kaizen", "/p", wsOf).map((c) => c.id)).toEqual(["e", "w", "new", "old"]);
  expect(pickable(cs, "/p/.kaizen", "/p/.kaizen/wt/x", wsOf).map((c) => c.id)).toEqual(["f"]);
});

test("newRun: only a listed run not seen yet, first in picker order", () => {
  const live = [run("w", "waiting"), run("b", "building")];
  expect(newRun(live, new Set(["w", "b"]))).toBeUndefined();
  expect(newRun(live, new Set(["w"]))?.id).toBe("b");
  expect(newRun(live, new Set())?.id).toBe("w");
});

test("chosen: the pick stays while pickable or History, else the first, else none", () => {
  const live = [run("w", "waiting"), run("b", "building")],
    hist = [run("d", "done")];
  expect(chosen(live, hist, "b")?.id).toBe("b"); // sticky: a waiting run does not replace it
  expect(chosen(live, hist, "d")?.id).toBe("d"); // History pick, read-only
  expect(chosen(live, hist, "gone")?.id).toBe("w");
  expect(chosen(live, hist)?.id).toBe("w"); // a fresh visit drops the pick: back to waiting first
  expect(chosen([], hist, "x")).toBeNull();
  expect(chosen([], [], null)).toBeNull();
});

test("stageTabs: stage terminals are named by stage, the rest numbered by the agent", () => {
  const c = { kind: "run", pty: { all: ["p", "b", "x", "y"], stages: { plan: "p", impl: "b" } } };
  expect(stageTabs(c, "Claude")).toEqual([{ key: "p", title: "Plan · Claude" }, { key: "b", title: "Build · Claude" }, { key: "x", title: "Claude 1" }, { key: "y", title: "Claude 2" }]);
  expect(stageTabs({ kind: "run", pty: { all: ["r", "z"], stages: { impl: "z", review: "r" } } }, "Codex").map((t) => t.title)).toEqual(["Review · Codex", "Build · Codex"]);
  expect(stageTabs({ kind: "idea", pty: { key: "k" } }, "Claude")).toEqual([{ key: "k", title: "Claude" }]);
  expect(stageTabs({ kind: "run" }, "Claude")).toEqual([]);
});

test("a done, approved run with a commit or push still to do stays pickable (waiting); once pushed it is History", () => {
  const cs = [run("u", "done", { git: "pending", moved: 1 }), run("p", "done", { git: "pushed" }), run("n", "done", { accept: "needs", moved: 0 }), run("x", "done", { git: "pending", archived: true })];
  expect(pickable(cs, "/p/.kaizen", "/p", wsOf).map((c) => c.id)).toEqual(["u", "n"]);
  expect(historyOf(cs, "/p/.kaizen", "/p", wsOf).map((c) => c.id)).toEqual(["p", "x"]);
  expect(dueWord(cs[0])).toBe("commit");
  expect(dueWord({ ...cs[0], gitDue: "push" })).toBe("push");
  expect(awaiting(cs[0])).toBe(true);
  expect(awaiting(cs[1])).toBe(false);
});

const ag = (key: string, o: any = {}) => ({ key, dir: "/p/.kaizen", ws: "/p", agent: "claude", name: "Claude", asking: false, busy: false, ...o });

test("agent status: working at once, done only after 3 s quiet, asking first and immediate", () => {
  const seen = new Map<string, number>();
  expect(agentStatus(ag("a", { busy: true }), 0, seen)).toBe("working");
  expect(agentStatus({ ...ag("a"), born: 5 }, 100, seen)).toBe("done"); // the same key, started again: not the old one
  expect(agentStatus(ag("a"), 1000, seen)).toBe("working"); // a burst, then 1 s of silence
  expect(settleIn([ag("a")], 1000, seen)).toBe(SETTLE_MS - 1000);
  expect(agentStatus(ag("a"), SETTLE_MS - 1, seen)).toBe("working");
  expect(agentStatus(ag("a"), SETTLE_MS, seen)).toBe("done");
  expect(settleIn([ag("a")], SETTLE_MS, seen)).toBe(Infinity);
  expect(agentStatus(ag("a", { busy: true }), 5000, seen)).toBe("working");
  expect(agentStatus(ag("a", { asking: true, busy: true }), 5001, seen)).toBe("asking");
  expect(agentStatus(ag("never"), 1, seen)).toBe("done"); // an idle agent never seen busy
  forgetAgents([ag("never")], seen);
  expect([...seen.keys()]).toEqual([]);
});

test("a workspace's agents: its own only, asking then working then done; a lost worktree falls back to the main row", () => {
  const seen = new Map<string, number>(),
    wsOf = (c) => (c.ws === "/gone" ? "/p" : c.ws);
  const list = [ag("d1"), ag("w1", { busy: true }), ag("q1", { asking: true }), ag("x", { ws: "/p/wt" }), ag("y", { dir: "/o/.kaizen" }), ag("g", { ws: "/gone" })];
  expect(wsAgents(list, "/p/.kaizen", "/p", wsOf, 0, seen).map((r) => r.a.key + ":" + r.st)).toEqual(["q1:asking", "w1:working", "d1:done", "g:done"]);
  expect(wsAgents(list, "/p/.kaizen", "/p/wt", wsOf, 0, seen).map((r) => r.a.key)).toEqual(["x"]);
});

test("expanded state toggles per workspace", () => {
  const m: Record<string, true> = {};
  expect(Object.keys(toggleOpen(m, "/p/.kaizen", "/p"))).toEqual(["/p/.kaizen\0/p"]);
  expect(toggleOpen(m, "/p/.kaizen", "/p")).toEqual({});
});

test("card html: one agent has no chevron; several group chips; expanded lists rows; the typed or agent line is escaped", () => {
  const rows = (...a: any[]) => wsAgents(a, "/p/.kaizen", "/p", (c) => c.ws, 0, new Map());
  const one = String(agentsHtml(rows(ag("a", { at: 1 })), 1e5, false, "/p/.kaizen", "/p"));
  expect(one).toContain("Done - Claude");
  expect(one).not.toContain("wchev");
  const many = String(agentsHtml(rows(ag("a"), ag("b", { busy: true }), ag("c", { agent: "x", name: "Other" })), 0, false, "/p/.kaizen", "/p"));
  expect(many.match(/class="chip"/g)!.length).toBe(2); // working, done
  expect(many.indexOf("si build")).toBeLessThan(many.indexOf("si done"));
  expect(many.match(/data-term=/g)!.length).toBe(3);
  expect(many).toContain('aria-expanded="false"');
  const evil = '<img src=x onerror="alert(1)"> & <b>x</b>';
  const open = String(agentsHtml(rows(ag("a", { last: evil }), ag("b")), 0, true, "/p/.kaizen", "/p"));
  expect(open).toContain("2 agents");
  expect(open).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &lt;b&gt;x&lt;/b&gt;");
  expect(open).not.toContain("<img");
  expect(open).not.toContain("<b>");
  expect(lineOf(rows(ag("z"))[0])).toBe("Done - Claude");
});

test("prune keeps a split node it drops nothing from, so a gutter drag writes to the live layout", () => {
  const inner = { dir: "rows" as const, kids: ["b", "c"], sizes: [1, 1] };
  const tree = { dir: "cols" as const, kids: ["a", inner], sizes: [2, 1] };
  expect(prune(tree, () => true)).toBe(tree);
  const cut = prune(tree, (id) => id !== "c") as any;
  expect(cut).not.toBe(tree);
  expect(cut.kids).toEqual(["a", "b"]);
  expect(cut.sizes).toEqual([2, 1]);
});

test("a terminal that carried plan and build is named for the run's stage", () => {
  const c = { kind: "run", column: 2, pty: { all: ["a"], stages: { plan: "a", impl: "a" } } };
  expect(stageTabs(c, "Claude")).toEqual([{ key: "a", title: "Build · Claude" }]);
  expect(stageTabs({ ...c, column: 3 }, "Claude")[0].title).toBe("Review · Claude");
});
