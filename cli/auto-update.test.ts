import { test, expect } from "bun:test";
import { autoUpdateDue, autoUpdateTick, type Deps } from "./auto-update.ts";

const base = { on: true, desktop: false, upgrading: false, newer: true, terminalsAlive: false, pagesOpen: false };
test("it goes only when on, newer, nothing running, no page open and not the desktop app", () => {
  expect(autoUpdateDue(base)).toBe("go");
  expect(autoUpdateDue({ ...base, on: false })).toBe("off");
  expect(autoUpdateDue({ ...base, newer: false })).toBe("current");
  expect(autoUpdateDue({ ...base, terminalsAlive: true })).toBe("agents");
  expect(autoUpdateDue({ ...base, pagesOpen: true })).toBe("page");
  expect(autoUpdateDue({ ...base, desktop: true })).toBe("desktop");
  expect(autoUpdateDue({ ...base, upgrading: true })).toBe("busy");
  // the switch is asked first
  expect(autoUpdateDue({ ...base, on: false, terminalsAlive: true, desktop: true, pagesOpen: true })).toBe("off");
});

// The tick with fakes: what it asks, in what order, and whether it upgrades.
function fake(o: Partial<{ on: boolean; latest: string | null; terminals: boolean; pages: boolean; desktop: boolean; upgrading: boolean }> = {}) {
  const calls: string[] = [];
  const d: Deps = {
    on: async () => (calls.push("on"), o.on ?? true),
    latest: async () => (calls.push("npm"), o.latest === undefined ? "1.88.0" : o.latest),
    newer: (v) => v === "1.88.0",
    desktop: o.desktop ?? false,
    upgrading: () => o.upgrading ?? false,
    terminalsAlive: () => o.terminals ?? false,
    pagesOpen: () => o.pages ?? false,
    upgrade: async () => void calls.push("UPGRADE"),
  };
  return { d, calls };
}
test("the tick upgrades exactly when due, and asks npm only when the switch is on", async () => {
  let f = fake(); expect(await autoUpdateTick(f.d)).toBe("go"); expect(f.calls).toEqual(["on", "npm", "UPGRADE"]);
  f = fake({ on: false }); expect(await autoUpdateTick(f.d)).toBe("off"); expect(f.calls).toEqual(["on"]);          // no npm call when off
  f = fake({ latest: null }); expect(await autoUpdateTick(f.d)).toBe("current"); expect(f.calls).toEqual(["on", "npm"]); // npm unreachable
  f = fake({ latest: "1.87.0" }); expect(await autoUpdateTick(f.d)).toBe("current");
  f = fake({ terminals: true }); expect(await autoUpdateTick(f.d)).toBe("agents"); expect(f.calls).not.toContain("UPGRADE");
  f = fake({ pages: true }); expect(await autoUpdateTick(f.d)).toBe("page"); expect(f.calls).not.toContain("UPGRADE");
  f = fake({ desktop: true }); expect(await autoUpdateTick(f.d)).toBe("desktop"); expect(f.calls).not.toContain("UPGRADE");
  f = fake({ upgrading: true }); expect(await autoUpdateTick(f.d)).toBe("busy"); expect(f.calls).not.toContain("UPGRADE");
});
