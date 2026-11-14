import { afterEach, expect, test } from "bun:test";

// A page stand-in: head.append runs the element's onload (or onerror) as the browser would once the file came.
const g = globalThis as any;
const had = { window: g.window, document: g.document, HTMLLinkElement: g.HTMLLinkElement };
function page(o: { kit: boolean; fail?: boolean; start?: boolean }) {
  const added: any[] = [];
  g.window = g;
  g.HTMLLinkElement = class {};
  g.document = {
    documentElement: { hasAttribute: (a: string) => o.kit && a === "data-kit" },
    createElement: (t: string) => (t === "link" ? Object.assign(new g.HTMLLinkElement(), {}) : {}),
    head: {
      append: (el: any) => {
        added.push(el);
        queueMicrotask(() => {
          if (o.fail) return el.onerror();
          if (el.src && o.start !== false) g.kzKit = { marker: 1 };
          el.onload();
        });
      },
    },
  };
  return added;
}
afterEach(() => {
  // bun runs every test file in one process: put the globals back.
  delete g.kzKit;
  for (const [k, v] of Object.entries(had)) v === undefined ? delete g[k] : (g[k] = v);
});
const fresh = () => import("./kit-loader.ts?" + Math.random());

test("a page without data-kit never loads it (Video keeps the redirect)", async () => {
  const added = page({ kit: false });
  const { kitHere, loadKit } = await fresh();
  expect(kitHere()).toBe(false);
  await expect(loadKit()).rejects.toThrow("no kit");
  expect(added).toEqual([]);
});

test("loads the stylesheet and the script once, however often it is asked", async () => {
  const added = page({ kit: true });
  const { loadKit, kitLive } = await fresh();
  expect(kitLive()).toBeNull();
  const [a, b] = await Promise.all([loadKit(), loadKit()]);
  expect(a).toBe(b);
  expect((a as any).marker).toBe(1);
  expect(added.map((e) => e.href ?? e.src)).toEqual(["/ui.css", "/notebook-kit.js"]);
  await loadKit();
  expect(added.length).toBe(2);
  expect(kitLive()).toBe(a);
});

test("a failed load rejects and can be tried again", async () => {
  page({ kit: true, fail: true });
  const { loadKit } = await fresh();
  await expect(loadKit()).rejects.toThrow("could not load");
  const added = page({ kit: true });
  expect((await loadKit()) as any).toEqual({ marker: 1 });
  expect(added.length).toBe(2);
});

test("a script that loads but does not start the kit is a failure", async () => {
  page({ kit: true, start: false });
  const { loadKit } = await fresh();
  await expect(loadKit()).rejects.toThrow("did not start");
});
