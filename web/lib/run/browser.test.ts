import { expect, test } from "bun:test";
import { isLoopback, landed, navBack, navFwd, navReload, navTo, start, withScheme } from "./browser.ts";

test("going to an address keeps the old one to go back to and drops forward; the same address only reloads", () => {
  let n = navTo(start("http://a"), "http://b");
  expect(n).toMatchObject({ url: "http://b", back: ["http://a"], fwd: [], load: 1 });
  n = navTo(n, "http://b");
  expect(n).toMatchObject({ back: ["http://a"], load: 2 });
});

test("back and forward walk the history and each loads the frame; at the ends they do nothing", () => {
  const a = start("http://a");
  expect(navBack(a)).toBe(a);
  expect(navFwd(a)).toBe(a);
  let n = navTo(navTo(a, "http://b"), "http://c");
  n = navBack(n);
  expect(n).toMatchObject({ url: "http://b", back: ["http://a"], fwd: ["http://c"], load: 3 });
  n = navFwd(n);
  expect(n).toMatchObject({ url: "http://c", back: ["http://a", "http://b"], fwd: [], load: 4 });
  expect(navTo(navBack(n), "http://d").fwd).toEqual([]);
});

test("reload loads the same address without a history step", () => {
  const n = navTo(start("http://a"), "http://b");
  expect(navReload(n)).toMatchObject({ url: "http://b", back: ["http://a"], load: 2 });
});

test("a page that navigated on its own takes a history step but does not load the frame again", () => {
  const n = navTo(start("http://a"), "http://b");
  expect(landed(n, "http://b")).toBe(n);
  expect(landed(n, "http://c")).toMatchObject({ url: "http://c", back: ["http://a", "http://b"], fwd: [], load: 1 });
});

test("typed addresses get http, and loopback is told from other hosts", () => {
  expect(withScheme(" localhost:3000 ")).toBe("http://localhost:3000");
  expect(withScheme("https://x.dev")).toBe("https://x.dev");
  expect(isLoopback("http://localhost:3000/x")).toBe(true);
  expect(isLoopback("http://127.0.0.1")).toBe(true);
  expect(isLoopback("http://[::1]:80")).toBe(true);
  expect(isLoopback("http://localhost.evil.com")).toBe(false);
});
