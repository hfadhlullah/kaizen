import { expect, test } from "bun:test";

// The router without a browser: names and addresses to views, what a phone does with them, the <body> classes and the
// address each view has; then `navigate` against a fake history.
const { bodyClasses, deepOf, litItem, pageOf, pageSeen, resolveView, runOf, startView, urlFor, viewOf, viewTitle } =
  await import("./route-rules.ts");

test("names and addresses resolve to a view; aliases and unknown names", () => {
  expect(resolveView("settings", false)).toBe("settings");
  expect(resolveView("icebox", false)).toBe("sources");
  expect(resolveView("ws", false)).toBe("run");
  expect(resolveView("ideas", false)).toBe("tasks");
  expect(resolveView(null, false)).toBe("home");
  expect(resolveView("nonsense", false)).toBe("home");
  expect(viewOf("?view=terminal&x=1", false)).toBe("terminal");
  expect(viewOf("", false)).toBe("home");
});

test("a phone has no Board or Icebox page, a computer no Chat or Runs page", () => {
  for (const v of ["board", "sources", "icebox"]) expect(resolveView(v, true)).toBe("home");
  expect(resolveView("device", true)).toBe("device");
  expect(resolveView("tasks", true)).toBe("tasks");
  expect(resolveView("chat", true)).toBe("chat");
  expect(resolveView("chat", false)).toBe("home");
  expect(resolveView("device", false)).toBe("home");
  expect(resolveView("board", false)).toBe("board");
});

test("one page area shows per view: the <body> classes", () => {
  const on = (v: any, phone = false) =>
    Object.entries(bodyClasses(v, phone))
      .filter(([, x]) => x)
      .map(([k]) => k)
      .sort();
  expect(on("board")).toEqual([]);
  expect(on("home")).toEqual(["homev", "paged"]);
  expect(on("home", true)).toEqual(["paged", "phomev"]);
  expect(on("chat", true)).toEqual(["homev", "paged"]);
  expect(on("device", true)).toEqual(["paged", "pdevv", "phomev"]);
  expect(on("sources")).toEqual(["ice", "paged"]);
  expect(on("task")).toEqual(["paged", "taskpagev"]);
  expect(on("run")).toEqual(["paged", "runv"]);
  for (const v of ["settings", "terminal", "tasks"]) expect(on(v)).toContain("paged");
});

test("addresses, lit item, title, drawn-once pages, the run an address names", () => {
  expect(urlFor("home", "/")).toBe("/");
  expect(urlFor("sources", "/")).toBe("?view=icebox");
  expect(urlFor("terminal", "/")).toBe("?view=terminal");
  expect(litItem("task", false)).toBe("tasks");
  expect(litItem("task", true)).toBe("device");
  expect(litItem("run", true)).toBe("device");
  expect(litItem("run", false)).toBe("run");
  expect(viewTitle("home", false)).toBe("Chat");
  expect(viewTitle("home", true)).toBe("kaizen");
  expect(viewTitle("sources", false)).toBe("Icebox");
  expect(viewTitle("board", false)).toBe("Board");
  expect([
    pageSeen("tasks", false),
    pageSeen("task", false),
    pageSeen("sources", false),
    pageSeen("home", false),
    pageSeen("home", true),
    pageSeen("board", false),
  ]).toEqual(["tasks", "task", "icebox", "home", "", ""]);
  expect([pageOf("tasks"), pageOf("task"), pageOf("sources"), pageOf("run")]).toEqual(["tasks", "task", "icebox", ""]);
  expect(runOf("?view=ws&dir=%2Fp&ws=%2Fp%2Fwt")).toEqual({ dir: "/p", ws: "/p/wt" });
  expect(runOf("?view=run&dir=%2Fp&id=r1")).toEqual({ dir: "/p", id: "r1" });
  expect(runOf("?view=run&dir=%2Fp&idea=do%20it")).toEqual({ dir: "/p", idea: "do it" });
  expect(runOf("?view=tasks&dir=%2Fp")).toBeNull();
  expect(runOf("?view=run")).toBeNull();
});

test("a page opens on the view its address names, on any path; the Notebook page lights the Board icon", () => {
  expect(startView("?view=tasks", false, false)).toBe("tasks");
  expect(startView("?view=settings", false, false)).toBe("settings");
  expect(startView("", true, false)).toBe("home");
  expect(startView("?view=tasks", false, true)).toBe("board");
});

test("navigate sets the store, pushes the address once, calls the engine hooks in order", async () => {
  const g = globalThis as any;
  const pushed: string[] = [];
  g.location = { search: "", pathname: "/" };
  g.matchMedia = () => ({ matches: false });
  g.history = {
    pushState: (_: unknown, __: string, u: string) => {
      pushed.push(u);
      g.location.search = u.startsWith("?") ? u : "";
    },
  };
  const { getRoute, navigate, setRouterHooks, useRoute } = await import("./route-store.ts");
  const seen: string[] = [];
  setRouterHooks({
    prepare: (v) => seen.push("prepare " + v + " from " + getRoute().view),
    leave: (v, was) => seen.push(`leave ${v} ${was}`),
    enter: (v, was) => seen.push(`enter ${v} ${was} ${getRoute().search}`),
  });
  navigate("tasks", true);
  expect(getRoute()).toMatchObject({
    view: "tasks",
    lit: "tasks",
    title: "Tasks",
    page: "tasks",
    search: "?view=tasks",
  });
  expect(getRoute().seen).toContain("tasks");
  expect(pushed).toEqual(["?view=tasks"]);
  // The same view again pushes nothing; a task and a run push their own addresses.
  navigate("tasks", true);
  navigate("task", true);
  navigate("ws", true);
  expect(pushed).toEqual(["?view=tasks"]);
  expect(getRoute().view).toBe("run");
  // Back and forward navigate without pushing; a phone's Board is Home.
  g.matchMedia = () => ({ matches: true });
  navigate("board");
  expect(getRoute()).toMatchObject({ view: "home", mark: true, title: "kaizen" });
  expect(seen.slice(0, 3)).toEqual(["prepare tasks from home", "leave tasks home", "enter tasks home ?view=tasks"]);
  // The phone menu closes on every navigation.
  useRoute.setState({ menu: true });
  navigate("tasks");
  expect(getRoute().menu).toBe(false);
});

test("a note's deep link names a card, a tab and an item; a workspace address is not one", () => {
  expect(deepOf("?run=r1&dir=/p&tab=work")).toEqual({ dir: "/p", run: "r1", idea: null, tab: "impl", item: null });
  expect(deepOf("?run=r1&dir=/p&item=finding-3")).toEqual({ dir: "/p", run: "r1", idea: null, tab: "review", item: { type: "finding", n: 3 } });
  expect(deepOf("?run=r1&dir=/p&item=backlog-2&tab=plan")).toMatchObject({ tab: "plan", item: { type: "backlog", n: 2 } });
  expect(deepOf("?idea=do+it&dir=/p")).toMatchObject({ run: null, idea: "do it", tab: "", item: null });
  expect(deepOf("?idea=&dir=/p")).toMatchObject({ idea: "" }); // an empty task text still names a task
  expect(deepOf("?view=run&idea=x&dir=/p")).toBeNull();
  expect(deepOf("?view=board")).toBeNull();
});
