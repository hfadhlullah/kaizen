import { expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestCard } from "./components/icebox/request-card.tsx";
import { RequestRow } from "./components/icebox/request-row.tsx";
import {
  ago,
  catOf,
  deckOf,
  deriveIce,
  faviconUrl,
  gatherLine,
  iceKey,
  platOf,
  snoozedLine,
  stepPast,
  subName,
  wakeDay,
  webUrl,
  ymd,
  type Board,
  type IceData,
  type IceItem,
  type RowCtx,
  type Source,
} from "./lib/icebox/icebox.ts";
import { TooltipProvider } from "./ui/tooltip.tsx";

// The Icebox's rules (lib/icebox/icebox.ts) and its row and card, rendered the way the board renders them.
const D = "/p/.kaizen";
const item = (id: string, more: Partial<IceItem> = {}): IceItem => ({
  id,
  dir: D,
  project: "/p",
  text: "request " + id,
  source: "https://github.com/o/r/issues",
  at: new Date(Date.UTC(2026, 10, 10, 12, +id)).toISOString(),
  status: "new",
  ...more,
});
const src = (more: Partial<Source> = {}): Source => ({ url: "https://github.com/o/r/issues", dir: D, ...more });
const data = (more: Partial<IceData> = {}): IceData => ({
  sources: [src(), src({ url: "https://www.threads.net/search?q=ai", social: "threads", label: "Threads: ai" })],
  icebox: [],
  dismissed: [],
  boards: [],
  failed: [],
  ...more,
});
const env = { dir: null as string | null, shown: new Set<string>(), showable: [{ dir: D, label: "/p" }] };
const f = { board: "", kinds: [] as string[], cat: "", src: "" };

test("a request's category is its status word, else its own, else its source's, else the platform or site", () => {
  const list = data().sources;
  expect(catOf(list, item("1", { status: "dismissed" }))).toBe("Dismissed");
  expect(catOf(list, item("1", { status: "promoted" }))).toBe("Promoted");
  expect(catOf(list, item("1", { category: "Bugs" }))).toBe("Bugs");
  expect(catOf([src({ category: "Feedback" })], item("1"))).toBe("Feedback");
  expect(catOf(list, item("1"))).toBe("github.com");
  expect(catOf(list, item("1", { source: "https://www.threads.net/search?q=ai" }))).toBe("Threads");
  expect(platOf(null)).toBe("Other");
});

test("filters narrow in turn: only waiting ones show until a category is chosen; newest first; an unknown filter is cleared", () => {
  const d = data({
    icebox: [
      item("1"),
      item("2", { board: "Acme", kind: "client" }),
      item("3", { asleep: true }),
      item("4", { status: "promoted" }),
    ],
    dismissed: [item("5", { status: "dismissed" })],
    boards: [{ dir: D, name: "Acme", client: true }],
  });
  const all = deriveIce(d, f, env);
  expect(all.waiting).toBe(2); // the snoozed one is not waiting
  expect(all.filtered.map((i) => i.id)).toEqual(["2", "1"]); // newest first, no snoozed, promoted, dismissed
  expect(deriveIce(d, { ...f, board: "acme" }, env).filtered.map((i) => i.id)).toEqual(["2"]);
  expect(deriveIce(d, { ...f, kinds: ["client"] }, env).filtered.map((i) => i.id)).toEqual(["2"]);
  expect(deriveIce(d, { ...f, cat: "Dismissed" }, env).filtered.map((i) => i.id)).toEqual(["5"]);
  const gone = deriveIce(d, { ...f, board: "Nope", cat: "Nope", src: "nope" }, env);
  expect([gone.board, gone.cat, gone.src]).toEqual(["", "", ""]);
  expect(gone.filtered).toHaveLength(2);
  // the project filter: the board's one project, or the "Showing" picker
  expect(deriveIce(d, f, { ...env, dir: "/other/.kaizen" }).filtered).toHaveLength(2); // a dir filter is the server's
  expect(deriveIce(d, f, { ...env, shown: new Set(["/other/.kaizen"]) }).filtered).toHaveLength(0);
});

test("projects and counts: many is true with two projects; a board chip counts the waiting items on it", () => {
  const d = data({
    icebox: [item("1", { board: "Acme" }), item("2", { dir: "/q/.kaizen" })],
    boards: [{ dir: D, name: "Acme" }],
  });
  const r = deriveIce(d, f, env);
  expect(r.many).toBe(true);
  expect(r.nOn(d.boards[0] as Board)).toBe(1);
  expect(deriveIce(data({ icebox: [item("1")] }), f, env).many).toBe(false);
});

test("the cursor steps to the next row that stays, else the one before, else nothing", () => {
  const rows = ["1", "2", "3"].map((i) => item(i)),
    k = (i: number) => iceKey(rows[i]!);
  expect(stepPast(rows, k(1), new Set([k(1)]))).toBe(k(2));
  expect(stepPast(rows, k(2), new Set([k(2)]))).toBe(k(1));
  expect(stepPast(rows, k(1), new Set([k(1), k(2)]))).toBe(k(0));
  expect(stepPast(rows, k(0), new Set(rows.map(iceKey)))).toBeNull();
  expect(stepPast(rows, k(0), new Set([k(2)]))).toBe(k(0)); // not on a leaving row: unchanged
});

