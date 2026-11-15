import { expect, test } from "bun:test";
import { setHost } from "@lib/core/host.ts";
import { swGo } from "./icebox-actions.ts";
import { getIce, setIce } from "./icebox-store.ts";

// A swipe whose POST fails brings the flown card home and frees the deck; one that works leaves it flown.
const it = {
  id: "1",
  dir: "/p/.kaizen",
  project: "/p",
  text: "x",
  source: "s",
  at: "2026-11-10T00:00:00Z",
  status: "new",
} as any;
const run = async (ok: boolean) => {
  const real = globalThis.fetch;
  (globalThis as any).fetch = async () =>
    new Response(JSON.stringify(ok ? { ok: true } : { error: "no" }), { status: ok ? 200 : 500 });
  (globalThis as any).requestAnimationFrame = () => 0;
  setHost({ pop: () => {}, reload: () => {} } as any);
  setIce({
    deck: [it],
    swipe: { n: 0, pro: 0, dis: 0, t0: 0, last: null, skip: new Map(), busy: false, pop: false } as any,
  });
  let home = 0;
  await swGo("dismiss", async () => () => void home++);
  globalThis.fetch = real;
  return { home, busy: getIce().swipe?.busy };
};
test("a failed swipe decision brings the card back and unlocks the deck", async () => {
  expect(await run(false)).toEqual({ home: 1, busy: false });
  expect((await run(true)).home).toBe(0);
});
