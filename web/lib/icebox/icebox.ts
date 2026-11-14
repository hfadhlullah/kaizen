// The Icebox's data and the pure rules over it: what a request, a source and a collection look like as the
// server sends them (GET /sources), and how the page narrows, groups and words them. No React and no DOM here,
// so every rule can be tested on its own (web/icebox.test.ts).

export type IceItem = {
  id: string;
  dir: string;
  project?: string;
  text: string;
  notes?: string;
  source: string;
  category?: string;
  at: string;
  status: "new" | "promoted" | "dismissed" | "done" | string;
  kind?: string;
  sorted?: string;
  board?: string;
  tags?: string[];
  images?: string[];
  link?: { url: string; title?: string; summary?: string };
  post?: string | null;
  replied?: string;
  written?: string;
  writeError?: string;
  idea?: string;
  asleep?: boolean;
};
export type Source = {
  url: string;
  dir: string;
  project?: string;
  label?: string;
  category?: string;
  social?: string | null;
  paused?: boolean;
  writeback?: boolean;
  last?: { at: string; ok: boolean; added: number; note: string };
};
export type Board = { dir: string; name: string; client?: boolean };
export type IceData = {
  sources: Source[];
  icebox: IceItem[];
  dismissed: IceItem[];
  boards: Board[];
  failed: string[];
  every?: string;
  gatherer?: { use?: string; connected?: boolean; email?: string | null };
  google?: { connected?: boolean; hasClient?: boolean };
  error?: string;
};

// Platforms a social source can follow, and what an item is: a client asked for it, you found it, or people say it.
export const PLAT: Record<string, string> = { x: "X", tiktok: "TikTok", instagram: "Instagram", threads: "Threads" };
export const KIND: Record<string, string> = { client: "Client", finding: "Finding", people: "People say" };
export const STYLES: Record<string, string> = { casual: "Casual", fun: "Fun", helpful: "Helpful", promo: "Promo" };

