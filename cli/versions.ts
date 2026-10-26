// Video versions: every render becomes a version (a, b, c…) with its own revisions and the recipe that
// made it, so a version can be revised, tried, kept, reverted or restored (references/revisions.md).
//
// The render scripts keep writing output/<name>/<preset>/<name>.mp4 (with .srt, -thumb.jpg and
// CREDITS.txt), whoever runs them; the board files those "loose" renders here the next time it lists
// the video. Files move by rename inside output/<name>/, never copied, so nothing is lost on the way.
//
//   videos/<name>/versions.json                  the store (below)
//   output/<name>/versions/<letter>/<n>/          a revision's MP4, captions, thumbnail, credits
//   videos/<name>/versions/<letter>/<n>/          the recipe: the small files that made it
import { cpSync, existsSync, mkdirSync, openSync, closeSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Rev = { n: number; at: number; from: string | null; recipe: boolean };
export type Version = { letter: string; preset: string; current: number; trying: number | null; revs: Rev[] };
export type Store = { revising: string | null; versions: Version[] };

// A render the scripts are still writing must not move: only MP4s left alone this long are filed.
const SETTLED_MS = 15_000;
// Recipe files above this size stay out (footage, music): the recipe is the small files that describe the film.
const RECIPE_MAX = 20 * 1024 * 1024;
const MEDIA = /\.(mp4|mov|mkv|webm|wav|m4a|flac)$/i;

const okLetter = (l: unknown): l is string => typeof l === "string" && /^[a-z]{1,3}$/.test(l);
const storeFile = (place: string, name: string) => join(place, "videos", name, "versions.json");
const revDir = (place: string, name: string, l: string, n: number) => join(place, "output", name, "versions", l, String(n));
const recipeDir = (place: string, name: string, l: string, n: number) => join(place, "videos", name, "versions", l, String(n));

export function readStore(place: string, name: string): Store | null {
  try {
    const s = JSON.parse(readFileSync(storeFile(place, name), "utf8"));
    return s && Array.isArray(s.versions) ? { revising: okLetter(s.revising) ? s.revising : null, versions: s.versions } : null;
  } catch { return null; }
}
function writeStore(place: string, name: string, s: Store) {
  const f = storeFile(place, name), tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 1));
  renameSync(tmp, f);
}

// Two boards (or a board and a test) can list the same video at once: one files, the other waits its turn.
// Returns { value } when it ran, null when another holder had the lock.
function locked<T>(place: string, name: string, fn: () => T): { value: T } | null {
  const lock = join(place, "videos", name, ".versions.lock");
  try { if (Date.now() - statSync(lock).mtimeMs > 60_000) unlinkSync(lock); } catch { /* none */ }
  let fd: number;
  try { fd = openSync(lock, "wx"); } catch { return null; }
  try { return { value: fn() }; } finally { closeSync(fd); try { unlinkSync(lock); } catch { /* gone */ } }
}

// A letter neither in the store nor on disk: folders a crashed filing left behind are skipped, never cleared.
const nextLetter = (s: Store, place: string, name: string) => {
  const used = new Set(s.versions.map((v) => v.letter));
  for (let i = 0; ; i++) {
    let l = "", k = i;
    do { l = String.fromCharCode(97 + (k % 26)) + l; k = Math.floor(k / 26) - 1; } while (k >= 0);
    if (!used.has(l) && !existsSync(join(place, "output", name, "versions", l)) && !existsSync(join(place, "videos", name, "versions", l))) return l;
  }
};

// The recipe: the video folder's own small files (film.json or config.json, lines, words, voice lines,
// pictures) plus transcript/*.json and images/, never the footage or the build.
function snapshotRecipe(vdir: string, to: string) {
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(vdir)) {
    const p = join(vdir, f);
    let st; try { st = statSync(p); } catch { continue; }
    // .mp3 is not MEDIA here: a film's voice lines (vNN.mp3) are part of what made it.
    if (st.isFile() && !MEDIA.test(f) && st.size <= RECIPE_MAX && !f.startsWith(".") && f !== "versions.json") cpSync(p, join(to, f));
  }
  for (const sub of ["images", "transcript"]) {
    const d = join(vdir, sub);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      const st = statSync(p);
      if (st.isFile() && st.size <= RECIPE_MAX && (sub === "images" || f.endsWith(".json"))) { mkdirSync(join(to, sub), { recursive: true }); cpSync(p, join(to, sub, f)); }
    }
  }
}

// Move one render (the MP4 and whatever of .srt / -thumb.jpg / CREDITS.txt sits beside it) into a revision folder.
function moveRender(fromDir: string, base: string, to: string, credits: boolean) {
  mkdirSync(to, { recursive: true });
  for (const [src, dst] of [[`${base}.mp4`, `${base}.mp4`], [`${base}.srt`, `${base}.srt`], [`${base}-thumb.jpg`, `${base}-thumb.jpg`]]) {
    if (existsSync(join(fromDir, src))) renameSync(join(fromDir, src), join(to, dst));
  }
  if (credits && existsSync(join(fromDir, "CREDITS.txt"))) cpSync(join(fromDir, "CREDITS.txt"), join(to, "CREDITS.txt"));
}

