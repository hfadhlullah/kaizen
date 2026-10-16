// Write-back against a throwaway .kaizen/: gh and Google are injected, nothing leaves the machine.
import { test, expect, beforeEach, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readIcebox, writeIcebox, writeSources, sift } from "./sources.ts";
import { writeBacks } from "./writeback.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "kaizen-wb-")));
let state: string;
let n = 0;
beforeEach(() => { state = join(root, String(n++), ".kaizen"); mkdirSync(state, { recursive: true }); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

const GH = "https://github.com/acme/app/issues";
const SHEET = "https://docs.google.com/spreadsheets/d/abc123/edit#gid=7";
const item = (source: string, extra = {}) => ({ id: "a1", text: "Dark mode", source, at: "2026-10-17", status: "done" as const, run: "r1", ...extra });
const source = (url: string, writeback = true) => writeSources(state, [{ url, added: "x", seen: [], ...(writeback ? { writeback } : {}) }]);

test("github: a done item closes its issue once, with fixed text", async () => {
  source(GH);
  writeIcebox(state, [item(GH, { notes: "#12 · https://github.com/acme/app/issues/12" })]);
  const calls: string[][] = [];
  const gh = async (a: string[]) => { calls.push(a); return { code: 0, err: "" }; };
  await writeBacks(state, { gh });
  await writeBacks(state, { gh });
  expect(calls).toEqual([["issue", "close", "12", "--repo", "acme/app", "--comment", "Done in kaizen run r1."]]);
  expect(readIcebox(state)[0]!.written).toBeTruthy();
});

test("off by default: nothing is sent", async () => {
  source(GH, false);
  writeIcebox(state, [item(GH, { notes: "#12 · x" })]);
  let sent = 0;
  await writeBacks(state, { gh: async () => { sent++; return { code: 0, err: "" }; } });
  expect(sent).toBe(0);
});

test("a failed write stays done, keeps the error and is tried again", async () => {
  source(GH);
  writeIcebox(state, [item(GH, { notes: "#12 · x" })]);
  await writeBacks(state, { gh: async () => ({ code: 1, err: "boom\nHTTP 401" }) });
  expect(readIcebox(state)[0]).toMatchObject({ status: "done", writeError: "HTTP 401" });
  expect(readIcebox(state)[0]!.written).toBeUndefined();
  await writeBacks(state, { gh: async () => ({ code: 0, err: "" }) });
  expect(readIcebox(state)[0]!.written).toBeTruthy();
  expect(readIcebox(state)[0]!.writeError).toBeUndefined();
});

function google(rows: string[][]) {
  const puts: { url: string; body: any }[] = [];
  const doFetch = (async (url: string, init: any = {}) => {
    if (init.method === "PUT") { puts.push({ url: decodeURIComponent(url), body: JSON.parse(init.body) }); return Response.json({}); }
    if (url.includes("fields=sheets")) return Response.json({ sheets: [{ properties: { sheetId: 7, title: "Req" } }] });
    const range = /values\/([^?]+)/.exec(decodeURIComponent(url))![1]!;
    const m = /!(\d+):(\d+)$/.exec(range)!;
    return Response.json({ values: rows.slice(+m[1]! - 1, +m[2]!) });
  }) as unknown as typeof fetch;
  return { puts, doFetch };
}

test("sift records the sheet row an item came from", () => {
  const { items } = sift("sheet", "Request\tStatus\nDark mode\topen\nFaster search\topen\n");
  expect(items.map((i) => [i.text, i.row])).toEqual([["Dark mode", 2], ["Faster search", 3]]);
});

const token = async () => "t";

test("sheet: adds a Status column when missing, then writes Done in the row", async () => {
  source(SHEET);
  writeIcebox(state, [item(SHEET, { row: 2 })]);
  const g = google([["Request"], ["Dark mode"]]);
  await writeBacks(state, { fetch: g.doFetch, token });
  expect(g.puts.map((p) => [p.url.split("values/")[1]!.split("?")[0], p.body.values[0][0]])).toEqual([["'Req'!B1", "Status"], ["'Req'!B2", "Done in kaizen run r1."]]);
  expect(readIcebox(state)[0]!.written).toBeTruthy();
});

test("sheet: a row that no longer holds the request is left alone", async () => {
  source(SHEET);
  writeIcebox(state, [item(SHEET, { row: 2 })]);
  const g = google([["Request", "Status"], ["Something else", ""]]);
  await writeBacks(state, { fetch: g.doFetch, token });
  expect(g.puts).toEqual([]);
  expect(readIcebox(state)[0]).toMatchObject({ writeError: "the row has changed since it was gathered" });
});

test("sheet: uses the existing Status column", async () => {
  source(SHEET);
  writeIcebox(state, [item(SHEET, { row: 2 })]);
  const g = google([["Request", "Owner", "Status"], ["Dark mode", "x", ""]]);
  await writeBacks(state, { fetch: g.doFetch, token });
  expect(g.puts.map((p) => p.url.split("values/")[1]!.split("?")[0])).toEqual(["'Req'!C2"]);
});

test("sheet: a header below row 10 is still found", async () => {
  source(SHEET);
  const rows = [...Array.from({ length: 14 }, () => [""]), ["Request", "Status"], ["Dark mode", ""]];
  writeIcebox(state, [item(SHEET, { row: 16 })]);
  const g = google(rows);
  await writeBacks(state, { fetch: g.doFetch, token });
  expect(g.puts.map((p) => p.url.split("values/")[1]!.split("?")[0])).toEqual(["'Req'!B16"]);
});
