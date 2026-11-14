import { afterEach, beforeEach, expect, test } from "bun:test";
import { createAnnotator } from "./session.ts";

// A page-less board: a fake localStorage, window listeners we can fire, a frame whose window records what the board says
// to it, and a fetch that answers the three annotate routes and records what was sent.
const store = new Map<string, string>();
const handlers: Record<string, (e: any) => void> = {};
const calls: { path: string; body: any }[] = [];
const said: any[] = [];
const win = { postMessage: (m: any) => said.push(m) };
const frame = { tagName: "IFRAME", contentWindow: win } as any;
const real = {
  fetch: globalThis.fetch,
  ls: (globalThis as any).localStorage,
  add: (globalThis as any).addEventListener,
  rm: (globalThis as any).removeEventListener,
};
const g = globalThis as any;

beforeEach(() => {
  store.clear();
  calls.length = 0;
  said.length = 0;
  for (const k of Object.keys(handlers)) delete handlers[k];
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  // sonner (the toast) schedules a frame
  g.requestAnimationFrame = (f: () => void) => setTimeout(f, 0);
  g.cancelAnimationFrame = (n: any) => clearTimeout(n);
  g.addEventListener = (t: string, f: any) => (handlers[t] = f);
  g.removeEventListener = (t: string) => delete handlers[t];
  g.fetch = async (path: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push({ path, body });
    const out =
      path === "/annotate/open"
        ? { ok: true, origin: "http://127.0.0.1:5000", token: "tok", url: "http://127.0.0.1:5000/a" }
        : path === "/annotate/send"
          ? { ok: true, sent: body.notes.length, crops: 1 }
          : { ok: true, text: "md" };
    return { ok: true, status: 200, json: async () => out };
  };
});
afterEach(() => {
  g.fetch = real.fetch;
  g.localStorage = real.ls;
  g.addEventListener = real.add;
  g.removeEventListener = real.rm;
});

const make = (run: { dir: string; id: string } | null = { dir: "/s", id: "r1" }, ws = "w") => {
  let reloads = 0;
  const places: string[] = [];
  const a = createAnnotator({
    frame: () => frame,
    wsKey: ws,
    run: () => run,
    reload: () => void reloads++,
    onLocation: (u) => places.push(u),
  });
  return { a, places, reloads: () => reloads, off: a.listen() };
};
const page = (d: any) =>
  handlers.message!({ source: win, origin: "http://127.0.0.1:5000", data: { kz: 1, t: "tok", ...d } });
const crop = "data:image/png;base64,iVBORw0KGgo=";

test("Annotate on a localhost page opens the proxy; off, or a public page, loads the address directly", async () => {
  const { a, reloads, off } = make();
  expect(await a.open("http://localhost:3000/")).toBeNull(); // not wanted yet
  a.toggle();
  expect(reloads()).toBe(1);
  expect(a.use.getState().want).toBe(true);
  expect(await a.open("https://example.com/")).toBeNull();
  expect(await a.open("http://localhost:3000/x?y=1")).toBe("http://127.0.0.1:5000/a");
  expect(calls).toEqual([{ path: "/annotate/open", body: { url: "http://localhost:3000/x?y=1" } }]);
  expect(a.proxied()).toBe(true);
  expect(a.use.getState().px).toEqual({
    origin: "http://127.0.0.1:5000",
    token: "tok",
    target: "http://localhost:3000",
  });
  a.close(); // the bar's own close: back to the page's address
  expect(a.proxied()).toBe(false);
  expect(a.use.getState().want).toBe(false);
  expect(reloads()).toBe(2);
  off();
});