// A link from sources.json or a gathered post: the server checks it on the way in, this keeps a javascript: URL
// from ever being a clickable href.
export const webUrl = (u: string) => (/^https?:\/\//i.test(String(u)) ? u : "#");
export const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
};
export const sameName = (a?: string, b?: string) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
export const iceKey = (it: IceItem) => it.dir + " " + it.id;
export const srcKey = (it: IceItem) => it.dir + " " + it.source;
export const hue = (t: string) => [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

export const ago = (at: string, now = Date.now()) => {
  const m = Math.round((now - Date.parse(at)) / 60000);
  return m < 1
    ? "just now"
    : m < 60
      ? m + " min ago"
      : m < 1440
        ? Math.round(m / 60) + " h ago"
        : Math.round(m / 1440) + " d ago";
};
// The day a snooze lands on, said as the server works it out (1d, 1w, 1m or a date).
export const wakeDay = (until: string, from = new Date()) => {
  const d = new Date(from);
  if (until === "1d") d.setDate(d.getDate() + 1);
  else if (until === "1w") d.setDate(d.getDate() + 7);
  else if (until === "1m") d.setMonth(d.getMonth() + 1);
  else return new Date(until + "T00:00:00");
  return d;
};
export const ymd = (d: Date) => d.toLocaleDateString("sv");
export const snoozedLine = (n: number, until: string) =>
  `${n > 1 ? n + " snoozed" : "Snoozed"} until ${wakeDay(until).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;

export const srcType = (s: Source) => {
  if (s.social) return "social";
  const u = s.url;
  if (u.includes("docs.google.com/spreadsheets") || u.endsWith(".csv") || u.endsWith(".tsv")) return "sheet";
  if (u.includes("docs.google.com/document")) return "doc";
  return "link";
};
// What a source is called when nothing names it: its platform, else its site.
export const platOf = (s?: Pick<Source, "url" | "social"> | null) =>
  (s?.social && PLAT[s.social]) || (s ? hostOf(s.url).replace(/^www\./, "") : "") || "Other";
export const srcOf = (list: Source[], it: IceItem) => list.find((x) => x.dir === it.dir && x.url === it.source);
export const srcName = (list: Source[], it: IceItem) => {
  const s = srcOf(list, it);
  return s ? s.label || hostOf(s.url) : hostOf(it.source);
};
// An item with no category of its own takes its source's, else the source's platform or site.
export const catOf = (list: Source[], it: IceItem) =>
  it.status === "dismissed"
    ? "Dismissed"
    : it.status === "done"
      ? "Done"
      : it.status === "promoted"
        ? "Promoted"
        : it.category || srcOf(list, it)?.category || platOf(srcOf(list, it) || { url: it.source });
export const isWaiting = (it: IceItem) => !["promoted", "dismissed", "done"].includes(it.status);
export const isLive = (it: IceItem) => it.status === "new";
export const hiddenCat = (c: string) => c === "Dismissed" || c === "Done" || c === "Promoted";
export const pictures = (it: IceItem) => (it.images || []).filter((u) => /^https:\/\//.test(u));
// The favicon of the site a link is on, asked of that site itself (Google's own static host for Sheets and Docs,
// whose site icon is generic): nothing but the host reaches anyone. "" when there is none to ask for.
export function faviconUrl(u: string): string {
  let origin = "";
  try {
    const x = new URL(u);
    if (/^https?:$/.test(x.protocol)) origin = x.origin;
  } catch {}
  return !origin
    ? ""
    : u.includes("docs.google.com/spreadsheets")
      ? "https://ssl.gstatic.com/docs/spreadsheets/favicon3.ico"
      : u.includes("docs.google.com/document")
        ? "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico"
        : origin + "/favicon.ico";
}

export type Filters = { board: string; kinds: string[]; cat: string; src: string };
export type Env = {
  dir: string | null; // the one project the board shows, or null in All projects
  shown: ReadonlySet<string>; // the "Showing" picker's projects; empty shows every one
  showable: { dir: string; label: string }[];
};
export type Derived = {
  list: Source[];
  ice: IceItem[]; // awake items plus the dismissed ones that ride along
  waiting: number;
  many: boolean; // more than one project: rows name theirs
  boards: Board[];
  byCat: Map<string, { it: IceItem; n: number }>;
  bySrc: Map<string, { it: IceItem; n: number }>;
  filtered: IceItem[]; // newest first, every filter applied, before paging
  board: string; // the filters as they hold, an unknown one cleared
  cat: string;
  src: string;
  inProj: (it: IceItem) => boolean;
  nOn: (b: Board) => number;
};
const count = (xs: IceItem[], f: (it: IceItem) => string) => {
  const m = new Map<string, { it: IceItem; n: number }>();
  xs.forEach((it) => {
    const k = f(it);
    m.set(k, { it, n: (m.get(k)?.n || 0) + 1 });
  });
  return m;
};
// Filters narrow in turn: project (the board's own pickers), then collection and kind, then category, then
// source; each chip counts what the filters before it leave. A snoozed item is left out until its date (the
// server says `asleep`); dismissed ones show only under their own category.
export function deriveIce(d: IceData, f: Filters, env: Env): Derived {
  const list = d.sources || [],
    awake = (d.icebox || []).filter((it) => !it.asleep),
    ice = [...awake, ...(d.dismissed || [])],
    waiting = awake.filter((it) => it.status === "new").length;
  const projects = new Set(env.dir ? [] : ice.map((it) => it.dir));
  if (!env.dir) for (const pd of env.shown) if (env.showable.some((x) => x.dir === pd)) projects.add(pd);
  const inProj = (it: IceItem | Board) => !!env.dir || !env.shown.size || env.shown.has(it.dir),
    pv = ice.filter(inProj);
  // A board is its name: two projects' boards of one name are one chip in All projects.
  const boards = [...new Map((d.boards || []).filter(inProj).map((b) => [b.name.toLowerCase(), b])).values()];
  const board = f.board && boards.some((b) => sameName(b.name, f.board)) ? f.board : "";
  const onBoard = (it: IceItem) => !board || sameName(it.board, board),
    ofKind = (it: IceItem) => !f.kinds.length || f.kinds.includes(it.kind || ""),
    base = pv.filter((it) => onBoard(it) && ofKind(it));
  const byCat = count(base, (it) => catOf(list, it)),
    cat = f.cat && byCat.has(f.cat) ? f.cat : "";
  const cv = base.filter((it) => !cat || catOf(list, it) === cat),
    bySrc = count(cv, srcKey),
    src = f.src && bySrc.has(f.src) ? f.src : "";
  const filtered = ice
    .filter(
      (it) =>
        inProj(it) &&
        onBoard(it) &&
        ofKind(it) &&
        (cat ? catOf(list, it) === cat : it.status === "new") &&
        (!src || srcKey(it) === src),
    )
    .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  return {
    list,
    ice,
    waiting,
    many: projects.size > 1,
    boards,
    byCat,
    bySrc,
    filtered,
    board,
    cat,
    src,
    inProj,
    nOn: (b) => pv.filter((it) => isWaiting(it) && sameName(it.board, b.name)).length,
  };
}
// Sources group by platform: two Threads searches sit under one Threads.
export function srcGroups(list: Source[], bySrc: Derived["bySrc"]) {
  const g = new Map<string, [string, IceItem][]>();
  for (const [k, { it }] of bySrc) {
    const p = platOf(srcOf(list, it) || { url: it.source });
    g.has(p) || g.set(p, []);
    g.get(p)!.push([k, it]);
  }
  return g;
}
// The rows' label for a source inside its platform group: "Threads: ai" sits under Threads as "ai".
export const subName = (name: string, group: string) =>
  name.toLowerCase().startsWith(group.toLowerCase() + ":") ? name.slice(group.length + 1).trim() : name;

// The cursor steps to the next row that stays when rows go, else the one before; null when none stays.
export function stepPast(order: IceItem[], cur: string | null, gone: ReadonlySet<string>): string | null {
  const at = order.findIndex((it) => iceKey(it) === cur);
  if (at < 0 || !cur || !gone.has(cur)) return cur;
  const stay = (it: IceItem) => !gone.has(iceKey(it)),
    n = order.slice(at + 1).find(stay) ?? order.slice(0, at).reverse().find(stay);
  return n ? iceKey(n) : null;
}

// What Gather all says, from the server's per-source results.
export function gatherLine(rs: { url: string; ok: boolean; added: number }[], list: Source[]) {
  const soc = (r: { url: string }) => list.some((s) => s.url === r.url && s.social),
    n = rs.reduce((a, r) => a + r.added, 0),
    bad = rs.filter((r) => !r.ok && !soc(r)).length,
    ag = rs.filter(soc).length;
  return (
    (n ? `${n} new in the icebox` : "Nothing new") +
    (bad ? `, ${bad} source${bad === 1 ? "" : "s"} could not be read` : "") +
    (ag ? `; ${ag} social for /kaizen gather` : "")
  );
}
// The long-press and swipe gestures: how far a drag must go before it decides.
export const SWIPE_AT = 0.35;
// The swipe deck: the waiting requests the filters show, least skipped first.
export function deckOf(filtered: IceItem[], skip: ReadonlyMap<string, number>) {
  return filtered.filter(isWaiting).sort((a, b) => (skip.get(iceKey(a)) || 0) - (skip.get(iceKey(b)) || 0));
}
// A project shows by its folder name alone; the full path stays in the tooltip.
export const short = (l: string) => l.split(/[\\/]/).pop() || l;
// What a row, a card or a phone row needs to know about the page around it.
export type RowCtx = {
  list: Source[];
  many: boolean; // more than one project: rows name theirs
  boards: Board[];
  cur: string | null;
  sel: ReadonlySet<string>;
  open: string | null;
  armed: string | null;
};
// The project a request is for, named: a swipe decides for that project's Tasks, so its card always names it.
export const pName = (it: IceItem, projects: { dir: string; label: string }[]) =>
  it.project || projects.find((p) => p.dir === it.dir)?.label || "";
