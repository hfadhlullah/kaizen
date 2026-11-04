import { test, expect } from "bun:test";
import { accept, mapUrl, safeCrop } from "./annotate-lib.ts";

const win = {};
const good = { source: win, origin: "http://127.0.0.1:5000", data: { kz: 1, t: "tok", type: "note" } };

test("a page message counts only from the frame, the proxy origin and the token", () => {
  expect(accept(good, win, "http://127.0.0.1:5000", "tok")).toBe(true);
  expect(accept({ ...good, source: {} }, win, "http://127.0.0.1:5000", "tok")).toBe(false);
  expect(accept({ ...good, origin: "http://127.0.0.1:7431" }, win, "http://127.0.0.1:5000", "tok")).toBe(false);
  expect(accept({ ...good, data: { ...good.data, t: "other" } }, win, "http://127.0.0.1:5000", "tok")).toBe(false);
  expect(accept({ ...good, data: { t: "tok" } }, win, "http://127.0.0.1:5000", "tok")).toBe(false);
  expect(accept({ ...good, data: null }, win, "http://127.0.0.1:5000", "tok")).toBe(false);
  expect(accept(good, win, "", "tok")).toBe(false);
});

test("the proxy address is shown as the app's own", () => {
  expect(mapUrl("http://127.0.0.1:5000/a?b=1#c", "http://127.0.0.1:5000", "http://localhost:4321")).toBe("http://localhost:4321/a?b=1#c");
  expect(mapUrl("https://other.test/x", "http://127.0.0.1:5000", "http://localhost:4321")).toBeNull();
  expect(mapUrl("javascript:alert(1)", "http://127.0.0.1:5000", "http://localhost:4321")).toBeNull();
  expect(mapUrl("not a url", "http://127.0.0.1:5000", "http://localhost:4321")).toBeNull();
});

test("a crop from the page is only ever a PNG data URL, never markup", () => {
  expect(safeCrop("data:image/png;base64,iVBORw0KGgo=")).toBeDefined();
  expect(safeCrop('data:image/png;base64,AAAA" onerror="alert(1)')).toBeUndefined();
  expect(safeCrop("javascript:alert(1)")).toBeUndefined();
  expect(safeCrop("data:image/svg+xml;base64,AAAA")).toBeUndefined();
  expect(safeCrop(42)).toBeUndefined();
});
