// Updating the desktop app from another computer (a Steam Deck's app, used from a Mac over Tailscale). The app's own
// board cannot update the app around it, and only the app's window had an Update button. So the two share a folder:
// the app writes what it has downloaded to update.json (desktop/src/remote-update.ts), and the board, when someone
// presses Update in a page on another computer, writes install-request, which the app picks up and installs.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type DesktopStatus = { app: string; downloaded: string | null; platform: string; error?: string; at?: number };

export const desktopDir = (home: string) => join(home, ".kaizen", "desktop");
export const statusFile = (home: string) => join(desktopDir(home), "update.json");
export const requestFile = (home: string) => join(desktopDir(home), "install-request");

export function desktopStatus(home: string): DesktopStatus | null {
  try {
    const s = JSON.parse(readFileSync(statusFile(home), "utf8"));
    if (typeof s?.app !== "string") return null;
    return { app: s.app, downloaded: typeof s.downloaded === "string" ? s.downloaded : null, platform: String(s.platform ?? ""), ...(typeof s.error === "string" ? { error: s.error } : {}), ...(typeof s.at === "number" ? { at: s.at } : {}) };
  } catch {
    return null;
  }
}

const parts = (v: string) => v.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
export function newerVersion(a: string, b: string) {
  const pa = parts(a), pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

// A downloaded update the app can install by itself. macOS cannot: the app is unsigned, so there Update only opens the
// download page, on that Mac, which nobody looking from another computer would see.
export const installable = (s: DesktopStatus | null): s is DesktopStatus & { downloaded: string } =>
  !!s && !!s.downloaded && s.platform !== "darwin" && newerVersion(s.downloaded, s.app);

export function requestInstall(home: string, now = Date.now()): { ok: true; version: string } | { error: string; status: number } {
  const s = desktopStatus(home);
  if (!s) return { error: "The Kaizen app on that computer has not said which update it has. Restart the app there.", status: 409 };
  if (s.platform === "darwin") return { error: "A Mac cannot update the Kaizen app by itself. Update it on that Mac.", status: 409 };
  if (!installable(s)) return { error: "The Kaizen app on that computer has not downloaded a newer version yet. Try again in a few minutes.", status: 409 };
  try {
    mkdirSync(desktopDir(home), { recursive: true });
    const tmp = `${requestFile(home)}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: s.downloaded, at: now }));
    renameSync(tmp, requestFile(home));
  } catch (e) {
    return { error: `could not ask the app to update: ${(e as Error).message}`, status: 500 };
  }
  return { ok: true, version: s.downloaded };
}

export const requested = (home: string) => existsSync(requestFile(home));
