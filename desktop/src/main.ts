// Kaizen desktop: one window on the kaizen board, which this process starts and stops.
import { app, BrowserWindow, Menu, Notification, dialog, ipcMain, screen, shell, crashReporter } from "electron";
import { appendFileSync, existsSync, openSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { boardPort, forgetBoard, needsUpgrade, windowButtons, pickKaizen, reapStale, rememberBoard, startBoard, stopBoard, upgradeCmd, versionOf, waitReady, type Board } from "./server";
import { checkNow, installNow, startUpdates } from "./updater";
import { desktopEntry } from "./appimage";
import { autoUpdater } from "electron-updater";

const smoke = process.env.KAIZEN_DESKTOP_SMOKE === "1";
// The window buttons' strip, in the board's own background and ink (web/board.html :root tokens).
const TITLE_BAR = {
  light: { color: "#f7f7f7", symbolColor: "#171717", height: 44 },
  dark: { color: "#121212", symbolColor: "#e5e5e5", height: 44 },
} as const;
// CI's update test (scripts/update-test.ts): a hidden window, updates from this feed.
// Only a build made by that script honours it (its package.json carries
// kaizenUpdateTest), so a release build can never be pointed at another feed.
const testBuild = (() => {
  try { return !!JSON.parse(readFileSync(join(app.getAppPath(), "package.json"), "utf8")).kaizenUpdateTest; }
  catch { return false; }
})();
const testFeed = testBuild ? process.env.KAIZEN_DESKTOP_TEST_FEED : undefined;
// In a test build results also go to a file: a Windows GUI build has no stdout a script can read.
export function report(line: string) {
  console.log(line);
  if (testBuild && process.env.KAIZEN_DESKTOP_OUT) try { appendFileSync(process.env.KAIZEN_DESKTOP_OUT, line + "\n"); } catch { /* nowhere to write */ }
}
// An AppImage started by hand is mounted, which is what lets its children die with SIGBUS
// when the mount goes away (src/appimage.ts, issue #77). Start it again extracted and
// leave; the menu entry already does this, so that start does not loop.
if (process.platform === "linux" && process.env.APPIMAGE && !process.env.APPIMAGE_EXTRACT_AND_RUN && !smoke && !testBuild) {
  try {
    spawn(process.env.APPIMAGE, process.argv.slice(1), { detached: true, stdio: "ignore", env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: "1" } }).unref();
    app.exit(0);
  } catch { /* cannot start it again: carry on mounted */ }
}
// Crash dumps stay on this machine (as Orca does); nothing is uploaded.
crashReporter.start({ uploadToServer: false });

// The updater starts the new AppImage while this one is still quitting
// (APPIMAGE_SILENT_INSTALL), so that launch waits up to 15 s for the lock instead of
// exiting at once; a plain second launch still just focuses the first.
let locked = app.requestSingleInstanceLock();
for (let i = 0; !locked && process.env.APPIMAGE_SILENT_INSTALL && i < 30; i++) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  locked = app.requestSingleInstanceLock();
}
if (!locked) app.exit(0);

let win: BrowserWindow | null = null;
let board: Board | null = null;
let quitting = false;

// app.getAppPath(), not __dirname: bun build bakes __dirname in as the source folder.
const res = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), "build");
const bunPath = join(res, app.isPackaged ? "bun" : `bun-${process.arch}`, process.platform === "win32" ? "bun.exe" : "bun");
const logFile = join(homedir(), ".kaizen", "web.log");
const stateFile = () => join(app.getPath("userData"), "window.json");
const boardFile = () => join(app.getPath("userData"), "board.json");

// Every stop still in flight. Quit waits for all of them, however many times it is
// asked, so no board outlives the app (review findings 2 and 4).
const stops = new Set<Promise<void>>();
function stop(b: Board) {
  const p: Promise<void> = stopBoard(b.child).finally(() => { stops.delete(p); forgetBoard(boardFile()); });
  stops.add(p);
  return p;
}

function savedBounds() {
  try {
    const b = JSON.parse(readFileSync(stateFile(), "utf8"));
    // Only reuse a position that is still on a connected screen.
    const onScreen = screen.getAllDisplays().some((d) => b.x >= d.bounds.x && b.y >= d.bounds.y && b.x < d.bounds.x + d.bounds.width && b.y < d.bounds.y + d.bounds.height);
    return onScreen ? b : { width: b.width, height: b.height };
  } catch { return { width: 1360, height: 900 }; }
}

