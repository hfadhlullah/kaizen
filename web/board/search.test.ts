import { expect, test } from "bun:test";
import { match } from "./search-match.ts";

const it = (title: string, at = 0, hay = "") => ({ group: "g", title, hay, at, ico: "run", act: () => {} });

test("an empty query keeps every item", () => {
  const l = [it("a"), it("b")];
  expect(match(l, "  ")).toBe(l);
});

test("every word must be present, in title, sub or keywords", () => {
  const l = [it("Global search", 0, "kaizen"), it("Search tests"), it("Board")];
  expect(match(l, "search kaizen").map((i) => i.title)).toEqual(["Global search"]);
  expect(match(l, "SEARCH").map((i) => i.title).sort()).toEqual(["Global search", "Search tests"]);
});

test("title prefix beats title contains beats keywords, then recency", () => {
  const l = [it("Old board", 5, ""), it("Notes", 9, "board"), it("Board new", 1), it("Board recent", 3)];
  expect(match(l, "board").map((i) => i.title)).toEqual(["Board recent", "Board new", "Old board", "Notes"]);
});
