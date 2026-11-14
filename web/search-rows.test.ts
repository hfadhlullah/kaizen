import { expect, test } from "bun:test";
import { shownRows } from "./lib/search/search.ts";

const it = (group: string, title: string, at = 0) => ({ group, title, hay: "", at, ico: "run", act: () => {} });
const none = () => {};

test("with nothing typed each group shows its most recent few, in the palette's group order", () => {
  const all = [
    ...Array.from({ length: 8 }, (_, i) => it("Runs", "run " + i, i)),
    it("Actions", "Toggle theme"),
    it("Workspaces", "main", 5),
  ];
  const rows = shownRows(all, "", none);
  expect(rows.map((r) => r.group)).toEqual(["Workspaces", ...Array(5).fill("Runs"), "Actions"]);
  expect(rows.filter((r) => r.group === "Runs").map((r) => r.title)).toEqual([
    "run 7",
    "run 6",
    "run 5",
    "run 4",
    "run 3",
  ]);
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