test("words: ages, snooze days, Gather all, source names, favicons", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  expect(ago("2026-11-14T11:59:40Z", now)).toBe("just now");
  expect(ago("2026-11-14T11:30:00Z", now)).toBe("30 min ago");
  expect(ago("2026-11-14T09:00:00Z", now)).toBe("3 h ago");
  expect(ago("2026-11-10T12:00:00Z", now)).toBe("4 d ago");
  const from = new Date(2026, 10, 14);
  expect(ymd(wakeDay("1d", from))).toBe("2026-11-15");
  expect(ymd(wakeDay("1w", from))).toBe("2026-11-21");
  expect(ymd(wakeDay("1m", from))).toBe("2026-12-14");
  expect(ymd(wakeDay("2027-01-02"))).toBe("2027-01-02");
  expect(snoozedLine(2, "1w")).toMatch(/^2 snoozed until /);
  expect(snoozedLine(1, "1w")).toMatch(/^Snoozed until /);
  const list = [src({ social: "x" }), src({ url: "https://b.example/f" })];
  expect(gatherLine([{ url: "https://b.example/f", ok: true, added: 2 }], list)).toBe("2 new in the icebox");
  expect(
    gatherLine(
      [
        { url: "https://b.example/f", ok: false, added: 0 },
        { url: list[0]!.url, ok: false, added: 0 },
      ],
      list,
    ),
  ).toBe("Nothing new, 1 source could not be read; 1 social for /kaizen gather");
  expect(subName("Threads: ai", "Threads")).toBe("ai");
  expect(subName("Feedback", "Threads")).toBe("Feedback");
  expect(faviconUrl("https://a.example/x/y")).toBe("https://a.example/favicon.ico");
  expect(faviconUrl("https://docs.google.com/spreadsheets/d/1")).toContain("gstatic.com");
  expect(faviconUrl("javascript:alert(1)")).toBe("");
});

test("a javascript: link is never a clickable href; the swipe deck puts the least skipped first", () => {
  expect(webUrl("javascript:alert(1)")).toBe("#");
  expect(webUrl("https://a.example")).toBe("https://a.example");
  const xs = [item("1"), item("2"), item("3", { status: "dismissed" })];
  expect(deckOf(xs, new Map()).map((i) => i.id)).toEqual(["1", "2"]); // dismissed ones are not in the deck
  expect(deckOf(xs, new Map([[iceKey(xs[0]!), 1]])).map((i) => i.id)).toEqual(["2", "1"]);
});

const ctx = (more: Partial<RowCtx> = {}): RowCtx => ({
  list: data().sources,
  many: false,
  boards: [],
  cur: null,
  sel: new Set(),
  open: null,
  armed: null,
  ...more,
});
const html = (e: ReactElement) => renderToStaticMarkup(createElement(TooltipProvider, null, e));

test("a row shows kind, words, source, age and its actions; a promoted one has no actions", () => {
  const out = html(createElement(RequestRow, { item: item("1", { kind: "client" }), ctx: ctx(), chat: false }));
  expect(out).toContain("request 1");
  expect(out).toContain("Client");
  expect(out).toContain('aria-label="Promote to Tasks: request 1"');
  expect(out).toContain('aria-label="Dismiss: request 1"');
  const done = html(createElement(RequestRow, { item: item("2", { status: "promoted" }), ctx: ctx(), chat: false }));
  expect(done).not.toContain("Promote to Tasks");
  expect(done).toContain("promoted");
  const dismissed = html(
    createElement(RequestRow, { item: item("3", { status: "dismissed" }), ctx: ctx(), chat: false }),
  );
  expect(dismissed).toContain("Restore: request 3");
});

test("an open row shows notes, pictures and where it came from, with the post link only for http(s)", () => {
  const it = item("1", {
    notes: "a note",
    post: "https://x.example/p/1",
    images: ["https://img.example/a.jpg", "http://no.example/b.jpg"],
  });
  const out = html(createElement(RequestRow, { item: it, ctx: ctx({ open: iceKey(it) }), chat: false }));
  expect(out).toContain("a note");
  expect(out).toContain("Show images (1)"); // only https pictures
  expect(out).toContain("open post");
  const bad = item("2", { post: "javascript:alert(1)" });
  expect(html(createElement(RequestRow, { item: bad, ctx: ctx({ open: iceKey(bad) }), chat: false }))).toContain(
    'href="#"',
  );
});

test("a card leads with a link's title and summary, and an unsafe link is not drawn as one", () => {
  const link = item("1", {
    link: { url: "https://site.example/a", title: "A title", summary: "A summary" },
    tags: ["ui"],
  });
  const out = html(createElement(RequestCard, { item: link, ctx: ctx() }));
  expect(out).toContain("A title");
  expect(out).toContain("A summary");
  expect(out).toContain("#ui");
  expect(out).toContain('rel="noopener noreferrer"');
  const bad = item("2", { link: { url: "javascript:alert(1)", title: "Evil" } });
  expect(html(createElement(RequestCard, { item: bad, ctx: ctx() }))).not.toContain("Evil");
});