test("the page's ready, note, marker and loc messages: notes are numbered, saved without crops and marked on the page", async () => {
  const { a, places, off } = make();
  a.toggle();
  await a.open("http://localhost:3000/");
  page({ type: "ready" });
  expect(a.active()).toBe(true);
  expect(said.map((m) => m.type)).toEqual(["config", "markers"]);
  expect(said[0].cfg).toMatchObject({ on: true, mode: "element", block: true, color: "#3c82f7", pause: false });
  page({
    type: "note",
    note: { comment: "make it blue", selector: "#a", crop, url: "http://127.0.0.1:5000/p?q=1", page: "/p" },
  });
  page({
    type: "note",
    note: { comment: "two", selector: "#b", crop: "javascript:alert(1)", url: "https://evil.test/" },
  });
  const ns = a.use.getState().notes;
  expect(ns.map((n) => n.n)).toEqual([1, 2]);
  expect(ns[0]!.crop).toBe(crop);
  expect(ns[0]!.url).toBe("http://localhost:3000/p?q=1");
  expect(ns[1]!.crop).toBeUndefined();
  expect(ns[1]!.url).toBe("");
  expect(JSON.parse(store.get("kz-ann:w")!).some((n: any) => "crop" in n)).toBe(false);
  expect(said.at(-1)).toMatchObject({
    type: "markers",
    list: [
      { n: 1, selector: "#a" },
      { n: 2, selector: "#b" },
    ],
  });
  page({ type: "loc", href: "http://127.0.0.1:5000/z#h" });
  page({ type: "loc", href: "http://elsewhere.test/" });
  expect(places).toEqual(["http://localhost:3000/z#h"]);
  page({ type: "marker", n: 2 });
  expect(a.use.getState().flash).toBe(2);
  off();
});

test("a message from another window, origin or token is ignored; so is anything before a page is open", async () => {
  const { a, off } = make();
  page({ type: "note", note: { comment: "early" } });
  a.toggle();
  await a.open("http://localhost:3000/");
  handlers.message!({
    source: {},
    origin: "http://127.0.0.1:5000",
    data: { kz: 1, t: "tok", type: "note", note: { comment: "x" } },
  });
  handlers.message!({
    source: win,
    origin: "http://evil.test",
    data: { kz: 1, t: "tok", type: "note", note: { comment: "x" } },
  });
  handlers.message!({
    source: win,
    origin: "http://127.0.0.1:5000",
    data: { kz: 1, t: "bad", type: "note", note: { comment: "x" } },
  });
  expect(a.use.getState().notes).toEqual([]);
  off();
});

test("Send types the notes into the run's agent (crops included), Copy asks for markdown, Clear-after empties the list", async () => {
  const { a, off } = make();
  a.toggle();
  await a.open("http://localhost:3000/");
  page({ type: "note", note: { comment: "c1", selector: "#a", crop } });
  await a.send();
  expect(calls.at(-1)).toMatchObject({
    path: "/annotate/send",
    body: { dir: "/s", id: "r1", level: "standard", components: true },
  });
  expect(calls.at(-1)!.body.notes[0].crop).toBe(crop);
  await a.copy();
  expect(calls.at(-1)).toMatchObject({ path: "/annotate/format", body: { level: "standard" } });
  expect("crop" in calls.at(-1)!.body.notes[0]).toBe(false);
  expect(a.use.getState().notes.length).toBe(1);
  a.setting("clear", true);
  a.setting("level", "forensic");
  expect(JSON.parse(store.get("kz-annotate")!)).toMatchObject({ clear: true, level: "forensic" });
  await a.send();
  expect(calls.at(-1)!.body.level).toBe("forensic");
  expect(a.use.getState().notes).toEqual([]);
  expect(said.at(-1)).toEqual({ kz: 1, t: "tok", type: "markers", list: [] });
  off();
});

test("the marker colour is pushed to the page at once; the other settings only when the next config goes out", async () => {
  const { a, off } = make();
  a.toggle();
  await a.open("http://localhost:3000/");
  const n = said.length;
  a.setting("block", false);
  expect(said.length).toBe(n);
  a.setting("color", "#ff0000");
  expect(said.at(-2)).toMatchObject({ type: "config", cfg: { color: "#ff0000", block: false } });
  off();
});

