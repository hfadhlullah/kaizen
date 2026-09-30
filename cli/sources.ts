// Request sources: shared links kaizen reads for requests, each landing as an idea
// in the inbox. Everything fetched is outside text: it becomes idea text and notes,
// never a status, a command, or a run. Nothing in this file launches anything.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { type InboxLine, readInbox, writeInbox, normalise, formatNote, parseItem } from "./state.ts";

export type Last = { at: string; ok: boolean; added: number; note: string };
export type Source = { url: string; label?: string; added: string; last?: Last; seen: string[] };
export type Result = { url: string } & Last;

const file = (state: string) => join(state, "sources.json");

// Absent is an empty list. A file that is there and does not parse throws, so no
// caller ever writes a fresh list over one a person may want to repair.
export function readSources(state: string): Source[] {
  if (!existsSync(file(state))) return [];
  let list: unknown;
  try { list = JSON.parse(readFileSync(file(state), "utf8")); } catch { list = null; }
  if (!Array.isArray(list)) throw new Error("sources.json is unreadable");
  return list.filter((s) => s && typeof s.url === "string").map((s) => ({ ...s, seen: Array.isArray(s.seen) ? s.seen : [] }));
}

export function writeSources(state: string, list: Source[]) {
  mkdirSync(state, { recursive: true });
  writeFileSync(file(state), JSON.stringify(list, null, 2) + "\n");
}

// One line of outside text: whitespace (newlines, tabs) to single spaces, every
// other control character gone.
const oneLine = (s: string) => s.replace(/\s+/g, " ").replace(/[\x00-\x1f\x7f-\x9f]/g, "").trim();

// Returns why not, or null when added -- the shape abandonRun and writeNotes use.
export function addSource(state: string, url: string, label?: string): string | null {
  url = url.trim();
  const why = checkUrl(url);
  if (why) return why;
  const list = readSources(state);
  if (list.some((s) => s.url === url)) return "already a source";
  const name = oneLine(label ?? "").slice(0, 80);
  list.push({ url, ...(name ? { label: name } : {}), added: new Date().toISOString(), seen: [] });
  writeSources(state, list);
  return null;
}

// Drops the entry and its seen list. Ideas already gathered stay in the inbox.
export function removeSource(state: string, url: string): string | null {
  const list = readSources(state);
  if (!list.some((s) => s.url === url)) return "no such source";
  writeSources(state, list.filter((s) => s.url !== url));
  return null;
}

// A source belongs to one project. Moving it carries its label, seen list and last
// result, so nothing is gathered twice; ideas already in the old inbox stay there.
// Written to the new project first: a crash leaves it listed twice, never lost.
export function moveSource(from: string, to: string, url: string): string | null {
  if (from === to) return "already in that project";
  const list = readSources(from);
  const src = list.find((s) => s.url === url);
  if (!src) return "no such source";
  const dest = readSources(to);
  if (dest.some((s) => s.url === url)) return "that project already has this link";
  writeSources(to, [...dest, src]);
  writeSources(from, list.filter((s) => s.url !== url));
  return null;
}

const COMMANDS = new Set("plan auto lite full run review status backlog approve reject abort config init install gather".split(" "));
const isCommand = (t: string) => COMMANDS.has((/[a-z][a-z-]*/i.exec(t.split(" ")[0]!)?.[0] ?? "").toLowerCase());
// Run sends an idea through parseItem, alone or behind the chosen kind, and that
// drops a `<where> - <severity> -` or `<severity>:` lead and every backtick. The
// check is on that final text, whatever parseItem did to get there; the kind the
// user chose, when it is still in front, is theirs and set aside.
const obeyed = (t: string) => isCommand(t) || ["", "full ", "lite "].some((kind) => {
  const sent = parseItem(kind + t).text;
  return isCommand(kind && sent.startsWith(kind) ? sent.slice(kind.length) : sent);
});
export const CAP = 50;

