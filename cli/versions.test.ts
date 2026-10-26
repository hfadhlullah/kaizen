import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import * as v from "./versions.ts";

const md5 = (f: string) => createHash("md5").update(readFileSync(f)).digest("hex");
const LATER = Date.now() + 60_000;   // "now" well past the settle time, so fresh test files file

// A place with one video "clip": a draft (film.json, lines.json, a voice line, footage that is never
// part of a recipe) and renders in the scripts' layout, output/clip/<preset>/clip.mp4.
function place() {
  const p = mkdtempSync(join(tmpdir(), "kaizen-versions-"));
  const vd = join(p, "videos", "clip");
  mkdirSync(join(vd, "raw"), { recursive: true });
  writeFileSync(join(vd, "film.json"), '{"preset":"film-a","title":"one"}');
  writeFileSync(join(vd, "lines.json"), '{"v01":"hello"}');
  writeFileSync(join(vd, "v01.mp3"), "voice");
  writeFileSync(join(vd, "raw", "take.mp4"), "footage");
  return p;
}
function render(p: string, preset: string, body: string, extras = true) {
  const d = join(p, "output", "clip", preset);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "clip.mp4"), body);
  if (extras) { writeFileSync(join(d, "clip.srt"), "srt " + body); writeFileSync(join(d, "clip-thumb.jpg"), "jpg"); writeFileSync(join(d, "CREDITS.txt"), "credits"); }
}

test("first sight: existing renders become versions oldest first, previous/ copies their history, recipe unknown", () => {
  const p = place();
  render(p, "film-a", "A");
  mkdirSync(join(p, "output", "clip", "film-a", "previous"), { recursive: true });
  writeFileSync(join(p, "output", "clip", "film-a", "previous", "clip-20261020.mp4"), "A-old");
  writeFileSync(join(p, "output", "clip", "film-a", "previous", "clip-thumb-20261020.jpg"), "old-jpg");
  render(p, "film-b", "B");
  v.fileRenders(p, "clip", LATER);
  const s = v.readStore(p, "clip")!;
  expect(s.versions.map((x) => [x.letter, x.preset, x.current, x.revs.length])).toEqual([["a", "film-a", 2, 2], ["b", "film-b", 1, 1]]);
  expect(s.versions.every((x) => x.revs.every((r) => !r.recipe))).toBe(true);
  const files = v.revFiles(p, "clip");
  expect(files.map((f) => `${f.letter}${f.n}:${f.kind}`)).toEqual(["a1:history", "a2:current", "b1:current"]);
  expect(readFileSync(join(p, "output", "clip", "versions", "a", "2", "clip.mp4"), "utf8")).toBe("A");
  expect(readFileSync(join(p, "output", "clip", "versions", "a", "1", "clip-20261020.mp4"), "utf8")).toBe("A-old");
  expect(files[0]!.thumb).toBe("o/versions/a/1/clip-20261020-thumb.jpg");
  // Moved, not copied: nothing left in the old place but its CREDITS.txt.
  expect(existsSync(join(p, "output", "clip", "film-a", "clip.mp4"))).toBe(false);
  expect(v.revise(p, "clip", "a")).toContain("cannot be revised");
});

test("a render still settling is not filed", () => {
  const p = place();
  render(p, "film-a", "A");
  v.fileRenders(p, "clip", Date.now());
  expect(v.readStore(p, "clip")).toBe(null);
  expect(existsSync(join(p, "output", "clip", "film-a", "clip.mp4"))).toBe(true);
});

