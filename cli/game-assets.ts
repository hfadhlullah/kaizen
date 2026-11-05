// The 3D files of the Game page (the forest, dungeon and town scenes, the hero, and hair and beard parts) are not in the package. They are release files
// fetched into ~/.kaizen/game/assets/ when the user asks, checked against a manifest of sha256 and size.
// Nothing here runs by itself: `kaizen game assets` and the page's Download button are the only callers.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";

// SCENES are the files a complete download has; hair-<id>.glb and beard-<id>.glb are optional parts of the hero.
export const SCENES = ["forest", "dungeon", "town", "hero"] as const;
export const SCENE_FILE = /^(forest|dungeon|town|hero|(?:hair|beard)-[a-z0-9]{1,16})\.glb$/;
export const MAX_SCENE_BYTES = 15 * 1024 * 1024;
export const ASSETS_URL = "https://github.com/hfadhlullah/kaizen/releases/download/game-assets-v1";

export const assetsDir = (home = homedir()) => join(home, ".kaizen", "game", "assets");
type Manifest = { version: 1; files: Record<string, { sha256: string; size: number }> };

// Reads a manifest and keeps only what is safe to act on; null when it is not one.
export function parseManifest(text: string): Manifest | null {
  let j: any;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || j.version !== 1 || !j.files || typeof j.files !== "object") return null;
  const files: Manifest["files"] = {};
  for (const [name, f] of Object.entries<any>(j.files)) {
    if (!SCENE_FILE.test(name)) continue;
    if (!f || typeof f.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(f.sha256) || !Number.isInteger(f.size) || f.size <= 0 || f.size > MAX_SCENE_BYTES) return null;
    files[name] = { sha256: f.sha256, size: f.size };
  }
  return { version: 1, files };
}

// Which scenes are on disk and match the manifest they came with (size only: cheap enough for every state read).
export function assetState(home = homedir()): { installed: string[]; missing: string[] } {
  const dir = assetsDir(home);
  let m: Manifest | null = null;
  try { m = parseManifest(readFileSync(join(dir, "manifest.json"), "utf8")); } catch { /* none yet */ }
  const installed = Object.entries(m?.files ?? {}).filter(([name, f]) => {
    try { return statSync(join(dir, name)).size === f.size; } catch { return false; }
  }).map(([name]) => name.slice(0, -4));
  return { installed, missing: SCENES.filter((s) => !installed.includes(s)) };
}

export type FetchResult = { ok: true; installed: string[] } | { ok: false; error: string };

// A body of at most `max` bytes, or null: the declared length is checked first and a stream that runs past it is cut.
async function readCapped(r: Response, max: number): Promise<Uint8Array | null> {
  const len = Number(r.headers.get("content-length"));
  if (Number.isFinite(len) && len > max) { await r.body?.cancel(); return null; }
  const out = new Uint8Array(max + 1);
  let n = 0;
  const reader = r.body?.getReader();
  if (!reader) return null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (n + value.length > max) { await reader.cancel(); return null; }
    out.set(value, n); n += value.length;
  }
  return out.slice(0, n);
}

const running = new Map<string, Promise<FetchResult>>();

// Downloads every scene named by the manifest at `base`, verifies it, and only then puts it in place.
// Every file is checked and staged first; the files and the manifest are swapped in together at the end, so a
// failure at any point leaves what was installed before exactly as it was. One download per folder at a time.
export function fetchAssets(home = homedir(), base = process.env.KAIZEN_ASSETS_URL || ASSETS_URL, get: typeof fetch = fetch): Promise<FetchResult> {
  const dir = assetsDir(home);
  const now = running.get(dir);
  if (now) return now;
  const p = download(home, base, get).finally(() => running.delete(dir));
  running.set(dir, p);
  return p;
}

// A folder instead of a URL (`kaizen game assets --from <folder>`, or KAIZEN_ASSETS_URL set to a path): the same manifest, the same
// size and hash checks, the files read from disk. For the folder `bun game-assets/pack.ts` writes, and for a machine with no release yet.
const isLocal = (base: string) => base.startsWith("file://") || isAbsolute(base);
const localPath = (base: string, name: string) => join(base.replace(/^file:\/\//, ""), name);
type Piece = { ok: true; bytes: Uint8Array } | { ok: false; error: string };

async function download(home: string, base: string, get: typeof fetch): Promise<FetchResult> {
  const dir = assetsDir(home), url = (n: string) => `${base.replace(/\/$/, "")}/${n}`;
  const staged: string[] = [];
  // One piece (the manifest or a scene) of at most `max` bytes, from the URL or the folder.
  const piece = async (name: string, max: number, timeout: number): Promise<Piece> => {
    if (isLocal(base)) {
      try {
        const f = localPath(base, name);
        if (statSync(f).size > max) return { ok: false, error: `${name}: larger than the ${max} bytes it may be` };
        return { ok: true, bytes: new Uint8Array(readFileSync(f)) };
      } catch { return { ok: false, error: `${name}: not found in ${base}` }; }
    }
    const r = await get(url(name), { signal: AbortSignal.timeout(timeout) });
    if (!r.ok) return { ok: false, error: `${name}: HTTP ${r.status}` };
    const b = await readCapped(r, max);
    return b ? { ok: true, bytes: b } : { ok: false, error: `${name}: size is not the ${max} bytes the manifest says` };
  };
  try {
    const mr = await piece("manifest.json", 64 * 1024, 20000);
    if (!mr.ok) return mr;
    const text = new TextDecoder().decode(mr.bytes);
    const m = parseManifest(text);
    if (!m || !Object.keys(m.files).length) return { ok: false, error: "manifest.json is not a valid asset manifest" };
    mkdirSync(dir, { recursive: true });
    for (const [name, f] of Object.entries(m.files)) {
      const got = await piece(name, f.size, 120000);
      if (!got.ok) return got;
      const buf = got.bytes;
      if (buf.length !== f.size) return { ok: false, error: `${name}: size is not the ${f.size} bytes the manifest says` };
      if (createHash("sha256").update(buf).digest("hex") !== f.sha256) return { ok: false, error: `${name}: sha256 does not match the manifest` };
      const tmp = join(dir, `.${name}.part`);
      writeFileSync(tmp, buf); staged.push(tmp);
    }
    const mtmp = join(dir, ".manifest.json.part");
    writeFileSync(mtmp, text); staged.push(mtmp);
    for (const name of Object.keys(m.files)) renameSync(join(dir, `.${name}.part`), join(dir, name));
    renameSync(mtmp, join(dir, "manifest.json"));
    return { ok: true, installed: assetState(home).installed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    for (const f of staged) { try { rmSync(f, { force: true }); } catch { /* ignore */ } }
  }
}

// The file to serve for GET /game/assets/<name>, or null.
export const assetFile = (name: string, home = homedir()): string | null =>
  SCENE_FILE.test(name) && assetState(home).installed.includes(name.slice(0, -4)) ? join(assetsDir(home), name) : null;
export const hasAssetsDir = (home = homedir()) => existsSync(assetsDir(home));