test("with no run open Send says so and sends nothing; with no notes nothing is asked", async () => {
  const { a, off } = make(null);
  a.toggle();
  await a.open("http://localhost:3000/");
  page({ type: "note", note: { comment: "c1" } });
  const before = calls.length;
  await a.send();
  expect(calls.length).toBe(before);
  const { a: b, off: off2 } = make(undefined, "empty");
  await b.copy();
  await b.send();
  expect(calls.filter((c) => c.path !== "/annotate/open").length).toBe(0);
  off();
  off2();
});

test("edit and delete a note; notes come back after a reload of the board", async () => {
  const { a, off } = make();
  a.toggle();
  await a.open("http://localhost:3000/");
  page({ type: "note", note: { comment: "one", selector: "#a" } });
  page({ type: "note", note: { comment: "two", selector: "#b" } });
  a.editNote(1, "  one, edited ");
  a.editNote(2, "   "); // empty: kept as it was
  expect(a.use.getState().notes.map((n) => n.comment)).toEqual(["one, edited", "two"]);
  a.removeNote(1);
  expect(a.use.getState().notes.map((n) => n.n)).toEqual([2]);
  off();
  const again = make().a; // a new board page: same workspace key
  expect(again.use.getState().notes.map((n) => n.comment)).toEqual(["two"]);
  // the counter goes on after the highest saved number
  again.toggle();
  await again.open("http://localhost:3000/");
  page({ type: "note", note: { comment: "three" } });
  expect(again.use.getState().notes.map((n) => n.n)).toEqual([2, 3]);
});

test("keys: P pauses, H hides, Escape and the toggle chord turn picking off and on; typing in a box is left alone", async () => {
  const { a, off } = make();
  a.toggle();
  await a.open("http://localhost:3000/");
  const key = (k: string, extra: any = {}) =>
    handlers.keydown!({ key: k, target: { tagName: "DIV" }, preventDefault() {}, ...extra });
  key("p"); // picking is off: nothing happens
  expect(a.use.getState().pause).toBe(false);
  key("f", { ctrlKey: true, shiftKey: true });
  expect(a.active()).toBe(true);
  key("p");
  key("h");
  expect(a.use.getState()).toMatchObject({ pause: true, hide: true });
  key("p", { target: { tagName: "TEXTAREA" } });
  expect(a.use.getState().pause).toBe(true);
  key("Escape");
  expect(a.active()).toBe(false);
  a.mode("area");
  expect(a.use.getState()).toMatchObject({ on: true, settings: { mode: "area" } });
  a.mode("area"); // pressing the mode that is on turns picking off
  expect(a.active()).toBe(false);
  off();
});

test("a hidden pane takes no keys and no page messages (x on Tasks must not wipe notes, s must not send them)", async () => {
  const { a, off } = make();
  a.toggle();
  await a.open("http://localhost:3000/");
  page({ type: "ready" });
  page({ type: "note", note: { comment: "keep me", selector: "#a" } });
  const key = (k: string) => handlers.keydown!({ key: k, target: { tagName: "BODY" }, preventDefault() {} });
  a.live(false); // the workspace was left, or this tab is not in front
  key("x");
  key("s");
  key("Escape");
  page({ type: "note", note: { comment: "from a hidden page", selector: "#b" } });
  expect(a.use.getState().notes.length).toBe(1);
  expect(calls.some((c) => c.path === "/annotate/send")).toBe(false);
  expect(a.active()).toBe(true);
  // a page that reloads while its pane is hidden still says ready, and is handed its picker config and markers again
  said.length = 0;
  page({ type: "ready" });
  expect(said.map((m) => m.type)).toEqual(["config", "markers"]);
  a.live(true);
  key("x"); // shown again: the key works
  expect(a.use.getState().notes.length).toBe(0);
  off();
});
