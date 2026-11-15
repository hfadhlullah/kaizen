import { expect, test } from "bun:test";
import {
  heaviest,
  memParts,
  ringDash,
  shareOf,
  shortCmd,
  size,
  sparkPoints,
  topParts,
  usedPct,
  wsName,
  type Resources,
} from "./rules.ts";

const res: Resources = { system: { used: 6 * 1024 ** 3, total: 16 * 1024 ** 3 }, kaizen: 2 * 1024 ** 3, terminals: [] };

test("sizes read in KB, MB or GB", () => {
  expect(size(2048)).toBe("2 KB");
  expect(size(5 * 1024 ** 2)).toBe("5 MB");
  expect(size(1.5 * 1024 ** 3)).toBe("1.5 GB");
});

test("memory is three parts that add up to the total, with the used share for the ring", () => {
  expect(usedPct(res)).toBe(38);
  const parts = memParts(res);
  expect(parts.map((p) => p[0])).toEqual(["Kaizen and its terminals", "Other apps", "Free"]);
  expect(parts.reduce((n, p) => n + p[1], 0)).toBe(res.system.total);
  expect(shareOf(parts, parts[0]![1])).toBe(13);
  expect(ringDash(50)).toBe("47.1");
  // Kaizen above what the system reports as used: Other apps never goes negative
  expect(memParts({ ...res, kaizen: res.system.used + 5 })[1]![1]).toBe(0);
});

test("storage shows the four largest rows and folds the rest into Other", () => {
  const rows = ["a", "b", "c", "d", "e", "f"].map((name, i) => ({ name, bytes: 100 - i }));
  expect(topParts(rows.slice(0, 4)).length).toBe(4);
  const top = topParts(rows);
  expect(top.map((p) => p[0])).toEqual(["a", "b", "c", "d", "Other"]);
  expect(top[4]![1]).toBe(96 + 95);
});

test("terminals are listed heaviest first, a terminal with no size last", () => {
  const t = (key: string, rss?: number | null) => ({ key, title: key, ws: "/p", rss });
  expect(heaviest([t("a", 1), t("b", null), t("c", 9)]).map((x) => x.key)).toEqual(["c", "a", "b"]);
  expect(wsName({ ...t("x"), ws: "/p/wt/feat", project: "kaizen" })).toBe("kaizen / feat");
  expect(wsName(t("x"))).toBe("Home / p");
});

test("the sparkline needs two points and stays inside its box", () => {
  expect(sparkPoints([10])).toBeNull();
  const s = sparkPoints([0, 100])!;
  expect(s.line).toBe("0.0,36.0 100.0,2.0");
  expect(s.area.startsWith("0,36 ")).toBe(true);
  expect(s.area.endsWith(" 100,36")).toBe(true);
});

test("a port's command reads short", () => {
  expect(shortCmd("/usr/bin/node /app/node_modules/.bin/vite --port 5173")).toBe("node /app/node_modules/.bin/vite --port 5173");
  expect(shortCmd("/home/u/.local/bin/bun run dev")).toBe("bun run dev");
  expect(shortCmd("python3 -m http.server 8000")).toBe("python3 -m http.server 8000");
  expect(shortCmd("node " + "x".repeat(100), 20)).toHaveLength(20);
});
