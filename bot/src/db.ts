import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { role, PALETTE } from "./roles";

export type Bot = {
  id: number; name: string; role: string; color: string; created: number;
  title: string; description: string; notify: number; project: string; hidden: number;
};
export type Message = { id: number; bot_id: number; kind: "user" | "bot" | "receipt"; text: string; at: number };
export type DraftStatus = "pending" | "approved" | "rejected";
export type Draft = {
  id: number; bot_id: number; channel: string; recipient: string; subject: string; body: string;
  status: DraftStatus; at: number;
};
export type Memory = { id: number; bot_id: number; text: string; at: number };
export type Routine = {
  id: number; bot_id: number; name: string; prompt: string; days: string; time: string;
  enabled: number; next_run: number; last_run: number | null; created: number;
};

// An action is one card in a thread: something a bot did or asks to do.
// Direct kinds start "working" and end done/failed; gated kinds start "needed" and
// reach the board only through the approve route in server.ts.
export const DIRECT = ["idea", "note", "memory"] as const;
export const GATED = ["start_run", "decision", "fix", "abort", "computer"] as const;
export type ActionKind = (typeof DIRECT)[number] | (typeof GATED)[number] | "draft";
export type ActionStatus = "needed" | "working" | "done" | "declined" | "failed";
export type Action = {
  id: number; bot_id: number; kind: ActionKind; gated: number; project_dir: string; run_id: string | null;
  body: string; summary: string; status: ActionStatus; snapshot: string | null; result: string | null;
  known_runs: string | null; draft_id: number | null; at: number; updated: number;
};

// No secret ever goes in here: API keys live in the environment only.
const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS bots(id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, color TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('user','bot','receipt')), text TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS drafts(id INTEGER PRIMARY KEY, bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS memories(id INTEGER PRIMARY KEY, bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  text TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS routines(id INTEGER PRIMARY KEY, bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name TEXT NOT NULL, prompt TEXT NOT NULL, days TEXT NOT NULL, time TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  next_run INTEGER NOT NULL, last_run INTEGER, created INTEGER NOT NULL);
`;

// Routines run on a set of weekdays (0 = Sunday) at HH:MM, in the server's local time.
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
export const parseDays = (days: string) => days.split(",").filter(Boolean).map(Number).filter((d) => d >= 0 && d <= 6);
export function nextRun(days: number[], time: string, from: number) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(from);
  for (let i = 0; i <= 7; i++) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, h, m).getTime();
    if (t > from && days.includes(new Date(t).getDay())) return t;
  }
  throw new Error("routine has no days");
}
export function scheduleLabel(days: number[], time: string) {
  const s = [...new Set(days)].sort().join("");
  const when = s === "0123456" ? "Daily" : s === "12345" ? "Weekdays" : s === "06" ? "Weekends"
    : s.length === 1 ? DAYS[days[0]!] : [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d)).map((d) => DAY[d]).join(", ");
  return `${when} at ${time}`;
}

// v2: bot profile columns, settings, and action cards. Additive only.
const V2 = `
ALTER TABLE bots ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE bots ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE bots ADD COLUMN notify INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bots ADD COLUMN project TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS actions(id INTEGER PRIMARY KEY, bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('idea','note','memory','draft','start_run','decision','fix','abort')),
  gated INTEGER NOT NULL, project_dir TEXT NOT NULL DEFAULT '', run_id TEXT, body TEXT NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('needed','working','done','declined','failed')),
  snapshot TEXT, result TEXT, known_runs TEXT, draft_id INTEGER REFERENCES drafts(id) ON DELETE CASCADE,
  at INTEGER NOT NULL, updated INTEGER NOT NULL);
INSERT INTO actions(bot_id,kind,gated,summary,status,draft_id,at,updated)
  SELECT bot_id,'draft',0,channel || ' to ' || recipient,
    CASE status WHEN 'approved' THEN 'done' WHEN 'rejected' THEN 'declined' ELSE 'needed' END, id, at, at FROM drafts;
`;

// v3: a dismissed chat leaves the sidebar but keeps its history; + brings it back.
const V3 = "ALTER TABLE bots ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;";

// v4: computer-pilot cards. SQLite cannot widen a CHECK in place, so actions is rebuilt
// with the same columns and every row copied; a .bak of the file is taken first.
const V4 = `
CREATE TABLE actions_v4(id INTEGER PRIMARY KEY, bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('idea','note','memory','draft','start_run','decision','fix','abort','computer')),
  gated INTEGER NOT NULL, project_dir TEXT NOT NULL DEFAULT '', run_id TEXT, body TEXT NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('needed','working','done','declined','failed')),
  snapshot TEXT, result TEXT, known_runs TEXT, draft_id INTEGER REFERENCES drafts(id) ON DELETE CASCADE,
  at INTEGER NOT NULL, updated INTEGER NOT NULL);
