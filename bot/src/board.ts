// The one place Kaizen Bot talks to the kaizen board. Routes are the board's own
// (kaizen cli/web.ts), not a published API, so every call lives here and cites its line.
// Requests are sent server-side with no Origin header, which the board's local() check
// (web.ts:88) accepts; nothing in the board is changed for Kaizen Bot.

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type BoardProject = { dir: string; label: string };
export type BoardCard = {
  kind: "idea" | "run"; id?: string; status: string; text: string; state: string;
  awaiting: string | null; column: number; title?: string; archived?: boolean; notes?: string;
};
export type BoardState = { project: string | null; dir: string | null; projects: BoardProject[]; cards: BoardCard[] };
export type BoardRun = {
  id: string; state: string | null; request: string | null; plan: string | null; approval: string | null;
  impl: string | null; review: string | null; progress: string | null; findings: { n: number; text: string; done: boolean }[];
};
export type BoardReply = { ok: boolean; why?: string; manual?: string; error?: string };

export class BoardDown extends Error {}

// Only a loopback http URL: a saved setting must not point the client at another host.
export function loopbackUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(u.hostname)) return null;
    if (u.username || u.password || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) return null;
    return `http://${u.hostname}:${u.port || "80"}`;
  } catch { return null; }
}

export const normalise = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim(); // as kaizen state.ts:588

export function boardClient(base: string, f: Fetch = fetch) {
  const call = async (path: string, init?: RequestInit) => {
    let res: Response;
    try { res = await f(`${base}${path}`, init); } catch {
      throw new BoardDown(`The kaizen board is not running at ${base}. Start it with \`kaizen web\`.`);
    }
    return res;
  };
  const get = async <T>(path: string): Promise<T> => {
    const res = await call(path);
    if (!res.ok) throw new Error(`board ${path} returned ${res.status}`);
    return res.json() as Promise<T>;
  };
  const post = async (path: string, body: unknown): Promise<BoardReply> => {
    const res = await call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j: any = await res.json().catch(() => ({}));
    return { ok: res.ok && j.ok !== false, why: j.why ?? j.error, manual: j.manual };
  };

  return {
    base,
    // web.ts:213 serves the page with x-kaizen-version.
    async ping(): Promise<{ ok: boolean; version?: string }> {
      try {
        const res = await f(`${base}/`);
        const version = res.headers.get("x-kaizen-version") ?? undefined;
        return { ok: res.ok && !!version, version };
      } catch { return { ok: false }; }
    },
    // web.ts:247; all=1 so every known project's cards come back, not only the open one.
    state: () => get<BoardState>("/state?all=1"),
    // web.ts:283
    run: (dir: string, id: string) => get<BoardRun>(`/run/${encodeURIComponent(id)}?dir=${encodeURIComponent(dir)}`),
    // web.ts:379 — the change stream. Returns the raw response for the watcher to read.
    events: (signal: AbortSignal) => f(`${base}/events`, { signal }),
    // web.ts:429
    addIdea: (dir: string, text: string, notes?: string) => post("/inbox", { dir, op: "add", text, ...(notes ? { notes } : {}) }),
    // web.ts:527 — to a run by id, or to an idea by its text.
    addNote: (dir: string, to: { id: string } | { for: string }, text: string) => post("/note", { dir, ...to, text }),
    // web.ts:486 — never Yolo; agent and model are the board's defaults.
    launch: (dir: string, text: string, kind: "full" | "lite" | "") => post("/run", { dir, text, kind, yolo: false }),
    // web.ts:609 — the board refuses an approval that is no longer awaited.
    decide: (dir: string, id: string, awaiting: string, why?: string, answers?: string[]) =>
      post("/decide", { dir, id, awaiting, ...(why !== undefined ? { why } : {}), ...(answers?.length ? { answers } : {}) }),
    // web.ts:586
    fix: (dir: string, id: string, nums: number[]) => post("/fix", { dir, id, nums }),
    // web.ts:633
    abort: (dir: string, id: string, why: string) => post("/abort", { dir, id, why }),
  };
}

export type Board = ReturnType<typeof boardClient>;

// A project named by label or by folder, matched against what the board lists.
// Anything else is refused: the bot never acts on a folder the board does not know.
export function resolveProject(st: BoardState, name: string): BoardProject | null {
  const n = name.trim().replace(/\/+$/, "");
  if (!n) return null;
  return st.projects.find((p) => p.dir === n || p.dir === `${n}/.kaizen` || p.label.toLowerCase() === n.toLowerCase()) ?? null;
}

// The board's deep link (kaizen web/board.html:775).
export function boardLink(base: string, dir: string, to: { run?: string; idea?: string }) {
  const q = new URLSearchParams({ dir, ...(to.run ? { run: to.run } : { idea: to.idea ?? "" }) });
  return `${base}/?${q}`;
}

// What a card saw when it was made, so an approval can tell the run has moved on:
// the run's state.json `updated` for a decision, the review text for a fix.
export const runUpdated = (r: BoardRun): string | null => { try { return JSON.parse(r.state ?? "{}").updated ?? null; } catch { return null; } };
export const reviewMark = (r: BoardRun) => String(Bun.hash(r.review ?? ""));
