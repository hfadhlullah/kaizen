import { expect, test } from "bun:test";
import { arrange, type Session } from "./layout.ts";
import { setTerminals, terminalLayout, useTerminals } from "./terminal-store.ts";

const s = (k: string): Session => ({ kind: "run", id: k, pty: { key: k, alive: true, asking: false } });

test("a tile seen once keeps its place when a run that sorts earlier arrives later", () => {
  const two = new Map([["b", s("b")], ["c", s("c")]]);
  setTerminals({ all: two });
  terminalLayout.see(arrange(two, useTerminals.getState().lay, false, null).order);
  expect(useTerminals.getState().lay.order).toEqual(["b", "c"]);
  // `a` is first in the sessions now, but it is new: it joins at the end.
  const three = new Map([["a", s("a")], ["b", s("b")], ["c", s("c")]]);
  const arranged = arrange(three, useTerminals.getState().lay, false, null);
  expect(arranged.keys).toEqual(["b", "c", "a"]);
  terminalLayout.see(arranged.order);
  expect(useTerminals.getState().lay.order).toEqual(["b", "c", "a"]);
  // Nothing new: the saved layout is not rewritten.
  const before = useTerminals.getState().lay;
  terminalLayout.see(arranged.order);
  expect(useTerminals.getState().lay).toBe(before);
});
