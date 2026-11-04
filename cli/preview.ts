// `kaizen preview <url|image>`: tells the board's own Browser tab what the agent just
// changed. It only writes <state>/preview.json; the open board polls GET /preview and
// frames the page itself. This never launches a browser, so with no board open nothing opens.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

export type Preview = { url?: string; image?: string; ws: string; at: number };

const IMG = /^\.(png|jpe?g|gif|webp)$/i;
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/;

// Returns an error message, or null once preview.json is written.
export function setPreview(state: string, arg: string, cwd: string): string | null {
  const p: Preview = { ws: resolve(cwd), at: Date.now() };
  if (/^https?:\/\//i.test(arg)) {
    if (!LOOPBACK.test(arg)) return "only a localhost address (the dev server), e.g. http://localhost:3000";
    p.url = arg;
  } else {
    const f = resolve(cwd, arg);
    if (!existsSync(f) || !IMG.test(extname(f))) return "give a localhost URL or a png/jpg/gif/webp screenshot that exists";
    // Under attachments/, where the board's /file route already serves from.
    const name = `preview-${p.at}${extname(f).toLowerCase()}`;
    mkdirSync(join(state, "attachments"), { recursive: true });
    copyFileSync(f, join(state, "attachments", name));
    p.image = `attachments/${basename(name)}`;
  }
  writeFileSync(join(state, "preview.json"), JSON.stringify(p));
  return null;
}
