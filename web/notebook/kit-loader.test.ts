import { afterEach, expect, test } from "bun:test";

// A page stand-in with or without <html data-kit>; the kit is whatever the page put on window.kzKit.
const g = globalThis as any;
const had = { window: g.window, document: g.document };
const page = (kit: boolean) => {
  g.window = g;
  g.document = { documentElement: { hasAttribute: (a: string) => kit && a === "data-kit" } };
};
afterEach(() => {
  // bun runs every test file in one process: put the globals back.
  delete g.kzKit;
  for (const [k, v] of Object.entries(had)) v === undefined ? delete g[k] : (g[k] = v);
});
const fresh = () => import("./kit-loader.ts?" + Math.random());

test("a page without data-kit has no kit (Video keeps the redirect)", async () => {
  page(false);
  const { kitHere, kitLive, loadKit } = await fresh();
  expect(kitHere()).toBe(false);
  expect(kitLive()).toBeNull();
  await expect(loadKit()).rejects.toThrow("no kit");
});

test("the kit the page registered is handed over at once, no request", async () => {
  page(true);
  g.kzKit = { marker: 1 };
  const { kitHere, kitLive, loadKit } = await fresh();
  expect(kitHere()).toBe(true);
  expect(kitLive()).toEqual({ marker: 1 });
  expect(await loadKit()).toEqual({ marker: 1 });
});
