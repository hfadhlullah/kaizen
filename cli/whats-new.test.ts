import { test, expect, beforeEach } from "bun:test";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmp, entryFor, whatsNew, markSeen, seenVersion, hasEntry, entries, type Entry } from "./whats-new.ts";

const e = (version: string): Entry => ({ version, highlights: [{ title: "t", text: "x" }], fixes: ["f"] });
const list = [e("1.87.4"), e("1.9.0"), e("1.10.0")];
let home = "";
beforeEach(() => { home = mkdtempSync(join(tmpdir(), "kz-wn-")); });

test("versions compare as numbers", () => {
  expect(cmp("1.10.0", "1.9.0")).toBeGreaterThan(0);
  expect(cmp("1.87.4", "1.87.4")).toBe(0);
  expect(cmp("1.87.3", "1.87.4")).toBeLessThan(0);
});

test("the entry shown is the one for exactly the installed version, and nothing otherwise", () => {
  expect(entryFor(list, "1.87.4")?.version).toBe("1.87.4");
  expect(entryFor(list, "1.9.0")?.version).toBe("1.9.0");
  expect(entryFor(list, "1.87.9")).toBeNull();                // a release with no entry shows nothing, never an older release's notes
  expect(entryFor(list, "1.5.0")).toBeNull();
  expect(entryFor([], "1.87.4")).toBeNull();
});

test("an existing user sees it once; Got it ends it; a newer entry shows again", () => {
  expect(whatsNew(home, "1.87.4", false, list)).toMatchObject({ unseen: true, entry: { version: "1.87.4" } });
  markSeen(home, "1.87.4");
  expect(whatsNew(home, "1.87.4", false, list).unseen).toBe(false);
  expect(whatsNew(home, "1.87.9", false, list)).toMatchObject({ entry: null, unseen: false });   // a later patch with no entry: nothing
  expect(whatsNew(home, "1.88.0", false, [e("1.88.0"), ...list]).unseen).toBe(true);
  markSeen(home, "1.5.0");                                                    // never goes backwards
  expect(seenVersion(home)).toBe("1.87.4");
});

test("a fresh install is not greeted, and is recorded as having seen it", () => {
  expect(whatsNew(home, "1.87.4", true, list).unseen).toBe(false);
  expect(seenVersion(home)).toBe("1.87.4");
  expect(whatsNew(home, "1.87.4", false, list).unseen).toBe(false);           // later, with projects: still seen
});

test("an installed version with no entry shows nothing and writes nothing", () => {
  expect(whatsNew(home, "1.5.0", false, list)).toMatchObject({ entry: null, unseen: false });
  expect(existsSync(join(home, ".kaizen", "whats-new-seen.json"))).toBe(false);
});

test("the shipped file is valid: newest first, every entry has highlights and a fix list, text in plain words", () => {
  const all = entries();
  expect(all.length).toBeGreaterThan(0);
  expect(all.map((x) => x.version)).toEqual([...all.map((x) => x.version)].sort((a, b) => cmp(b, a)));
  for (const x of all) {
    expect(x.highlights.length).toBeGreaterThan(0);
    expect(x.highlights.length).toBeLessThanOrEqual(6);                         // highlights, not a changelog
    for (const h of x.highlights) { expect(h.title.length).toBeGreaterThan(3); expect(h.text.length).toBeGreaterThan(10); }
    expect(Array.isArray(x.fixes)).toBe(true);
  }
  expect(hasEntry(all[0]!.version)).toBe(true);
  expect(JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")).version).toBeTruthy();
});

test("an update waiting shows the newest release's own entry, read from its tag once", async () => {
  const { upcoming } = await import("./whats-new.ts");
  const urls: string[] = [];
  const list = [{ version: "9.1.0", highlights: [{ title: "New", text: "Thing." }], fixes: ["A fix."] }, { version: "9.0.0", highlights: [], fixes: [] }];
  const get = (async (u: string) => { urls.push(u); return new Response(JSON.stringify(list)); }) as unknown as typeof fetch;
  expect((await upcoming("9.1.0", get))?.highlights[0]?.title).toBe("New");
  expect(await upcoming("9.1.0", get)).not.toBeNull();
  expect(urls).toEqual(["https://raw.githubusercontent.com/hfadhlullah/kaizen/v9.1.0/cli/whats-new.json"]); // read once
  expect(await upcoming("9.2.0", get)).toBeNull(); // no entry of its own
  expect(await upcoming("../x", get)).toBeNull();
  const bad = (async () => new Response(JSON.stringify([{ version: "9.3.0", highlights: [{ title: 1 }], fixes: [] }]))) as unknown as typeof fetch;
  expect(await upcoming("9.3.0", bad)).toBeNull();
  expect(await upcoming("9.4.0", (async () => new Response("", { status: 404 })) as unknown as typeof fetch)).toBeNull();
});
