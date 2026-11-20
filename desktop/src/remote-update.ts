// Update from another computer: the app's board (cli/desktop-update.ts) reads update.json to offer Update in a page
// opened elsewhere (a Steam Deck's app used from a Mac over Tailscale), and writes install-request when it is pressed.
// The app installs the update it downloaded, as its own Update button does, and restarts on the same port.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const remoteDir = (home: string) => join(home, ".kaizen", "desktop");

export function writeStatus(home: string, s: { app: string; downloaded: string | null; platform: string; error?: string }, now = Date.now()) {
  try {
    mkdirSync(remoteDir(home), { recursive: true });
    const f = join(remoteDir(home), "update.json");
    writeFileSync(`${f}.tmp`, JSON.stringify({ ...s, at: now }));
    renameSync(`${f}.tmp`, f);
  } catch { /* a read-only home: nobody can ask from elsewhere, nothing else breaks */ }
}

// A request older than this is from before the app last ran (pressed while it was closed): never act on it at start.
export const STALE_MS = 2 * 60 * 1000;

/** Takes a waiting request, if any, and removes it; true when it is fresh enough to act on. */
export function takeRequest(home: string, now = Date.now()): boolean {
  const f = join(remoteDir(home), "install-request");
  if (!existsSync(f)) return false;
  let at = 0;
  try { at = Number(JSON.parse(readFileSync(f, "utf8"))?.at) || 0; } catch { /* unreadable: stale */ }
  rmSync(f, { force: true });
  return now - at < STALE_MS;
}

/** Checks for a request every 2 s; `install` runs at most one at a time. */
export function watchRequests(home: string, install: () => Promise<void>) {
  let busy = false;
  const t = setInterval(() => {
    if (busy || !takeRequest(home)) return;
    busy = true;
    void install().finally(() => { busy = false; });
  }, 2000);
  t.unref?.();
  return () => clearInterval(t);
}