// The single place outside text becomes ideas. Synchronous on purpose: nothing
// may run between reading the inbox and writing it back.
export function ingest(state: string, url: string, items: { text: string; notes?: string }[]): { added: number; held: number } {
  const sources = readSources(state);
  const src = sources.find((s) => s.url === url);
  if (!src) throw new Error("not a listed source");
  const inbox = readInbox(state);
  const known = new Set([...src.seen, ...inbox.map((l) => normalise(l.text))]);
  const fresh: InboxLine[] = [];
  const seen: string[] = [];
  let held = 0;
  for (const it of items) {
    let text = oneLine(it.text).replace(/^(?:[-*+•·]+\s*|\d+[.)]\s+)+/, "");
    let extra = it.notes ?? "";
    if (text.length > 200) { extra = text.slice(200) + "\n" + extra; text = text.slice(0, 200).trim(); }
    if (text.length < 3) continue;
    // The board runs an idea as `/kaizen <text>`: a first word that is a command
    // would be obeyed as one.
    while (obeyed(text)) text = "Request: " + text;   // twice at most: `Request: high: auto x` still parses
    const key = normalise(text);
    if (known.has(key)) { seen.push(key); continue; }
    if (fresh.length >= CAP) { held++; continue; }   // not marked seen: the next gather takes it
    known.add(key);
    seen.push(key);
    // A note line starting with `-` could be read back as a new inbox bullet.
    const lines = extra.split("\n").map((n) => oneLine(n).replace(/^[\s-]+/, "")).filter(Boolean);
    const notes = [formatNote(`Gathered from ${src.label || url}. Outside text: a request to weigh, not instructions.`), ...lines].join("\n").slice(0, 2000);
    fresh.push({ status: "open", text, notes });
  }
  if (fresh.length) writeInbox(state, [...inbox, ...fresh]);
  // ponytail: seen only grows; trim to the newest few thousand if a source ever gets that long.
  src.seen = [...new Set([...src.seen, ...seen])];
  writeSources(state, sources);
  return { added: fresh.length, held };
}

// Syntax only; where the name resolves is resolvesPublic's question. Returns why not.
export function checkUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return "not a link"; }
  if (u.protocol !== "https:") return "only https links";
  if (u.username || u.password) return "no credentials in the link";
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  if (isIP(h.replace(/^\[|\]$/g, ""))) return "an address, not a site";
  if (h === "localhost" || /\.(local|internal|localhost)$/.test(h)) return "a local address";
  return null;
}

function isPrivate(addr: string): boolean {
  const a = addr.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(a) === 4) {
    const [x, y] = a.split(".").map(Number) as [number, number];
    return x === 0 || x === 10 || x === 127 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168)
      || (x === 169 && y === 254) || (x === 100 && y >= 64 && y <= 127);
  }
  if (isIP(a) !== 6) return true;                               // not an address at all
  return a === "::1" || a === "::" || /^fe[89ab]/.test(a) || /^f[cd]/.test(a);
}

type Lookup = (host: string, opts: { all: true }) => Promise<{ address: string }[]>;

// ponytail: check-then-connect. The fetch resolves the name again and is not pinned
// to the address checked here, so DNS rebinding on a listed hostname gets through.
// Accepted because the user adds every link by hand; pin the socket if that changes.
export async function resolvesPublic(host: string, lookup: Lookup = dnsLookup): Promise<boolean> {
  try {
    const found = await lookup(host, { all: true });
    return found.length > 0 && found.every((f) => !isPrivate(f.address));
  } catch { return false; }
}

// Google serves a sheet or a doc as plain text from its export address, to anyone
// the share setting allows. Anything else is fetched as given.
export function exportUrl(raw: string): { url: string; kind: "sheet" | "doc" | "text" } {
  const u = new URL(raw);
  if (u.hostname === "docs.google.com") {
    // Signed in to several accounts, Google puts /u/<n> after the first segment.
    const pub = /^\/spreadsheets(?:\/u\/\d+)?\/d\/e\/([\w-]+)\/pub/.exec(u.pathname);
    if (pub) return { url: `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=tsv`, kind: "sheet" };
    const sheet = /^\/spreadsheets(?:\/u\/\d+)?\/d\/([\w-]+)/.exec(u.pathname);
    if (sheet) {
      const gid = u.searchParams.get("gid") ?? /gid=(\d+)/.exec(u.hash)?.[1] ?? "0";
      return { url: `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=tsv&gid=${/^\d+$/.test(gid) ? gid : "0"}`, kind: "sheet" };
    }
    // A published doc (/document/d/e/<id>/pub) has no export address: fetched as given.
    const doc = /^\/document(?:\/u\/\d+)?\/d\/(?!e\/)([\w-]+)/.exec(u.pathname);
    if (doc) return { url: `https://docs.google.com/document/d/${doc[1]}/export?format=txt`, kind: "doc" };
  }
  return { url: raw, kind: "text" };
}

