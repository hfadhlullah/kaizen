// Closes the loop: when a promoted request's run is done, tell the place it came from.
// A GitHub issue gets a comment and is closed (through the user's own `gh` login); a
// sheet row gets "Done in <run>" in its Status column. Off unless the source says so.
// The text sent is fixed: nothing the source said is ever sent back or put in a command.
import { normalise } from "./state.ts";
import { readIcebox, writeIcebox, readSources, type Signal, type Source } from "./sources.ts";
import * as google from "./google.ts";

type Gh = (args: string[]) => Promise<{ code: number; err: string }>;
const runGh: Gh = async (args) => {
  try {
    const p = Bun.spawn(["gh", ...args], { stdout: "ignore", stderr: "pipe", windowsHide: true });
    const err = await new Response(p.stderr).text();
    return { code: await p.exited, err };
  } catch { return { code: 127, err: "The gh command was not found. Install GitHub's CLI and run `gh auth login`." }; }
};

const say = (run: string) => `Done in kaizen run ${run}.`;
const col = (i: number) => { let s = ""; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

async function github(it: Signal, src: Source, gh: Gh): Promise<string | null> {
  const repo = /^https:\/\/(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+)\/issues\/?$/.exec(src.url.split(/[?#]/)[0]!)?.[1];
  const n = /^#(\d+) /.exec(it.notes ?? "")?.[1];
  if (!repo || !n) return "no issue number was kept for this item";
  const r = await gh(["issue", "close", n, "--repo", repo, "--comment", say(it.run!)]);
  return r.code ? (r.err.trim().split("\n").pop() || `gh exited ${r.code}`).slice(0, 200) : null;
}

// The row's own request cell is re-read first: if rows moved since the gather, the
// status goes nowhere rather than onto the wrong request.
async function sheet(it: Signal, src: Source, doFetch: typeof fetch, token?: () => Promise<string>): Promise<string | null> {
  const id = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/.exec(src.url)?.[1];
  if (!id || !it.row) return "no row number was kept for this item";
  const gid = /[#&?]gid=(\d+)/.exec(src.url)?.[1] ?? "0";
  const meta = await google.sheets(`${id}?fields=sheets.properties(sheetId,title)`, {}, doFetch, token);
  const title = meta.sheets?.find((s: any) => String(s.properties.sheetId) === gid)?.properties.title as string | undefined;
  if (!title) return "the sheet's tab was not found";
  const q = `'${title.replace(/'/g, "''")}'`;
  const head = (await google.sheets(`${id}/values/${encodeURIComponent(`${q}!1:50`)}`, {}, doFetch, token)).values as string[][] | undefined ?? [];
  const at = it.row <= 50 ? head[it.row - 1] : (await google.sheets(`${id}/values/${encodeURIComponent(`${q}!${it.row}:${it.row}`)}`, {}, doFetch, token)).values?.[0];
  const want = normalise(it.text);
  if (!at?.some((c) => { const t = normalise(c ?? ""); return t && (t.startsWith(want) || want.startsWith(t)); })) return "the row has changed since it was gathered";
  // The Status column is the one headed so; with none, it is added after the last header cell.
  let hr = head.findIndex((r) => r.some((c) => /^status$/i.test((c ?? "").trim())));
  let c = hr >= 0 ? head[hr]!.findIndex((x) => /^status$/i.test((x ?? "").trim())) : -1;
  if (c < 0) {
    hr = head.findIndex((r) => r.some((x) => x?.trim()));
    if (hr < 0) return "the sheet has no header row to add a Status column to";
    c = head[hr]!.length;
    await google.sheets(`${id}/values/${encodeURIComponent(`${q}!${col(c)}${hr + 1}`)}?valueInputOption=RAW`, { method: "PUT", body: { values: [["Status"]] } }, doFetch, token);
  }
  await google.sheets(`${id}/values/${encodeURIComponent(`${q}!${col(c)}${it.row}`)}?valueInputOption=RAW`, { method: "PUT", body: { values: [[say(it.run!)]] } }, doFetch, token);
  return null;
}

const busy = new Set<string>();

// Every done item whose source asks for it and that has not been written yet. A failure
// is kept on the item and tried again on the next call; success is stamped and never repeated.
export async function writeBacks(state: string, deps: { gh?: Gh; fetch?: typeof fetch; token?: () => Promise<string> } = {}): Promise<void> {
  const sources = readSources(state);
  for (const it of readIcebox(state)) {
    const src = sources.find((s) => s.url === it.source);
    const key = state + " " + it.id;
    if (it.status !== "done" || !it.run || it.written || !src?.writeback || busy.has(key)) continue;
    busy.add(key);
    let err: string | null;
    try {
      err = /github\.com/.test(src.url) ? await github(it, src, deps.gh ?? runGh)
        : /docs\.google\.com\/spreadsheets/.test(src.url) ? await sheet(it, src, deps.fetch ?? fetch, deps.token)
        : "this kind of source cannot be written to";
    } catch (e) { err = ((e as Error).message || String(e)).slice(0, 200); }
    finally { busy.delete(key); }
    const ice = readIcebox(state), now = ice.find((s) => s.id === it.id);
    if (!now) continue;
    if (err) { now.writeError = err; delete now.written; } else { now.written = new Date().toISOString(); delete now.writeError; }
    writeIcebox(state, ice);
  }
}
