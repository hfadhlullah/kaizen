// What the compiled app needs to behave like a desktop app on macOS and Windows: no
// terminal to read errors from, and no shell PATH. Windows installs through the setup
// wizard (scripts/installer.nsi).
// Text reaches osascript and PowerShell through environment variables, never the script.

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
