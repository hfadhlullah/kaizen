import { expect, test } from "bun:test";
import { stripChips, stripDot } from "./strip.ts";

const c = (status: string, o: any = {}) => ({ kind: "run", status, ...o }) as any;
const snap = (cards: any[], o: any = {}) => ({ cards, allCards: cards, archive: false, filter: null, ...o });

test("running always shows; other statuses only when something has them; the archive ends the row", () => {
  const ch = stripChips(snap([c("waiting"), c("waiting"), c("done")]));
  expect(ch.map((x) => x.id)).toEqual(["waiting", "running", "done", "__archive"]);
  expect(ch.map((x) => x.label)).toEqual(["2 waiting on you", "0 running", "1 done", "Archive 0"]);
  expect(ch[0]!.attn).toBe(true);
});

test("tasks are pluralised, the filtered chip is on, the archive count and title say what is where", () => {
  const cards = [c("idea", { kind: "idea" }), c("idea", { kind: "idea" }), c("running")];
  const ch = stripChips(snap(cards, { filter: "idea", allCards: [...cards, c("done", { archived: true })] }));
  expect(ch.find((x) => x.id === "idea")).toMatchObject({ label: "2 ideas", on: true, title: "Show only idea" });
  const a = ch.at(-1)!;
  expect(a.label).toBe("Archive 1");
  expect(a.title).toBe("2 tasks · 1 runs on the board");
  expect(stripChips(snap([], { archive: true })).at(-1)!.label).toBe("Back to board");
});

test("the phone's dot is amber for a waiting run, accent while a filter or the archive is on", () => {
  expect(stripDot(snap([c("waiting")]))).toBe("wait");
  expect(stripDot(snap([c("waiting")], { filter: "waiting" }))).toBe("on");
  expect(stripDot(snap([c("done")], { archive: true }))).toBe("on");
  expect(stripDot(snap([c("done")]))).toBe("");
});
