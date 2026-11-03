// Updates from GitHub Releases (the feed electron-builder writes as latest*.yml).
import { app, shell } from "electron";
import { autoUpdater } from "electron-updater";

export function startUpdates(tell: (msg: string) => void, testFeed?: string, report: (line: string) => void = console.log) {
  // A dev run has no feed. An unsigned macOS build cannot apply an update (Squirrel.Mac
  // checks the signature), so it is told where to download instead of failing quietly.
  if (!app.isPackaged) return;
  autoUpdater.autoInstallOnAppQuit = true;
  if (process.platform === "darwin") autoUpdater.autoDownload = false;
  autoUpdater.on("update-available", (i) => {
    if (process.platform === "darwin") tell(`Kaizen ${i.version} is out. Download it from github.com/hfadhlullah/kaizen/releases.`);
  });
  autoUpdater.on("error", (e) => (testFeed ? report(`kaizen-desktop update error ${e?.message ?? e}`) : console.error("[updater]", e?.message ?? e)));
  if (testFeed) {
    // CI's N to N+1 test: a local generic feed, then install at once, silently.
    autoUpdater.setFeedURL({ provider: "generic", url: testFeed });
    // The updater's own log goes to the test's report, so a fallback is seen.
    autoUpdater.logger = { info: (m) => report(`updater ${m}`), warn: (m) => report(`updater warn ${m}`), error: (m) => report(`updater error ${m}`), debug: () => {} };
    autoUpdater.on("update-not-available", () => { report("kaizen-desktop update none"); app.exit(2); });
    autoUpdater.on("update-downloaded", (i) => { report(`kaizen-desktop update downloaded ${i.version}`); autoUpdater.quitAndInstall(true, false); });
  }
  const check = () => autoUpdater.checkForUpdates().catch((e) => console.error("[updater]", e?.message ?? e));
  check();
  if (!testFeed) setInterval(check, 4 * 60 * 60 * 1000).unref();
}

// What the board's Check for updates and Update buttons ask for in the app, in the
// shape of the board's own /version answer.
let downloaded: string | null = null;
autoUpdater.on("update-downloaded", (i) => { downloaded = i.version; });

export async function checkNow() {
  const version = app.getVersion();
  if (!app.isPackaged) return { version, latest: null, update: false, notes: [], failed: null };
  try {
    const r = await autoUpdater.checkForUpdates();
    const latest = r?.updateInfo?.version ?? version;
    return { version, latest, update: latest !== version && r?.isUpdateAvailable !== false, notes: [], failed: null };
  } catch (e) {
    return { version, latest: null, update: false, notes: [], failed: null, error: String((e as Error)?.message ?? e) };
  }
}

// macOS cannot replace an unsigned app, so there Update opens the download page.
export async function installNow(): Promise<{ ok: boolean; opened?: string; error?: string }> {
  if (process.platform === "darwin") {
    const url = "https://github.com/hfadhlullah/kaizen/releases/latest";
    await shell.openExternal(url);
    return { ok: true, opened: url };
  }
  try {
    if (!downloaded) await autoUpdater.downloadUpdate();
    // Quit runs the board's own clean stop (before-quit), then the installer.
    // isForceRunAfter: the new build opens by itself once installed.
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}
