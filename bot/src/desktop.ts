// What the compiled app needs to behave like a desktop app on macOS and Windows: no
// terminal to read errors from, no shell PATH, and on Windows an install step.
// Text reaches osascript and PowerShell through environment variables, never the script.
import { join, dirname } from "node:path";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// Embedded by `bun build --compile`; the Start menu shortcut's icon.
import ICON from "../../assets/kaizen.ico" with { type: "file" };

const PS = ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"];
// Bounded, for commands that never wait on the user; a dialog passes timeout 0 (none).
const run = (cmd: string[], env: Record<string, string> = {}, timeout = 10_000) => {
  try { return Bun.spawnSync(cmd, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "ignore"], windowsHide: true, timeout: timeout || undefined }); }
  catch { return null; }
};

// A Finder-launched app gets launchd's PATH (/usr/bin:/bin:...), which has no Homebrew,
// no ~/.bun/bin, so no `kaizen`. Ask the user's own shell, as Terminal would.
export function loginPath(shell = process.env.SHELL || "/bin/zsh"): string | null {
  const r = run([shell, "-ilc", 'printf "\\n__KB_PATH__%s" "$PATH"']);
  return r?.success ? pathFrom(r.stdout.toString()) : null;
}
// rc files may print banners first; only what follows the marker is the PATH.
export const pathFrom = (out: string) => (out.includes("__KB_PATH__") && out.split("__KB_PATH__").at(-1)?.trim()) || null;

// A message box; returns once it is closed. Elsewhere, or if it can't open, stderr.
export function dialog(message: string, platform = process.platform) {
  const cmd = platform === "darwin" ? ["osascript", "-e", 'display alert "Kaizen Bot" message (system attribute "KB_MSG")']
    : platform === "win32" ? [...PS, "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($env:KB_MSG, 'Kaizen Bot')"]
    : null;
  if (!cmd || !run(cmd, { KB_MSG: message }, 0)?.success) console.error(message);
}

const UNINSTALL_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\KaizenBot";
export const winPaths = (env: Record<string, string | undefined> = process.env) => {
  const dir = join(env.LOCALAPPDATA ?? join(env.USERPROFILE ?? "", "AppData", "Local"), "Programs", "Kaizen Bot");
  return { dir, exe: join(dir, "Kaizen Bot.exe"), ico: join(dir, "kaizen.ico"),
    lnk: join(env.APPDATA ?? join(env.USERPROFILE ?? "", "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Kaizen Bot.lnk") };
};
export const isInstalled = (execPath: string, dir: string) => dirname(execPath).toLowerCase() === dir.toLowerCase();

// Opened from anywhere but its install folder: copy itself there, add a Start menu entry
// and an Installed-apps entry, start the installed copy, and return true so the caller
// exits. Returns false to keep running from where it is (already installed, or the copy
// failed — the reason is shown).
export function installWindows(version: string): boolean {
  const p = winPaths();
  if (isInstalled(process.execPath, p.dir)) return false;
  try {
    mkdirSync(p.dir, { recursive: true });
    copyFileSync(process.execPath, p.exe);
  } catch (e) {
    // Most often the installed copy is running; open that one, which opens its window.
    if (!existsSync(p.exe)) { dialog(`Could not install Kaizen Bot to ${p.dir}: ${(e as Error).message}\nIt runs from here instead.`); return false; }
  }
  try { writeFileSync(p.ico, readFileSync(ICON)); } catch { /* the shortcut falls back to the exe's icon */ }
  const lnk = run([...PS, "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:KB_LNK); $s.TargetPath = $env:KB_EXE; $s.WorkingDirectory = $env:KB_DIR; $s.IconLocation = $env:KB_ICO; $s.Save()"],
    { KB_LNK: p.lnk, KB_EXE: p.exe, KB_DIR: p.dir, KB_ICO: p.ico });
  if (!lnk?.success) dialog(`Kaizen Bot is installed in ${p.dir}, but the Start menu shortcut could not be made. Open it from that folder.`);
  const reg = (name: string, value: string, type = "REG_SZ") => run(["reg", "add", UNINSTALL_KEY, "/v", name, "/t", type, "/d", value, "/f"]);
  reg("DisplayName", "Kaizen Bot");
  reg("DisplayVersion", version);
  reg("Publisher", "Kaizen");
  reg("DisplayIcon", p.ico);
  reg("InstallLocation", p.dir);
  reg("UninstallString", `"${p.exe}" --uninstall`);
  reg("NoModify", "1", "REG_DWORD");
  reg("NoRepair", "1", "REG_DWORD");
  try {
    Bun.spawn([p.exe], { cwd: p.dir, stdio: ["ignore", "ignore", "ignore"], detached: true, windowsHide: true }).unref();
    return true;
  } catch (e) {
    dialog(`Installed to ${p.dir} but could not start it: ${(e as Error).message}`);
    return false;
  }
}

// `--uninstall`, from Installed apps. A running exe can't delete itself, so the folder
// goes once this process has exited. ~/.kaizen-bot (chats and settings) stays.
export function uninstallWindows(dataDir: string) {
  const p = winPaths();
  // A running copy holds its exe open; stop it, but not this process.
  run(["taskkill", "/f", "/im", "Kaizen Bot.exe", "/fi", `PID ne ${process.pid}`]);
  try { rmSync(p.lnk, { force: true }); } catch { /* already gone */ }
  run(["reg", "delete", UNINSTALL_KEY, "/f"]);
  try {
    Bun.spawn([...PS, "Wait-Process -Id $env:KB_PID -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; Remove-Item -LiteralPath $env:KB_DIR -Recurse -Force"],
      { env: { ...process.env, KB_DIR: p.dir, KB_PID: String(process.pid) }, stdio: ["ignore", "ignore", "ignore"], detached: true, windowsHide: true }).unref();
  } catch { /* the folder stays; the shortcut and entry are gone */ }
  dialog(`Kaizen Bot is uninstalled.\nYour chats and settings are still in ${dataDir}; delete that folder to remove them too.`);
}
