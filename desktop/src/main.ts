// Kaizen desktop: one window on the kaizen board, which this process starts and stops.
import { app, BrowserWindow, dialog, screen, shell, crashReporter } from "electron";
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { forgetBoard, freePort, pickKaizen, reapStale, rememberBoard, startBoard, stopBoard, waitReady, type Board } from "./server";
import { startUpdates } from "./updater";

const smoke = process.env.KAIZEN_DESKTOP_SMOKE === "1";
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
// Crash dumps stay on this machine (as Orca does); nothing is uploaded.
crashReporter.start({ uploadToServer: false });

if (!app.requestSingleInstanceLock()) app.exit(0);

let win: BrowserWindow | null = null;
let board: Board | null = null;
let quitting = false;

const res = app.isPackaged ? process.resourcesPath : join(__dirname, "..", "build");
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
  const port = await freePort();
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
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  const wc = win.webContents;
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

app.whenReady().then(async () => {
  // A board a crashed or killed launch left behind (review finding 3).
  await reapStale(boardFile());
  createWindow();
  void boot();
  if (!smoke) startUpdates((msg) => dialog.showMessageBox({ message: msg, buttons: ["OK"] }), testFeed, report);
});