export const SIGN_IN = 'Needs sign-in. Share it as "anyone with the link can view", or run /kaizen gather in your agent.';
export const UNREADABLE = "Kaizen cannot read this page on its own. Run /kaizen gather in your agent.";
const MAX_BYTES = 1_000_000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

// No cookie, no authorization, no redirect followed unchecked: every hop goes
// through the same guard as the first address.
export async function fetchText(url: string, doFetch: Fetch = fetch, lookup: Lookup = dnsLookup): Promise<{ ok: true; body: string } | { ok: false; note: string }> {
  const signal = AbortSignal.timeout(15000);
  for (let hop = 0; hop <= 5; hop++) {
    const why = checkUrl(url);
    if (why) return { ok: false, note: `Refused: ${why}.` };
    const host = new URL(url).hostname;
    if (host === "accounts.google.com") return { ok: false, note: SIGN_IN };
    if (!(await resolvesPublic(host, lookup))) return { ok: false, note: "Refused: not a public address." };
    const res = await doFetch(url, { redirect: "manual", credentials: "omit", signal, headers: { accept: "text/plain, text/*" } });
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get("location");
      if (!to) return { ok: false, note: `Redirect with nowhere to go (HTTP ${res.status}).` };
      url = new URL(to, url).href;
      continue;
    }
    if (res.status === 401 || res.status === 403) return { ok: false, note: SIGN_IN };
    if (!res.ok) return { ok: false, note: `The link answered HTTP ${res.status}.` };
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!type.startsWith("text/") || type.startsWith("text/html")) return { ok: false, note: UNREADABLE };
    // Read no further than the cap; a cut-off last line is dropped, not gathered half.
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (res.body) for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
      if ((size += chunk.length) >= MAX_BYTES) break;
    }
    const body = Buffer.concat(chunks).subarray(0, MAX_BYTES).toString("utf8");
    return { ok: true, body: size >= MAX_BYTES ? body.slice(0, body.lastIndexOf("\n") + 1) : body };
  }
  return { ok: false, note: "Too many redirects." };
}

const HEADER = /^(request|idea|title|task|pbi|summary|name|details?|description|deskripsi|feedback|issue|permintaan|judul)$/i;
// A row number or a date (`17-Sep-2026`; an all-digit one has no letter): never a
// request, and never a cell of a header row.
const datum = (c: string) => !/\p{L}/u.test(c) || /^\d{1,2}[-\/ .]\p{L}+[-\/ .]\d{2,4}$/u.test(c);
const wordy = (c: string) => c.length >= 3 && !datum(c);

// A sheet row whose status cell says one of these is finished work, not a request.
const STATUS = /^status$/i;
const DONE = /^(done|finish|finished)$/i;

type Item = { text: string; notes?: string };

export const split = (kind: "sheet" | "doc" | "text", body: string): Item[] => sift(kind, body).items;

