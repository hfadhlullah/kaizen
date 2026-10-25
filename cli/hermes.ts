// WhatsApp through Hermes (`hermes send`): the chats it knows, and one file with a
// message to one of them. Always argv, never a shell line: the message is one argument.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type Chat = { id: string; name: string; type: string };
type Out = { code: number | string; out: string; err: string };

// On PATH first (tests put a fake there), else where Hermes' installer puts it: a board
// started from a desktop launcher often has no ~/.local/bin on its PATH.
function bin() {
  const p = Bun.which("hermes", { PATH: process.env.PATH ?? "" });
  if (p) return p;
  const home = join(process.env.HOME || process.env.USERPROFILE || "", ".local", "bin", "hermes");
  return existsSync(home) ? home : null;
}

function run(args: string[], ms: number): Promise<Out> {
  const exe = bin();
  if (!exe) return Promise.resolve({ code: "Hermes is not installed (no hermes on PATH or in ~/.local/bin)", out: "", err: "" });
  return new Promise((done) => {
    const p = spawn(exe, args, { env: process.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "", err = "";
    p.stdout!.on("data", (c) => { out += c; });
    p.stderr!.on("data", (c) => { err += c; });
    const t = setTimeout(() => { p.kill("SIGKILL"); done({ code: `Hermes did not finish in ${Math.round(ms / 1000)} s`, out, err }); }, ms);
    p.on("error", (e) => { clearTimeout(t); done({ code: `Hermes could not start: ${e.message}`, out, err }); });
    p.on("close", (c) => { clearTimeout(t); done({ code: c ?? 1, out, err }); });
  });
}
const lastLine = (s: string) => s.trim().split("\n").filter(Boolean).pop()?.replace(/^hermes send:\s*/, "") ?? "";

export async function targets(): Promise<{ chats: Chat[] } | { error: string }> {
  const r = await run(["send", "--list", "whatsapp", "--json"], 10_000);
  if (typeof r.code === "string") return { error: r.code };
  let j: any;
  try { j = JSON.parse(r.out); } catch { return { error: lastLine(r.err) || "Hermes gave no chat list" }; }
  const wa = j?.platforms?.whatsapp;
  if (!Array.isArray(wa) || !wa.length) return { error: "WhatsApp is not set up in Hermes (hermes gateway setup)" };
  return { chats: wa.filter((c: any) => typeof c?.id === "string" && c.id).map((c: any) => ({ id: `whatsapp:${c.id}`, name: String(c.name ?? c.id), type: String(c.type ?? "") })) };
}

// Hermes attaches every MEDIA:<path> it finds in the text, so the user's words may not
// carry one: that would send a file the page never offered.
export function message(text: string, file: string): string | { error: string } {
  if (text.length > 1000) return { error: "the message is over 1,000 characters" };
  if (/MEDIA:/i.test(text)) return { error: "the message may not contain MEDIA:" };
  if (/[`\n\r]/.test(file)) return { error: "the file's path cannot be passed to Hermes" };
  // The path in backticks: Hermes reads a quoted path whole, spaces and all.
  return `${text.trim()}${text.trim() ? "\n" : ""}MEDIA:\`${file}\``;
}

// Sent only when Hermes exits 0 with {success: true}; anything else is its own error.
export async function sendMedia(target: string, text: string, file: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = message(text, file);
  if (typeof m !== "string") return { ok: false, error: m.error };
  // "--" so a message starting with "-" is text, not an option.
  const r = await run(["send", "-t", target, "--json", "--", m], 5 * 60_000);
  if (typeof r.code === "string") return { ok: false, error: r.code };
  let j: any = null;
  try { j = JSON.parse(r.out); } catch { /* not JSON: fall through to stderr */ }
  if (r.code === 0 && j?.success && !j.error) return { ok: true };
  return { ok: false, error: String(j?.error ?? (lastLine(r.err) || `Hermes exited ${r.code}`)).slice(0, 400) };
}
