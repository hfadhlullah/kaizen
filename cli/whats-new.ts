// What's New: a short, hand-written list of a release's big improvements and its fixes (cli/whats-new.json, newest first), shown once
// per machine under Settings → General → About after an update. The text is written at release time (`bun run release` refuses to
// publish a version that has no entry, unless told `--no-notes`); what a machine has seen lives in ~/.kaizen/whats-new-seen.json.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Entry = { version: string; highlights: { title: string; text: string }[]; fixes: string[] };

const here = join(dirname(import.meta.path), "whats-new.json");
export const entries = (): Entry[] => { try { return JSON.parse(readFileSync(here, "utf8")); } catch { return []; } };

// 1.10.0 is newer than 1.9.0: numbers, not text.
export const cmp = (a: string, b: string) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
// The entry a machine on `installed` shows: the one for exactly that version, nothing otherwise. A release with no entry of its own shows
// nothing, rather than the notes of an older release under a newer version (`bun run release` refuses to publish without one).
export const entryFor = (list: Entry[], installed: string): Entry | null => list.find((e) => e.version === installed) ?? null;

const file = (home: string) => join(home, ".kaizen", "whats-new-seen.json");
export const seenVersion = (home: string): string | null => {
  try { const v = JSON.parse(readFileSync(file(home), "utf8"))?.version; return typeof v === "string" ? v : null; } catch { return null; }
};
export function markSeen(home: string, version: string) {
  const cur = seenVersion(home);
  if (cur && cmp(cur, version) >= 0) return;
  mkdirSync(dirname(file(home)), { recursive: true });
  writeFileSync(file(home) + ".tmp", JSON.stringify({ version }) + "\n");
  renameSync(file(home) + ".tmp", file(home));
}

// What the page gets. `fresh`: a brand-new install (no project yet), which has the welcome instead and is recorded as having seen
// this version, so the card never greets it; someone who already has projects sees it once, the first time.
export function whatsNew(home: string, installed: string, fresh: boolean, list: Entry[] = entries()) {
  const entry = entryFor(list, installed);
  if (!entry) return { version: installed, entry: null, unseen: false };
  const seen = seenVersion(home);
  if (seen === null && fresh) { markSeen(home, entry.version); return { version: installed, entry, unseen: false }; }
  return { version: installed, entry, unseen: seen === null || cmp(entry.version, seen) > 0 };
}
export const hasEntry = (version: string, list: Entry[] = entries()) => list.some((e) => e.version === version);
