import { expect, test } from "bun:test";
import { answer, ask, useAsk } from "./lib/ask.ts";

test("a question is a promise the answer settles", async () => {
  const q = ask({ title: "Delete?", confirmLabel: "Delete" });
  expect(useAsk.getState().open?.title).toBe("Delete?");
  answer(true);
  expect(await q).toBe(true);
  expect(useAsk.getState().open).toBe(null);
  answer(false); // nothing open: no error
});

test("a new question while one is open answers the old one no", async () => {
  const first = ask({ title: "One", confirmLabel: "Yes" });
  const second = ask({ title: "Two", confirmLabel: "Yes" });
  expect(await first).toBe(false);
  expect(useAsk.getState().open?.title).toBe("Two");
  answer(false);
  expect(await second).toBe(false);
});