INSERT INTO actions_v4 SELECT id,bot_id,kind,gated,project_dir,run_id,body,summary,status,snapshot,result,known_runs,draft_id,at,updated FROM actions;
DROP TABLE actions;
ALTER TABLE actions_v4 RENAME TO actions;
`;

export function openStore(path = "data/bot.db") {
  const file = path !== ":memory:";
  if (file) mkdirSync(dirname(path), { recursive: true });
  const existed = file && existsSync(path);
  const db = new Database(path, { create: true, strict: true });
  db.exec(SCHEMA);
  const version = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (version < 2) {
    if (existed) { db.exec("PRAGMA wal_checkpoint"); copyFileSync(path, `${path}.bak`); }
    db.transaction(() => { db.exec(V2); db.exec("PRAGMA user_version = 2"); })();
  }
  if (version < 3) db.transaction(() => { db.exec(V3); db.exec("PRAGMA user_version = 3"); })();
  if (version < 4) {
    if (existed) { db.exec("PRAGMA wal_checkpoint"); copyFileSync(path, `${path}.v3.bak`); }
    db.transaction(() => { db.exec(V4); db.exec("PRAGMA user_version = 4"); })();
  }

  // One clock for messages and actions: strictly increasing, so a thread built from
  // both tables sorts in the order things happened, even within a millisecond.
  let last = 0;
  const now = () => (last = Math.max(last + 1, Date.now()));
  const BOTS = `SELECT b.*, (SELECT text FROM messages m WHERE m.bot_id=b.id ORDER BY id DESC LIMIT 1) AS last,
    (SELECT at FROM messages m WHERE m.bot_id=b.id ORDER BY id DESC LIMIT 1) AS last_at,
    (SELECT COUNT(*) FROM actions a WHERE a.bot_id=b.id AND a.status='needed') AS needed FROM bots b`;
  const action = (id: number) => db.query("SELECT * FROM actions WHERE id=?").get(id) as Action | null;

  const store = {
    close: () => db.close(),
    now,

    // Chief first: it is the front door.
    bots: () =>
      db.query(`${BOTS} ORDER BY b.role='chief' DESC, COALESCE(last_at, created) DESC`).all() as (Bot & { last: string | null; last_at: number | null; needed: number })[],
    bot: (id: number) => db.query("SELECT * FROM bots WHERE id=?").get(id) as Bot | null,
    createBot(roleId: string, name?: string) {
      const r = role(roleId);
      if (!r) throw new Error(`unknown role: ${roleId}`);
      // A blank agent takes the next palette colour so new agents tell apart.
      const color = r.id === "custom" ? PALETTE[(db.query("SELECT COUNT(*) AS n FROM bots").get() as { n: number }).n % PALETTE.length]! : r.color;
      return db.query("INSERT INTO bots(name,role,color,created,description) VALUES(?,?,?,?,?) RETURNING *")
        .get(name?.trim() || r.name, r.id, color, now(), r.blurb) as Bot;
    },
    updateBot(id: number, p: Partial<Pick<Bot, "name" | "title" | "description" | "notify" | "project" | "hidden">>) {
      const cur = store.bot(id);
      if (!cur) return null;
      const n = { ...cur, ...p };
      return db.query("UPDATE bots SET name=?, title=?, description=?, notify=?, project=?, hidden=? WHERE id=? RETURNING *")
        .get(n.name, n.title, n.description, n.notify, n.project, n.hidden, id) as Bot;
    },
    deleteBot: (id: number) => db.query("DELETE FROM bots WHERE id=?").run(id).changes > 0,

    messages: (botId: number, limit = 200) =>
      (db.query("SELECT * FROM messages WHERE bot_id=? ORDER BY id DESC LIMIT ?").all(botId, limit) as Message[]).reverse(),
    addMessage: (botId: number, kind: Message["kind"], text: string) =>
      db.query("INSERT INTO messages(bot_id,kind,text,at) VALUES(?,?,?,?) RETURNING *").get(botId, kind, text, now()) as Message,

    drafts: (status?: DraftStatus) =>
      (status
        ? db.query("SELECT d.*, b.name AS bot_name FROM drafts d JOIN bots b ON b.id=d.bot_id WHERE status=? ORDER BY d.id DESC").all(status)
        : db.query("SELECT d.*, b.name AS bot_name FROM drafts d JOIN bots b ON b.id=d.bot_id ORDER BY d.id DESC").all()) as (Draft & { bot_name: string })[],
    draft: (id: number) => db.query("SELECT * FROM drafts WHERE id=?").get(id) as Draft | null,
    // Always pending, with its card. Nothing in this app ever sends a draft anywhere.
    addDraft(botId: number, d: { channel: string; recipient: string; subject: string; body: string }) {
      const t = now();
      const draft = db.query("INSERT INTO drafts(bot_id,channel,recipient,subject,body,status,at) VALUES(?,?,?,?,?,'pending',?) RETURNING *")
        .get(botId, d.channel, d.recipient, d.subject, d.body, t) as Draft;
      db.query("INSERT INTO actions(bot_id,kind,gated,summary,status,draft_id,at,updated) VALUES(?,'draft',0,?,'needed',?,?,?)")
        .run(botId, `${draft.channel} to ${draft.recipient}`, draft.id, t, t);
      return draft;
    },
    updateDraft(id: number, p: Partial<Pick<Draft, "recipient" | "subject" | "body" | "status">>) {
      const cur = store.draft(id);
      if (!cur) return null;
      const n = { ...cur, ...p };
      return db.query("UPDATE drafts SET recipient=?, subject=?, body=?, status=? WHERE id=? RETURNING *")
        .get(n.recipient, n.subject, n.body, n.status, id) as Draft;
    },

    memories: (botId: number) => db.query("SELECT * FROM memories WHERE bot_id=? ORDER BY id").all(botId) as Memory[],
    addMemory: (botId: number, text: string) =>
      db.query("INSERT INTO memories(bot_id,text,at) VALUES(?,?,?) RETURNING *").get(botId, text, now()) as Memory,
    updateMemory: (botId: number, id: number, text: string) =>
      db.query("UPDATE memories SET text=? WHERE id=? AND bot_id=?").run(text, id, botId).changes > 0,
    deleteMemory: (botId: number, id: number) =>
      db.query("DELETE FROM memories WHERE id=? AND bot_id=?").run(id, botId).changes > 0,

    action,
    draftAction: (draftId: number) => db.query("SELECT * FROM actions WHERE draft_id=?").get(draftId) as Action | null,
    actions: (q: { botId?: number; status?: ActionStatus; open?: boolean } = {}) =>
      db.query(`SELECT a.*, b.name AS bot_name, d.recipient, d.subject, d.body AS draft_body, d.channel
        FROM actions a JOIN bots b ON b.id=a.bot_id LEFT JOIN drafts d ON d.id=a.draft_id
        WHERE (?1 IS NULL OR a.bot_id=?1) AND (?2 IS NULL OR a.status=?2) AND (?3 = 0 OR a.status IN ('needed','working'))
        ORDER BY a.at`).all(q.botId ?? null, q.status ?? null, q.open ? 1 : 0) as (Action & Record<string, unknown>)[],
    addAction(botId: number, a: { kind: ActionKind; project_dir?: string; run_id?: string | null; body?: unknown; summary: string }) {
      const gated = (GATED as readonly string[]).includes(a.kind);
      const t = now();
      return db.query(`INSERT INTO actions(bot_id,kind,gated,project_dir,run_id,body,summary,status,at,updated)
        VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING *`).get(botId, a.kind, gated ? 1 : 0, a.project_dir ?? "", a.run_id ?? null,
        JSON.stringify(a.body ?? {}), a.summary, gated ? "needed" : "working", t, t) as Action;
    },
    updateAction(id: number, p: Partial<Pick<Action, "status" | "run_id" | "snapshot" | "result" | "known_runs">>) {
      const cur = action(id);
      if (!cur) return null;
      const n = { ...cur, ...p };
      return db.query("UPDATE actions SET status=?, run_id=?, snapshot=?, result=?, known_runs=?, updated=? WHERE id=? RETURNING *")
        .get(n.status, n.run_id, n.snapshot, n.result, n.known_runs, now(), id) as Action;
    },
    // Compare-and-set on status: two clicks on Approve cannot both get through.
    claimAction: (id: number, from: ActionStatus, to: ActionStatus) =>
      db.query("UPDATE actions SET status=?, updated=? WHERE id=? AND status=?").run(to, now(), id, from).changes > 0,
    claimedRuns: () => (db.query("SELECT run_id FROM actions WHERE kind='start_run' AND run_id IS NOT NULL").all() as { run_id: string }[]).map((r) => r.run_id),

    routines: (botId: number) => db.query("SELECT * FROM routines WHERE bot_id=? ORDER BY id").all(botId) as Routine[],
    routine: (botId: number, id: number) => db.query("SELECT * FROM routines WHERE id=? AND bot_id=?").get(id, botId) as Routine | null,
    addRoutine: (botId: number, r: { name: string; prompt: string; days: number[]; time: string }) =>
      db.query("INSERT INTO routines(bot_id,name,prompt,days,time,next_run,created) VALUES(?,?,?,?,?,?,?) RETURNING *")
        .get(botId, r.name, r.prompt, r.days.join(","), r.time, nextRun(r.days, r.time, Date.now()), now()) as Routine,
    updateRoutine(id: number, p: Partial<Pick<Routine, "enabled" | "next_run" | "last_run">>) {
      const cur = db.query("SELECT * FROM routines WHERE id=?").get(id) as Routine | null;
      if (!cur) return null;
      const n = { ...cur, ...p };
      return db.query("UPDATE routines SET enabled=?, next_run=?, last_run=? WHERE id=? RETURNING *").get(n.enabled, n.next_run, n.last_run, id) as Routine;
    },
    deleteRoutine: (botId: number, id: number) => db.query("DELETE FROM routines WHERE id=? AND bot_id=?").run(id, botId).changes > 0,
    dueRoutines: (at: number) => db.query("SELECT * FROM routines WHERE enabled=1 AND next_run<=? ORDER BY next_run").all(at) as Routine[],

    setting: (key: string) => (db.query("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | null)?.value,
    setSetting: (key: string, value: string) => { db.query("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value); },
  };
  return store;
}

export type Store = ReturnType<typeof openStore>;