// File every settled loose render of this video. The first time (no store yet) existing renders are
// taken in as they are, oldest first, with their previous/ copies as history; they are marked
// recipe:false (what made them was not kept). After that, a new render becomes the "trying" revision
// of the version being revised, or a new letter, with the draft's recipe beside it.
export function fileRenders(place: string, name: string, now = Date.now()): void {
  const out = join(place, "output", name);
  let dirs: string[] = [];
  try { dirs = readdirSync(out).filter((d) => d !== "versions" && statSync(join(out, d)).isDirectory()); } catch { return; }
  const loose: { dir: string; preset: string; base: string; at: number }[] = [];
  for (const d of dirs) for (const f of readdirSync(join(out, d))) {
    if (!f.endsWith(".mp4") || f.endsWith(".raw.mp4")) continue;
    const at = statSync(join(out, d, f)).mtimeMs;
    if (now - at < SETTLED_MS) continue;
    loose.push({ dir: join(out, d), preset: d, base: f.slice(0, -4), at });
  }
  if (!loose.length) return;
  locked(place, name, () => {
    const vdir = join(place, "videos", name);
    const first = !existsSync(storeFile(place, name));
    const s = readStore(place, name) ?? { revising: null, versions: [] };
    let tried = false;
    for (const r of loose.sort((a, b) => a.at - b.at || a.preset.localeCompare(b.preset))) {
      if (!existsSync(join(r.dir, `${r.base}.mp4`))) continue;   // the other board filed it
      // Only the first render of a pass becomes the try: a second one (another shape or preset from the
      // same job) would replace it before anyone saw it, so it gets a letter of its own instead.
      const target = !first && !tried && s.revising ? s.versions.find((v) => v.letter === s.revising) : undefined;
      if (target) {
        // One try at a time: a newer try replaces the one not yet kept or reverted. Numbers only go up,
        // so a revision number always means the same render.
        let n = Math.max(0, ...target.revs.map((x) => x.n)) + 1;
        // A crashed filing may have left files at that number (even this very render): skip, never clear.
        while (existsSync(revDir(place, name, target.letter, n)) || existsSync(recipeDir(place, name, target.letter, n))) n++;
        if (target.trying != null) dropRev(place, name, target, target.trying);
        moveRender(r.dir, r.base, revDir(place, name, target.letter, n), true);
        snapshotRecipe(vdir, recipeDir(place, name, target.letter, n));
        target.revs.push({ n, at: r.at, from: `${target.letter}${target.current}`, recipe: true });
        target.trying = n;
        tried = true;
      } else {
        const v: Version = { letter: nextLetter(s, place, name), preset: r.preset, current: 1, trying: null, revs: [] };
        // Earlier deliveries master.sh kept (previous/<base>-<stamp>.mp4) become this version's history.
        let n = 0;
        const prev = join(r.dir, "previous");
        if (first && existsSync(prev)) {
          for (const f of readdirSync(prev).filter((f) => f.endsWith(".mp4")).sort()) {
            const pb = f.slice(0, -4);
            n++;
            moveRender(prev, pb, revDir(place, name, v.letter, n), false);
            // master.sh named the earlier thumbnail <name>-thumb-<stamp>.jpg, not <name>-<stamp>-thumb.jpg.
            const thumb = `${r.base}-thumb${pb.slice(r.base.length)}.jpg`;
            if (pb.startsWith(r.base) && existsSync(join(prev, thumb))) renameSync(join(prev, thumb), join(revDir(place, name, v.letter, n), `${pb}-thumb.jpg`));
            v.revs.push({ n, at: statSync(join(revDir(place, name, v.letter, n), `${pb}.mp4`)).mtimeMs, from: null, recipe: false });
          }
        }
        n++;
        moveRender(r.dir, r.base, revDir(place, name, v.letter, n), true);
        if (!first) snapshotRecipe(vdir, recipeDir(place, name, v.letter, n));
        v.revs.push({ n, at: r.at, from: null, recipe: !first });
        v.current = n;
        s.versions.push(v);
      }
      // Written after every render, so a crash leaves at most one render half filed.
      writeStore(place, name, s);
    }
  });
}

function dropRev(place: string, name: string, v: Version, n: number) {
  rmSync(revDir(place, name, v.letter, n), { recursive: true, force: true });
  rmSync(recipeDir(place, name, v.letter, n), { recursive: true, force: true });
  v.revs = v.revs.filter((r) => r.n !== n);
  if (v.trying === n) v.trying = null;
}

