import { expect, test } from "bun:test";
import { leave, onLeave } from "./leave.ts";

test("leave writes what every page registered, even a writer that fails, then goes", async () => {
  const g = globalThis as { location?: { href: string } };
  g.location = { href: "/notebook" };
  const order: string[] = [];
  onLeave(async () => {
    await Promise.resolve();
    order.push("note");
  });
  onLeave(() => Promise.reject(new Error("offline")));
  leave("/?view=board");
  expect(g.location.href).toBe("/notebook"); // not yet: the writers run first
  await new Promise((r) => setTimeout(r, 10));
  expect(order).toEqual(["note"]);
  expect(g.location.href).toBe("/?view=board");
});