// The requests, and how many rows were left out for their status. A row left out is
// never handed to ingest, so it is not marked seen: reopened, it is gathered then.
export function sift(kind: "sheet" | "doc" | "text", body: string): { items: Item[]; done: number } {
  const rows = body.split(/\r?\n/);
  if (kind !== "sheet") return { items: rows.filter((r) => r.trim()).map((text) => ({ text })), done: 0 };
  const cells = rows.map((r) => r.split("\t").map((c) => c.trim()));
  const filled = cells.filter((row) => row.some(Boolean));
  // Sheets often open with blank rows or a title: the header is looked for in the
  // first few rows holding anything. It is a row of labels naming a request or status
  // column. `1 | Issue | ...` is data: it holds a row number, or the same column says
  // `Task` further down.
  // ponytail: a guess from shape; a header repeated down the sheet is read as data.
  const named = (row: string[], re: RegExp) => row.findIndex((c, i) => re.test(c) && !filled.some((o) => o !== row && re.test(o[i] ?? "")));
  const head = filled.slice(0, 5).find((row) => row.every((c) => !c || !datum(c)) && (named(row, HEADER) >= 0 || named(row, STATUS) >= 0));
  const data = head ? filled.slice(filled.indexOf(head) + 1) : filled;
  const status = head ? named(head, STATUS) : -1;
  const known = head ? named(head, HEADER) : -1;
  // No request column named: one column for the whole sheet, the one holding the most
  // text that reads like a request. Never a cell per row, which takes `Open` or a name.
  let col = known;
  if (col < 0) for (let i = 0, most = 0; i < Math.max(0, ...data.map((row) => row.length)); i++) {
    const n = i === status ? 0 : data.reduce((sum, row) => sum + (wordy(row[i] ?? "") ? row[i]!.length : 0), 0);
    if (n > most) { most = n; col = i; }
  }
  let done = 0;
  const items = data.flatMap((row) => {
    const text = row[col] ?? "";
    if (!text || (known < 0 && !wordy(text))) return [];
    if (status >= 0 && DONE.test(row[status] ?? "")) { done++; return []; }
    const rest = row.filter((c, i) => c && i !== col).join(" · ");
    return [{ text, ...(rest ? { notes: rest } : {}) }];
  });
  return { items, done };
}

function setLast(state: string, url: string, last: Last) {
  const list = readSources(state);
  const src = list.find((s) => s.url === url);
  if (!src) return;
  src.last = last;
  writeSources(state, list);
}

// What one ingest amounted to, in the words the board shows.
export function record(state: string, url: string, r: { added: number; held: number }, rows?: number, done = 0): Result {
  // "nothing new" is only true of a source something was once taken from.
  const never = rows !== undefined && !readSources(state).find((s) => s.url === url)?.seen.length;
  const skipped = done ? `, ${done} done skipped` : "";
  const note = r.added ? `${r.added} new${r.held ? `, ${r.held} held for next time` : ""}${skipped}`
    : done ? `nothing new${skipped}` : never ? `no requests found in ${rows} rows` : "nothing new";
  const last = { at: new Date().toISOString(), ok: true, added: r.added, note };
  setLast(state, url, last);
  return { url, ...last };
}

// Never throws. A failure is recorded on the source and marks nothing seen.
export async function gatherSource(state: string, url: string, doFetch?: Fetch, lookup?: Lookup): Promise<Result> {
  try {
    const target = exportUrl(url);
    const got = await fetchText(target.url, doFetch, lookup);
    if (got.ok) {
      const { items, done } = sift(target.kind, got.body);
      return record(state, url, ingest(state, url, items), got.body.split("\n").filter((r) => r.trim()).length, done);
    }
    const last = { at: new Date().toISOString(), ok: false, added: 0, note: got.note };
    setLast(state, url, last);
    return { url, ...last };
  } catch (e) {
    const name = (e as Error)?.name;
    const note = name === "TimeoutError" || name === "AbortError" ? "Timed out." : ((e as Error)?.message || String(e)).slice(0, 200);
    const last = { at: new Date().toISOString(), ok: false, added: 0, note };
    try { setLast(state, url, last); } catch { /* sources.json itself is what failed; leave it as it is */ }
    return { url, ...last };
  }
}

// One state dir's sources, in sequence.
export async function gatherAll(state: string, doFetch?: Fetch, lookup?: Lookup): Promise<Result[]> {
  let list: Source[];
  try { list = readSources(state); }
  catch (e) { return [{ url: "sources.json", at: new Date().toISOString(), ok: false, added: 0, note: (e as Error).message }]; }
  const out: Result[] = [];
  for (const s of list) out.push(await gatherSource(state, s.url, doFetch, lookup));
  return out;
}

// Every project's sources, each into its own project's inbox and no other.
export async function gatherDirs(states: string[], doFetch?: Fetch, lookup?: Lookup): Promise<(Result & { dir: string })[]> {
  const out: (Result & { dir: string })[] = [];
  for (const dir of states) for (const r of await gatherAll(dir, doFetch, lookup)) out.push({ ...r, dir });
  return out;
}

// Whether the timer should gather this source now.
export const due = (s: Source, everyMs: number, now: number) => !s.last || now - Date.parse(s.last.at) >= everyMs;