// The files of one revision, for listing: the MP4 and its captions and thumbnail, as page paths.
export type RevFile = { letter: string; preset: string; n: number; kind: "current" | "trying" | "history"; at: number; recipe: boolean; from: string | null; mp4: string; srt: string | null; thumb: string | null };
export function revFiles(place: string, name: string): RevFile[] {
  const s = readStore(place, name);
  if (!s) return [];
  const list: RevFile[] = [];
  for (const v of s.versions) for (const r of v.revs) {
    const d = revDir(place, name, v.letter, r.n);
    let files: string[] = [];
    try { files = readdirSync(d); } catch { continue; }
    const mp4 = files.find((f) => f.endsWith(".mp4"));
    if (!mp4) continue;
    const base = mp4.slice(0, -4), rel = `o/versions/${v.letter}/${r.n}/`;
    list.push({
      letter: v.letter, preset: v.preset, n: r.n, kind: r.n === v.trying ? "trying" : r.n === v.current ? "current" : "history",
      at: r.at, recipe: r.recipe, from: r.from, mp4: rel + mp4,
      srt: files.includes(`${base}.srt`) ? rel + `${base}.srt` : null, thumb: files.includes(`${base}-thumb.jpg`) ? rel + `${base}-thumb.jpg` : null,
    });
  }
  return list;
}

// ---- actions. Each returns an error a person can act on, or null. The caller checks no job or send runs.

function withVersion(place: string, name: string, letter: unknown, fn: (s: Store, v: Version) => string | null): string | null {
  if (!okLetter(letter)) return "unknown version";
  const r = locked(place, name, () => {
    const s = readStore(place, name);
    const v = s?.versions.find((x) => x.letter === letter);
    if (!s || !v) return "unknown version";
    const err = fn(s, v);
    if (!err) writeStore(place, name, s);
    return err;
  });
  return r === null ? "the versions are being updated; try again in a moment" : r.value;
}

// Copy a revision's recipe back into the video folder: it becomes the draft. Only recipe files are
// written; nothing else in the folder is removed.
function restoreRecipe(place: string, name: string, letter: string, n: number) {
  const from = recipeDir(place, name, letter, n), vdir = join(place, "videos", name);
  const copy = (src: string, dst: string) => {
    for (const f of readdirSync(src)) {
      const p = join(src, f);
      if (statSync(p).isDirectory()) { mkdirSync(join(dst, f), { recursive: true }); copy(p, join(dst, f)); }
      else cpSync(p, join(dst, f));
    }
  };
  copy(from, vdir);
}

// Revise: the version's current revision becomes the draft, and new renders file as its tries.
export const revise = (place: string, name: string, letter: unknown) => withVersion(place, name, letter, (s, v) => {
  const cur = v.revs.find((r) => r.n === v.current);
  if (!cur?.recipe) return "this version was rendered before kaizen kept recipes, so it cannot be revised; it can still be played, sent or deleted";
  restoreRecipe(place, name, v.letter, v.current);
  s.revising = v.letter;
  return null;
});

// Keep: the try becomes the version; the revision it replaced stays in the history.
export const keep = (place: string, name: string, letter: unknown) => withVersion(place, name, letter, (_s, v) => {
  if (v.trying == null) return "nothing is being tried on this version";
  v.current = v.trying;
  v.trying = null;
  return null;
});

// Revert: the try is deleted, and the draft goes back to the version's own recipe (when it has one).
export const revert = (place: string, name: string, letter: unknown) => withVersion(place, name, letter, (_s, v) => {
  if (v.trying == null) return "nothing is being tried on this version";
  // The draft goes back first: if that copy fails, the try is still there.
  if (v.revs.find((r) => r.n === v.current)?.recipe) restoreRecipe(place, name, v.letter, v.current);
  dropRev(place, name, v, v.trying);
  return null;
});

// Restore: a history revision becomes the version again; the current one goes to the history.
export const restore = (place: string, name: string, letter: unknown, n: unknown) => withVersion(place, name, letter, (s, v) => {
  const r = v.revs.find((x) => x.n === Number(n));
  if (!r || r.n === v.trying || r.n === v.current) return "not a history revision of this version";
  v.current = r.n;
  // The draft follows the version it is revising.
  if (s.revising === v.letter && r.recipe) restoreRecipe(place, name, v.letter, r.n);
  return null;
});

// Delete a history revision, or (n === "all") the whole version with every revision. Leaving n out
// deletes nothing, so a request missing it cannot take a whole version.
export const remove = (place: string, name: string, letter: unknown, n: unknown) => withVersion(place, name, letter, (s, v) => {
  if (n === "all") {
    for (const r of [...v.revs]) dropRev(place, name, v, r.n);
    rmSync(join(place, "output", name, "versions", v.letter), { recursive: true, force: true });
    rmSync(join(place, "videos", name, "versions", v.letter), { recursive: true, force: true });
    s.versions = s.versions.filter((x) => x !== v);
    if (s.revising === v.letter) s.revising = null;
    return null;
  }
  const r = v.revs.find((x) => x.n === Number(n));
  if (!r || r.n === v.current || r.n === v.trying) return "only a history revision can be deleted on its own";
  dropRev(place, name, v, r.n);
  return null;
});

// Stop revising (a render then makes a new letter again).
export function stopRevising(place: string, name: string) {
  locked(place, name, () => { const s = readStore(place, name); if (s?.revising) { s.revising = null; writeStore(place, name, s); } });
}
