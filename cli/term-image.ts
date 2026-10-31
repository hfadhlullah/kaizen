// Images pasted into a board terminal. The type comes from the file's own first bytes, never
// from the page, and the name is random, so nothing the page sends reaches the path.
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const MAX_IMAGE = 10 * 1024 * 1024;

export function imageExt(b: Uint8Array) {
  const at = (o: number, s: string) => [...s].every((c, i) => b[o + i] === c.charCodeAt(0));
  if (b[0] === 0x89 && at(1, "PNG")) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (at(0, "GIF8")) return "gif";
  if (at(0, "RIFF") && at(8, "WEBP")) return "webp";
  return null;
}

export function saveImage(b: Uint8Array, dir = join(homedir(), ".kaizen", "term-images")) {
  const ext = b.length <= MAX_IMAGE ? imageExt(b) : null;
  if (!ext) return null;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, `${crypto.randomUUID()}.${ext}`);
  writeFileSync(file, b, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* Windows */ }
  return file;
}
