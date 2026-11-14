import { expect, test } from "bun:test";
import type { RailData } from "@lib/rail";
import {
  agentGroups,
  askingCount,
  groupKey,
  homeStats,
  recentRuns,
  resets,
  runGroups,
  shownDevices,
  subline,
  usageLevel,
  usageList,
} from "./phone-home.ts";

const run = (id: string, o: any = {}) => ({
  kind: "run",
  id,
  state: "/p/.kaizen",
  status: "running",
  column: 2,
  moved: 1,
  ...o,
});
const data = (cards: any[]): RailData => ({ cards, projects: [], agents: [], tasks: null });
const agent = (key: string, o: any = {}) => ({
  key,
  dir: "/p/.kaizen",
  ws: "/p",
  name: key,
  asking: false,
  busy: false,
  ...o,
});
const NOW = 1_000_000;

test("agents group by workspace, the one asking first, then working, then done", () => {
  const groups = agentGroups(
    [
      agent("a", { ws: "/p" }),
      agent("b", { ws: "/q", busy: true }),
      agent("c", { ws: "/r", asking: true }),
      agent("d", { ws: "/q", asking: true }),
    ],
    NOW,
  );
  // both asking groups lead, in the order the agents arrived; the idle one is last
  expect(groups.map((g) => g.k)).toEqual([
    groupKey(agent("b", { ws: "/q" })),
    groupKey(agent("c", { ws: "/r" })),
    groupKey(agent("a")),
  ]);
  // the /q group holds two agents, the asking one leading
  const q = groups.find((g) => g.k.endsWith("/q"))!;
  expect(q.rows.map((r) => r.a.key)).toEqual(["d", "b"]);
  expect(askingCount(groups)).toBe(2);
});

test("this computer's line counts projects, runs going and runs waiting on you", () => {
  const d = data([
    run("1"),
    run("2", { status: "waiting" }),
    run("3", { status: "done", accept: "auto" }),
    run("4", { state: "/o/.kaizen", archived: true }),
    { kind: "idea", state: "/p/.kaizen", text: "a task" },
  ]);
  expect(homeStats(d)).toEqual({ projects: 1, active: 2, waiting: 1 });
});

test("Home lists the twelve runs that moved last", () => {
  const cards = Array.from({ length: 15 }, (_, i) => run("r" + i, { moved: i }));
  const r = recentRuns(cards);
  expect(r).toHaveLength(12);
  expect(r[0].id).toBe("r14");
});

test("the Runs page sorts into Waiting, Active, Tasks and Done, newest first", () => {
  const g = runGroups(
    data([
      run("a", { moved: 1 }),
      run("b", { moved: 5, status: "waiting" }),
      run("c", { moved: 3, status: "done", accept: "auto" }),
      run("d", { moved: 9 }),
      { kind: "idea", state: "/p/.kaizen", text: "old", moved: 1 },
      { kind: "idea", state: "/p/.kaizen", text: "new", moved: 7 },
    ]),
  );
  expect(g.wait.map((c) => c.id)).toEqual(["b"]);
  expect(g.active.map((c) => c.id)).toEqual(["d", "a"]);
  expect(g.done.map((c) => c.id)).toEqual(["c"]);
  expect(g.tasks.map((c) => c.text)).toEqual(["new", "old"]);
  expect(g.none).toBe(false);
  expect(runGroups(data([])).none).toBe(true);
});

test("two devices show, this computer first; the rest wait behind Show more", () => {
  const c = ["a", "b", "c"].map((name) => ({ name, dns: name, os: "", online: true }));
  expect(shownDevices(c, false)).toEqual({ list: [c[0]], hidden: 2 });
  expect(shownDevices(c, true).list).toHaveLength(3);
  expect(shownDevices([], false)).toEqual({ list: [], hidden: -1 });
});

test("the line under a run says what it waits on, else its stage and age", () => {
  expect(subline(run("x", { status: "waiting", awaiting: "approvals.plan", column: 1 }), NOW)).toBe(
    "planning · plan needs your approval",
  );
  expect(subline(run("x", { status: "waiting" }), NOW)).toBe("waiting on you");
  expect(subline(run("x", { status: "done", accept: "needs" }), NOW)).toBe("done, not approved");
  expect(subline({ kind: "idea", state: "x", text: "t" }, NOW)).toBe("idea");
  expect(subline(run("x"), NOW, { attention: { reason: "Needs a reply", action: "Answer" } })).toBe(
    "Needs a reply · Answer",
  );
  expect(subline(run("x", { status: "stalled", moved: NOW - 5 * 60_000 }), NOW)).toMatch(/^stalled · /);
});

test("usage chips list Claude and Codex, coloured by how full the window is", () => {
  expect(usageList([{ agent: "claude" }, { agent: "other" }, { agent: "codex" }]).map((u) => u.agent)).toEqual([
    "claude",
    "codex",
  ]);
  expect([usageLevel(10), usageLevel(80), usageLevel(95)]).toEqual(["", "mid", "hi"]);
  expect(resets(undefined)).toBe("unknown");
});