function page(title: string, body: string, actions = "") {
  const html = `<!doctype html><meta charset="utf-8"><title>Kaizen</title>
<style>body{font:15px system-ui,sans-serif;background:#111;color:#ddd;display:grid;place-items:center;height:100vh;margin:0}
main{max-width:560px;padding:24px}h1{font-size:20px;color:#fff}pre{white-space:pre-wrap;background:#1c1c1c;padding:12px;border-radius:6px;max-height:40vh;overflow:auto;font-size:12px}
a{display:inline-block;margin-right:12px;padding:8px 14px;background:#2b2b2b;color:#fff;border-radius:6px;text-decoration:none}</style>
<main><h1>${title}</h1>${body}<p>${actions}</p></main>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

async function boot() {
  if (!win) return;
  win.loadURL(page("Starting kaizen…", "<p>Starting the board.</p>"));
  if (!existsSync(bunPath)) return fail(`The bundled Bun is missing at ${bunPath}.`);
  const pick = pickKaizen(join(res, "kaizen"), process.env.KAIZEN_HOME ?? join(homedir(), "kaizen"));
  const port = await boardPort();
  if (quitting || !win) return;
  const b = startBoard({ bun: bunPath, dir: pick.dir, bundled: pick.bundled, port, cwd: homedir() });
  board = b;
  rememberBoard(boardFile(), b);
  b.child.once("exit", (code, sig) => {
    if (board !== b || quitting) return;
    board = null;
    fail(`The board stopped (${code ?? sig}).`, b.log.join(""));
  });
  try {
    await waitReady(b);
  } catch (e) {
    if (board === b) { board = null; await stop(b); fail(String((e as Error).message), b.log.join("")); }
    return;
  }
  if (board !== b || !win) return;
  await win.loadURL(b.url);
  if (smoke) { report(`kaizen-desktop ready ${b.url} version=${app.getVersion()} kaizen=${pick.dir}`); app.quit(); }
  else if (!testBuild) upgradeInstalled();
}

// After the app updates, the kaizen your agents use (~/kaizen: skills, subagents, commands) is
// brought up to it with `kaizen upgrade`, in the background once the board is up, once per app
// version. Left alone: no ~/kaizen (desktop only), a git checkout, or one already as new.
const upgradedFile = () => join(app.getPath("userData"), "upgraded.json");
function upgradeInstalled() {
  const installed = process.env.KAIZEN_HOME ?? join(homedir(), "kaizen"), v = app.getVersion();
  let last = "";
  try { last = JSON.parse(readFileSync(upgradedFile(), "utf8")).version ?? ""; } catch { /* first run */ }
  if (last === v) return;
  const why = needsUpgrade(join(res, "kaizen"), installed);
  try { mkdirSync(app.getPath("userData"), { recursive: true }); writeFileSync(upgradedFile(), JSON.stringify({ version: v, skipped: why })); } catch { /* retried next launch */ }
  if (why) return;
  const say = (body: string) => { if (Notification.isSupported()) new Notification({ title: "Kaizen", body }).show(); };
  const log = join(homedir(), ".kaizen", "upgrade.log");
  try {
    mkdirSync(join(homedir(), ".kaizen"), { recursive: true });
    const out = openSync(log, "a");
    const { argv, env } = upgradeCmd(bunPath, installed, process.env);
    // Detached, so closing the app does not cut an upgrade off halfway.
    const child = spawn(argv[0]!, argv.slice(1), { cwd: homedir(), env, stdio: ["ignore", out, out], detached: process.platform !== "win32", windowsHide: true });
    child.unref();
    child.on("exit", (code) => {
      const now = versionOf(installed);
      say(code === 0 ? `Your agents' kaizen skills are updated to ${now}.` : `kaizen upgrade did not finish (kaizen ${now}); see ~/.kaizen/upgrade.log.`);
    });
  } catch (e) {
    say(`kaizen upgrade could not start: ${(e as Error).message}`);
  }
}

function fail(why: string, log = "") {
  if (smoke) { report(`kaizen-desktop failed: ${why}\n${log}`); app.exit(1); return; }
  win?.loadURL(page("Kaizen could not keep the board running", `<p>${esc(why)}</p>${log ? `<pre>${esc(log.slice(-4000))}</pre>` : ""}`,
    `<a href="kaizen-desktop://restart">Restart</a><a href="kaizen-desktop://log">Open log</a>`));
}

