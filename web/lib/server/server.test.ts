import { expect, test } from "bun:test";
import {
  changes,
  askingNow,
  baseKey,
  cardKey,
  needsYou,
  newlyAsking,
  numberKeys,
  quietDelay,
  skipRedraw,
  withoutClock,
  QUIET_GAP,
  HIDDEN_GAP,
  REDRAW_MS,
} from "./poll-rules.ts";
import { iceNewCount, liveTerminals, needYouCount, waitingCount } from "./attention.ts";

const run = (id: string, o: any = {}) => ({ kind: "run", state: "/p", id, column: 0, status: "building", ...o });

test("a reply without its clock is the same reply", () => {
  expect(withoutClock('{"cards":[1],"now":1700}')).toBe('{"cards":[1],');
  expect(withoutClock('{"cards":[1],"now":1800}')).toBe(withoutClock('{"cards":[1],"now":1700}'));
});

test("quiet reads wait one gap (a hidden tab five) and skip an identical reply until it is stale", () => {
  expect(quietDelay(1000, 900, false)).toBe(QUIET_GAP - 100);
  expect(quietDelay(1000, 0, false)).toBe(0);
  expect(quietDelay(1000, 900, true)).toBe(HIDDEN_GAP - 100);
  expect(skipRedraw(true, "a", "a", 1000, 900)).toBe(true);
  expect(skipRedraw(false, "a", "a", 1000, 900)).toBe(false); // a asked-for load always draws
  expect(skipRedraw(true, "a", "b", 1000, 900)).toBe(false);
  expect(skipRedraw(true, "a", "a", 900 + REDRAW_MS, 900)).toBe(false);
});

test("two tasks with the same text get distinct keys", () => {
  const cards = [{ kind: "idea", state: "/p", text: "x" }, { kind: "idea", state: "/p", text: "x" }, run("r1")];
  numberKeys(cards);
  expect(cards.map(cardKey)).toEqual(["idea:/p:x", "idea:/p:x#1", "run:/p:r1"]);
  expect(baseKey(cards[1])).toBe("idea:/p:x");
});

test("a card that changed column slides, one that started needing you flashes; the first read is not news", () => {
  const first = [run("a", { column: 0 }), run("b", { column: 1 })];
  const one = changes(null, first);
  expect(one.moved).toEqual([]);
  expect(one.flash).toEqual([]);
  const next = [run("a", { column: 2 }), run("b", { column: 1, status: "waiting" }), run("c")];
  const two = changes(one.next, next);
  expect(two.moved).toEqual(["run:/p:a"]);
  expect(two.flash).toEqual(["run:/p:b"]);
  expect(needsYou(run("d", { pty: { alive: true, asking: true } }))).toBe(true);
  expect(needsYou(run("d", { pty: { alive: false, asking: true } }))).toBe(false);
});

test("only agents that started asking since the last read are news", () => {
  const cards = [
    run("a", { pty: { key: "k1", alive: true, asking: true } }),
    run("b", { pty: { key: "k2", alive: true, asking: false } }),
    run("c", { archived: true, pty: { key: "k3", alive: true, asking: true } }),
  ];
  const now = askingNow(cards);
  expect([...now.keys()]).toEqual(["k1"]);
  expect(newlyAsking(null, now)).toEqual([]);
  expect(newlyAsking(new Set(["k1"]), now)).toEqual([]);
  expect(newlyAsking(new Set(), now).map((c) => c.id)).toEqual(["a"]);
});

test("the side menu's counts", () => {
  const t = (c: string, dir = "/p") => ({ id: c, dir, title: c, attention: { category: c, reason: "", action: "" } });
  expect(needYouCount([t("needs-you"), t("done")])).toBe(1);
  expect(needYouCount(null)).toBe(0);
  expect(waitingCount([run("a")], [t("needs-you"), t("needs-you", "/other")])).toBe(1); // only the projects shown
  expect(waitingCount([run("a", { status: "waiting" })], null)).toBe(1);
  expect(iceNewCount({ icebox: [{ status: "new" }, { status: "new", asleep: true }, { status: "seen" }] })).toBe(1);
  expect(iceNewCount(null)).toBe(0);
  expect(liveTerminals([run("a", { pty: { alive: true } }), run("b")], [{}, {}])).toBe(3);
});
