// Updates from GitHub Releases (the feed electron-builder writes as latest*.yml).
import { app } from "electron";
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