test("revise b, try, keep, restore, revert: a and the other files are never touched", () => {
  const p = place();
  // A store already exists, so new renders are filed with their recipe.
  render(p, "film-a", "A"); v.fileRenders(p, "clip", LATER);
  render(p, "film-b", "B"); v.fileRenders(p, "clip", LATER);
  const aMp4 = join(p, "output", "clip", "versions", "b", "1", "clip.mp4");
  expect(v.readStore(p, "clip")!.versions.map((x) => x.letter)).toEqual(["a", "b"]);
  const b1 = v.readStore(p, "clip")!.versions[1]!.revs[0]!;
  expect(b1.recipe).toBe(true);
  const keepA = md5(join(p, "output", "clip", "versions", "a", "1", "clip.mp4"));

  // Revise b: its recipe becomes the draft.
  writeFileSync(join(p, "videos", "clip", "film.json"), '{"preset":"film-b","title":"changed elsewhere"}');
  expect(v.revise(p, "clip", "b")).toBe(null);
  expect(v.readStore(p, "clip")!.revising).toBe("b");
  // (the recipe saved at b's filing held the film.json of that moment)
  expect(readFileSync(join(p, "videos", "clip", "film.json"), "utf8")).toBe('{"preset":"film-a","title":"one"}');
  expect(existsSync(join(p, "videos", "clip", "raw", "take.mp4"))).toBe(true);

  // A change and a render: filed as b's try, from b1.
  writeFileSync(join(p, "videos", "clip", "film.json"), '{"preset":"film-b","title":"horror"}');
  render(p, "film-b", "B2"); v.fileRenders(p, "clip", LATER);
  let b = v.readStore(p, "clip")!.versions.find((x) => x.letter === "b")!;
  expect([b.current, b.trying, b.revs.at(-1)!.from]).toEqual([1, 2, "b1"]);
  expect(v.revFiles(p, "clip").filter((f) => f.letter === "b").map((f) => `${f.n}:${f.kind}`)).toEqual(["1:current", "2:trying"]);

  // A second try replaces the first (one try at a time).
  render(p, "film-b", "B3"); v.fileRenders(p, "clip", LATER);
  b = v.readStore(p, "clip")!.versions.find((x) => x.letter === "b")!;
  expect([b.current, b.trying, b.revs.map((r) => r.n)]).toEqual([1, 3, [1, 3]]);
  expect(existsSync(join(p, "output", "clip", "versions", "b", "2"))).toBe(false);

  // Keep: the try is b; b1 is history.
  expect(v.keep(p, "clip", "b")).toBe(null);
  expect(v.revFiles(p, "clip").filter((f) => f.letter === "b").map((f) => `${f.n}:${f.kind}`)).toEqual(["1:history", "3:current"]);
  // Restore b1: swapped back.
  expect(v.restore(p, "clip", "b", 1)).toBe(null);
  expect(v.revFiles(p, "clip").filter((f) => f.letter === "b").map((f) => `${f.n}:${f.kind}`)).toEqual(["1:current", "3:history"]);
  expect(readFileSync(aMp4, "utf8")).toBe("B");
  // b is being revised, so the draft followed b back to v1's recipe.
  expect(readFileSync(join(p, "videos", "clip", "film.json"), "utf8")).toBe('{"preset":"film-a","title":"one"}');

  // Another try, then Revert: its files go, the draft goes back to b's current recipe.
  render(p, "film-b", "B4"); v.fileRenders(p, "clip", LATER);
  expect(v.revert(p, "clip", "b")).toBe(null);
  b = v.readStore(p, "clip")!.versions.find((x) => x.letter === "b")!;
  expect([b.current, b.trying]).toEqual([1, null]);
  expect(existsSync(join(p, "output", "clip", "versions", "b", "4"))).toBe(false);
  expect(readFileSync(join(p, "videos", "clip", "film.json"), "utf8")).toBe('{"preset":"film-a","title":"one"}');

  // a never moved or changed.
  expect(md5(join(p, "output", "clip", "versions", "a", "1", "clip.mp4"))).toBe(keepA);

  // Delete a history revision, then the whole version.
  expect(v.remove(p, "clip", "b", 1)).toBe("only a history revision can be deleted on its own");
  expect(v.remove(p, "clip", "b", 3)).toBe(null);
  expect(v.remove(p, "clip", "b", undefined)).toBe("only a history revision can be deleted on its own");
  expect(v.remove(p, "clip", "b", "all")).toBe(null);
  expect(v.readStore(p, "clip")!.versions.map((x) => x.letter)).toEqual(["a"]);
  expect(existsSync(join(p, "output", "clip", "versions", "b"))).toBe(false);
  expect(existsSync(join(p, "videos", "clip", "versions", "b"))).toBe(false);
  expect(v.readStore(p, "clip")!.revising).toBe(null);
});

test("two renders settling in one pass while revising: the first is the try, the second a new letter", () => {
  const p = place();
  writeFileSync(join(p, "videos", "clip", "versions.json"), '{"revising":null,"versions":[]}');
  render(p, "film-a", "A"); v.fileRenders(p, "clip", LATER);
  expect(v.revise(p, "clip", "a")).toBe(null);
  render(p, "film-a", "A2"); render(p, "film-b", "B");
  v.fileRenders(p, "clip", LATER);
  const s = v.readStore(p, "clip")!;
  expect(s.versions.map((x) => [x.letter, x.current, x.trying])).toEqual([["a", 1, 2], ["b", 1, null]]);
  expect(readFileSync(join(p, "output", "clip", "versions", "a", "2", "clip.mp4"), "utf8")).toBe("A2");
  expect(readFileSync(join(p, "output", "clip", "versions", "b", "1", "clip.mp4"), "utf8")).toBe("B");
});

test("files a crashed filing left behind are kept on disk and never listed", () => {
  const p = place();
  mkdirSync(join(p, "output", "clip", "versions", "a", "1"), { recursive: true });
  writeFileSync(join(p, "output", "clip", "versions", "a", "1", "aaa-orphan.mp4"), "orphan");
  render(p, "film-a", "A"); v.fileRenders(p, "clip", LATER);
  expect(v.revFiles(p, "clip").map((f) => f.mp4)).toEqual(["o/versions/b/1/clip.mp4"]);
  expect(readFileSync(join(p, "output", "clip", "versions", "a", "1", "aaa-orphan.mp4"), "utf8")).toBe("orphan");
});

test("bad letters and revisions are refused", () => {
  const p = place();
  render(p, "film-a", "A"); v.fileRenders(p, "clip", LATER);
  for (const l of ["../a", "A", "", "abcd", 3, null]) expect(v.keep(p, "clip", l)).toBe("unknown version");
  expect(v.keep(p, "clip", "z")).toBe("unknown version");
  expect(v.keep(p, "clip", "a")).toBe("nothing is being tried on this version");
  expect(v.restore(p, "clip", "a", 1)).toBe("not a history revision of this version");
  expect(v.restore(p, "clip", "a", "../../x")).toBe("not a history revision of this version");
  expect(readdirSync(join(p, "output", "clip", "versions"))).toEqual(["a"]);
});
