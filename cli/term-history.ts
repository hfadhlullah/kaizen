import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename } from "node:path";

// Read saved history without starting a shell or executing its startup files.
export function parseHistory(text: string, kind: string): string[] {
  if (kind === "fish") return text.split(/\r?\n/).filter((s) => s.startsWith("- cmd: ")).map((s) => s.slice(7).replace(/\\(\\|n)/g, (_, c) => c === "n" ? "\n" : "\\"));
  const commands: string[] = [];
  let pending = "";
  for (const line of text.split(/\r?\n/)) {
    if (kind === "bash" && /^#\d+$/.test(line)) continue;
    const value = kind === "zsh" ? line.replace(/^: \d+:\d+;/, "") : line;
    if (kind === "zsh" && value.endsWith("\\")) { pending += value.slice(0, -1) + "\n"; continue; }
    if (value || pending) commands.push(pending + value);
    pending = "";
  }
  if (pending) commands.push(pending.trimEnd());
  return commands;
}

export async function shellHistory(env: NodeJS.ProcessEnv = process.env, root = homedir()): Promise<string[]> {
  const preferred = basename(env.SHELL || "bash").replace(/\.exe$/i, "");
  const files: [string, string][] = [
    [join(root, ".bash_history"), "bash"],
    [join(env.ZDOTDIR || root, ".zsh_history"), "zsh"],
    [join(env.XDG_DATA_HOME || join(root, ".local", "share"), "fish", "fish_history"), "fish"],
    [join(env.APPDATA || join(root, "AppData", "Roaming"), "Microsoft", "Windows", "PowerShell", "PSReadLine", "ConsoleHost_history.txt"), "powershell"],
    [join(env.XDG_DATA_HOME || join(root, ".local", "share"), "powershell", "PSReadLine", "ConsoleHost_history.txt"), "powershell"],
  ];
  files.sort((a, b) => Number(a[1] === preferred) - Number(b[1] === preferred));
  if (env.HISTFILE) files.push([env.HISTFILE.replace(/^~\//, root + "/"), preferred]);
  const commands: string[] = [];
  for (const [path, kind] of files) {
    let file;
    try {
      file = await open(path, "r");
      const stat = await file.stat();
      if (!stat.isFile()) continue;
      const start = Math.max(0, stat.size - 512 * 1024);
      const buffer = Buffer.alloc(Math.min(stat.size, 512 * 1024));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, start);
      let text = buffer.subarray(0, bytesRead).toString("utf8");
      if (start) text = text.slice(text.indexOf("\n") + 1);
      commands.push(...parseHistory(text, kind));
    } catch { /* A shell may have no saved history or disable it. */ }
    finally { await file?.close(); }
  }
  return [...new Set(commands.reverse().filter((s) => s.trim()))].slice(0, 500);
}