function createWindow() {
  win = new BrowserWindow({
    ...savedBounds(),
    title: "Kaizen",
    backgroundColor: "#111111",
    show: !smoke && !testFeed,
    autoHideMenuBar: true,
    // No system title bar: the board's own top bar is it (web/*.html, html.desk). macOS keeps
    // its traffic lights inset; Windows and Linux draw their buttons over the page's top right.
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    ...(windowButtons(process.platform, process.env) ? { titleBarOverlay: TITLE_BAR.dark } : {}),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: join(app.getAppPath(), "dist", "preload.js") },
  });
  const wc = win.webContents;
  // A desktop app does not pinch-zoom its own window.
  wc.on("did-finish-load", () => { wc.setVisualZoomLevelLimits(1, 1).catch(() => {}); });
  // A browser has a right-click menu with Copy and Paste; Electron has none, so the board's
  // terminals and text could not be copied with the mouse.
  wc.on("context-menu", (_e, p) => {
    const items = [
      ...(p.isEditable ? [{ role: "cut" as const, enabled: p.editFlags.canCut }] : []),
      { role: "copy" as const, enabled: p.editFlags.canCopy },
      ...(p.isEditable ? [{ role: "paste" as const, enabled: p.editFlags.canPaste }] : []),
    ];
    Menu.buildFromTemplate(items).popup({ window: win! });
  });
  const ours = (url: string) => !!board && url.startsWith(board.url);
  // Error-page buttons, and links that leave the board, never navigate this window.
  wc.on("will-navigate", (e, url) => {
    if (ours(url)) return;
    e.preventDefault();
    if (url === "kaizen-desktop://restart") void restart();
    else if (url === "kaizen-desktop://log") void shell.openPath(logFile);
    else if (/^https?:/.test(url)) void shell.openExternal(url);
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (ours(url)) return { action: "allow" };
    if (/^https?:|^mailto:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  // The board can ask for the clipboard; it is a loopback page we started.
  wc.session.setPermissionRequestHandler((w, perm, cb) => cb(ours(w.getURL()) && ["clipboard-read", "clipboard-sanitized-write", "notifications"].includes(perm)));
  wc.session.setPermissionCheckHandler((_w, perm, origin) => ours(`${origin}/`) && ["clipboard-read", "clipboard-sanitized-write", "notifications"].includes(perm));
  wc.on("render-process-gone", (_e, d) => { if (d.reason !== "clean-exit" && board) win?.loadURL(board.url); });
  win.on("close", () => {
    try { mkdirSync(app.getPath("userData"), { recursive: true }); writeFileSync(stateFile(), JSON.stringify(win!.getNormalBounds())); } catch { /* not worth failing a close */ }
  });
  win.on("closed", () => { win = null; });
}

async function restart() {
  if (quitting) return;
  const b = board;
  board = null;
  if (b) await stop(b);
  await boot();
}

// The board page's update buttons (preload.ts). Only the board itself may ask.
const fromBoard = (e: Electron.IpcMainInvokeEvent) => !!board && (e.senderFrame?.url ?? "").startsWith(board.url);
// The page says when its theme is dark or light; the window buttons follow (not on macOS).
ipcMain.handle("kz-titlebar", (e, dark) => {
  if (!fromBoard(e) || !win || !windowButtons(process.platform, process.env)) return;
  try { win.setTitleBarOverlay(dark ? TITLE_BAR.dark : TITLE_BAR.light); } catch { /* no overlay on this window */ }
});
ipcMain.handle("kz-update-check", (e) => (fromBoard(e) ? checkNow() : null));
ipcMain.handle("kz-update-install", (e) => (fromBoard(e) ? installNow() : { ok: false, error: "not the board" }));

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

// Closing the window ends the app on every OS, macOS too: a board left running
// with no window is the failure this app exists to avoid.
app.on("window-all-closed", () => app.quit());

app.on("before-quit", (e) => {
  quitting = true;
  if (board) { stop(board); board = null; }
  if (!stops.size) return;
  e.preventDefault();
  void Promise.allSettled([...stops]).then(() => app.quit());
});

// Run as an AppImage: keep the app menu entry pointing at this file, and at the new
// one when an update renames it.
function menuEntry(file: string) {
  try { desktopEntry(file, join(process.resourcesPath, "icon.png")); } catch (e) { console.error("[menu entry]", e); }
}
if (process.platform === "linux" && process.env.APPIMAGE && !smoke) {
  menuEntry(process.env.APPIMAGE);
  autoUpdater.on("appimage-filename-updated", (f: string) => menuEntry(f));
}

app.whenReady().then(async () => {
  // A board a crashed or killed launch left behind (review finding 3).
  await reapStale(boardFile());
  createWindow();
  void boot();
  if (!smoke) startUpdates((msg) => dialog.showMessageBox({ message: msg, buttons: ["OK"] }), testFeed, report);
});
