import { expect, test } from "bun:test";
import { shownRows } from "./search.ts";

const it = (group: string, title: string, at = 0) => ({ group, title, hay: "", at, ico: "run", act: () => {} });
const none = () => {};

test("with nothing typed: what waits on you, then the last few things touched", () => {
  const wait = (title: string, at: number) => ({ ...it("Runs", title, at), dot: "wait" });
  const all = [
    ...Array.from({ length: 8 }, (_, i) => it("Runs", "run " + i, i)),
    wait("needs an answer", 1),
    it("Workspaces", "main", 5),
    it("Actions", "Toggle theme"),
  ];
  const rows = shownRows(all, "", none);
  expect(rows.map((r) => r.group)).toEqual(["Needs you", ...Array(5).fill("Recent")]);
  expect(rows[0]!.title).toBe("needs an answer");
  expect(rows.slice(1).map((r) => r.title)).toEqual(["run 7", "run 6", "run 5", "main", "run 4"]);
});

test("a board with little in it also lists the pages", () => {
  const page = (t: string) => ({ ...it("Actions", t), page: true });
  const rows = shownRows([it("Runs", "one", 1), page("Tasks"), page("Board"), it("Actions", "Toggle theme")], "", none);
  expect(rows.map((r) => r.group)).toEqual(["Recent", "Go to", "Go to"]);
});

test("typed, the group holding the best match comes first and a New task row closes the list", () => {
  const all = [it("Runs", "build the board"), it("Actions", "Board"), it("Tasks", "other")];
  const rows = shownRows(all, "board", none);
  expect(rows.map((r) => r.title)).toEqual(["Board", "build the board", 'New task "board"']);
});

test("the New task row hands over what was typed", () => {
  let got = "";
  const rows = shownRows([], "  fix it ", (t) => (got = t));
  expect(rows).toHaveLength(1);
  rows[0]!.act();
  expect(got).toBe("fix it");
});
