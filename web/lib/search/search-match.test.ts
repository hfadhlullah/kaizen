import { expect, test } from "bun:test";
import { match, near } from "@lib/search/search-match.ts";

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

test("a title that is the query, then one that starts with it, then a word that starts with it, then one that holds it", () => {
  const l = [it("Dashboard", 9), it("The board", 8), it("Boarding", 7), it("board", 1)];
  expect(match(l, "board").map((i) => i.title)).toEqual(["board", "Boarding", "The board", "Dashboard"]);
});

test("one typo is forgiven in a word of four letters or more", () => {
  expect(near("tsaks", "tasks")).toBe(true);
  expect(near("taks", "tasks")).toBe(true);
  expect(near("taskss", "tasks")).toBe(true);
  expect(near("tusks", "tasks")).toBe(true);
  expect(near("tsk", "tasks")).toBe(false);
  const l = [it("Tasks"), it("Board")];
  expect(match(l, "tsaks").map((i) => i.title)).toEqual(["Tasks"]);
  expect(match(l, "bo").map((i) => i.title)).toEqual(["Board"]);
  expect(match(l, "xx")).toEqual([]);
});

test("among equal matches what waits on you comes first", () => {
  const l = [it("Fix tests", 9), { ...it("Fix lint", 1), dot: "wait" }];
  expect(match(l, "fix").map((i) => i.title)).toEqual(["Fix lint", "Fix tests"]);
});
