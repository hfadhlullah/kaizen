// The 3D scenes of the Game page (forest, dungeon, town) are not in the package. They are release files
// fetched into ~/.kaizen/game/assets/ when the user asks, checked against a manifest of sha256 and size.
// Nothing here runs by itself: `kaizen game assets` and the page's Download button are the only callers.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const SCENES = ["forest", "dungeon", "town"] as const;
export const SCENE_FILE = /^(forest|dungeon|town)\.glb$/;
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
  const installed = SCENES.filter((s) => {
    const f = m?.files[`${s}.glb`];
    try { return !!f && statSync(join(dir, `${s}.glb`)).size === f.size; } catch { return false; }
  });
  return { installed: [...installed], missing: SCENES.filter((s) => !installed.includes(s)) };
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

async function download(home: string, base: string, get: typeof fetch): Promise<FetchResult> {
  const dir = assetsDir(home), url = (n: string) => `${base.replace(/\/$/, "")}/${n}`;
  const staged: string[] = [];
  try {
    const mr = await get(url("manifest.json"), { signal: AbortSignal.timeout(20000) });
    if (!mr.ok) return { ok: false, error: `manifest.json: HTTP ${mr.status}` };
    const mb = await readCapped(mr, 64 * 1024);
    const text = mb ? new TextDecoder().decode(mb) : "";
    const m = parseManifest(text);
    if (!m || !Object.keys(m.files).length) return { ok: false, error: "manifest.json is not a valid asset manifest" };
    mkdirSync(dir, { recursive: true });
    for (const [name, f] of Object.entries(m.files)) {
      const r = await get(url(name), { signal: AbortSignal.timeout(120000) });
      if (!r.ok) return { ok: false, error: `${name}: HTTP ${r.status}` };
      const buf = await readCapped(r, f.size);
      if (!buf || buf.length !== f.size) return { ok: false, error: `${name}: size is not the ${f.size} bytes the manifest says` };
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
