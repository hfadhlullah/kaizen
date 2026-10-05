import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { openStore, nextRun, parseDays, scheduleLabel, type Store, type DraftStatus, type Action } from "./db";
import { configFromEnv, listModels, probe, type ModelConfig } from "./model";
import { runTurn } from "./agent";
import { DEFAULTS, ROLES } from "./roles";
import { dialog, loginPath } from "./desktop";
import { boardClient, boardLink, loopbackUrl, normalise, reviewMark, runUpdated, BoardDown, type BoardRun, type BoardState } from "./board";
// Embedded by `bun build --compile`; the source run gets the real paths.
import PAGE from "../web/index.html" with { type: "file" };
import ENV_TEMPLATE from "../.env.example" with { type: "text" };

const DEFAULT_BOARD = "http://127.0.0.1:7420"; // kaizen web's DEFAULT_PORT (web.ts:18)
const POLL_MS = 15_000; // fallback for board events lost to a restart or a dropped stream
const UNSEEN_MS = 10 * 60_000; // a launch with no matching run after this says so
const TICK_MS = 30_000; // how often due routines are looked for

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
type Env = Record<string, string | undefined>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const bad = (why: string, status = 400) => json({ error: why }, status);

// Any tab on this machine can reach loopback; a page from the wider web must not write.
const localOrigin = (req: Request) => {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const h = new URL(origin).hostname;
    return h === "127.0.0.1" || h === "localhost";
  } catch { return false; }
};

async function body(req: Request): Promise<Record<string, unknown>> {
  try { const b = await req.json(); return b && typeof b === "object" ? b : {}; } catch { return {}; }
}
const text = (v: unknown, max = 20000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const id = (s: string | undefined) => (s && /^\d{1,12}$/.test(s) ? Number(s) : 0);
const parse = (s: string | null | undefined) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

const clipDoc = (t: string | null) => (t ? (t.length > 12000 ? `${t.slice(0, 12000)}\n\n…(cut)` : t) : null);

// What a live run card shows, read from the board's /run/:id.
export function snapshotOf(r: BoardRun) {
  const st = parse(r.state) ?? {};
  const items = (r.progress ?? "").split("\n").flatMap((l) => {
    const m = /^-\s*(todo|doing|done):\s*(.*)$/.exec(l.trim());
    return m ? [{ state: m[1], text: m[2] }] : [];
  });
  const section = (doc: string | null, head: RegExp) => {
    const lines = (doc ?? "").split("\n");
    const at = lines.findIndex((l) => head.test(l));
    if (at < 0) return [];
    const end = lines.findIndex((l, i) => i > at && /^#{1,2}\s/.test(l));
    return lines.slice(at + 1, end < 0 ? undefined : end);
  };
  // The plan's open questions, in the board's own Q:/- shape.
  const questions: { q: string; options: string[] }[] = [];
  for (const l of section(r.plan, /^##\s*open questions/i)) {
    const t = l.trim();
    if (t.startsWith("Q:")) questions.push({ q: t.slice(2).trim(), options: [] });
    else if (t.startsWith("- ") && questions.length) questions[questions.length - 1]!.options.push(t.slice(2).replace(/\s+—.*$/, "").replace(/\s*\(recommended\)\s*/i, " (recommended)").trim());
  }
  const work = section(r.plan, /^##\s*work list/i).flatMap((l) => (/^\s*-\s+(.*)$/.exec(l)?.[1] ? [/^\s*-\s+(.*)$/.exec(l)![1]!] : []));
  const verdict = /FINDINGS:.*$/m.exec(r.review ?? "")?.[0] ?? null;
  const open = r.findings.filter((f) => !f.done);
  return {
    launched: true, stage: String(st.stage ?? "plan"), awaiting: st.awaiting ?? null, updated: st.updated ?? null,
    items, questions: st.awaiting === "approvals.plan" ? questions.filter((q) => q.options.length) : [],
    work: st.awaiting === "approvals.plan" ? work.slice(0, 12) : [],
    verdict, open: open.map((f) => ({ n: f.n, text: f.text.slice(0, 300) })),
    // What the user reads to decide: the plan for a plan wait, the review for the rest.
    doc: clipDoc(st.awaiting === "approvals.plan" ? r.plan : st.awaiting === "approvals.review" || st.awaiting === "findings" ? r.review : null),
  };
}

// A wait the user already answered stays Working until the run moves on; the board keeps
// `awaiting` set until the launched agent records the answer.
const statusFrom = (snap: { stage: string; awaiting: string | null; answered?: unknown }) =>
  snap.stage === "abandoned" ? "declined" : snap.stage === "done" ? "done" : snap.awaiting && !snap.answered ? "needed" : "working";
const sameWait = (x: any, b: any) => x?.awaiting === b?.awaiting && (x?.seen ?? null) === (b?.seen ?? null);

export function createApp(deps: { store: Store; env: Env; fetch?: Fetch; boardFetch?: Fetch; watch?: boolean; quit?: () => void; startBoard?: (url: string) => Promise<string | null> }) {
  const { store, env } = deps;
  const clients = new Set<ReadableStreamDefaultController>();
  const enc = new TextEncoder();
  const push = (ev: string, data: unknown) => {
    for (const c of clients) { try { c.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { clients.delete(c); } }
  };

  // The model in use: Settings override .env for provider and model; keys only ever come from .env.
  const merged = (p?: { provider?: string; model?: string }) => ({
    ...env, PROVIDER: p?.provider ?? store.setting("provider") ?? env.PROVIDER, MODEL: p?.model ?? store.setting("model") ?? env.MODEL,
  });
  const cfgNow = (): ModelConfig => configFromEnv(merged());
  const boardUrl = () => loopbackUrl(store.setting("boardUrl") ?? "") ?? loopbackUrl(env.BOARD_URL ?? "") ?? DEFAULT_BOARD;
  const boardNow = () => boardClient(boardUrl(), deps.boardFetch ?? fetch);

  // A card as the page draws it: JSON fields parsed, and its link into the board.
  const view = (a: Action & Record<string, unknown>) => {
    const b = parse(a.body) ?? {};
    const snap = parse(a.snapshot);
    const link = !a.project_dir ? null : a.run_id ? boardLink(boardUrl(), a.project_dir, { run: a.run_id })
      : a.kind === "idea" || a.kind === "start_run" ? boardLink(boardUrl(), a.project_dir, { idea: b.text ?? "" }) : null;
    return { ...a, body: b, snapshot: snap, known_runs: undefined, link };
  };
  const one = (actionId: number) => view(store.actions().find((x) => x.id === actionId)!);
  const emitAction = (actionId: number) => push("action", one(actionId));

  // ---- the only code that calls the board's /run, /decide, /fix and /abort ----
  async function approve(a: Action): Promise<Response> {
    if (a.status !== "needed") return bad("this card is already handled", 409);
    const b = parse(a.body) ?? {};
    if (a.kind === "draft") {
      if (!store.claimAction(a.id, "needed", "done")) return bad("this card is already handled", 409);
      store.updateDraft(a.draft_id!, { status: "approved" });
      emitAction(a.id);
      return json(one(a.id));
    }
    if (!a.gated) return bad("nothing to approve", 409);
    if (a.kind === "start_run" && parse(a.snapshot)?.launched) return bad("this run already started", 409);

    const board = boardNow();
    let st: BoardState;
    try { st = await board.state(); } catch (e) {
      return bad(e instanceof BoardDown ? e.message : `could not read the board: ${(e as Error).message}`, 503);
    }
    // Re-check against the board as it is now; a card that no longer fits is refused
    // without calling the board.
    const stale = (why: string) => {
      if (store.claimAction(a.id, "needed", "failed")) store.updateAction(a.id, { result: `out of date: ${why}` });
      emitAction(a.id);
      return bad(`out of date: ${why}`, 409);
    };
    if (!st.projects.some((p) => p.dir === a.project_dir)) return stale("the project is no longer on the board");
    const card = a.run_id ? st.cards.find((c) => c.kind === "run" && c.state === a.project_dir && c.id === a.run_id) : null;
    if (a.kind === "decision" && card?.awaiting !== b.awaiting) return stale(`${a.run_id} is no longer waiting on ${b.awaiting}`);
    if (a.kind === "fix" && !(card && (card.status === "done" || card.awaiting === "approvals.review" || card.awaiting === "findings"))) return stale(`${a.run_id} is being worked on`);
    if (a.kind === "abort" && !(card && card.status !== "done" && card.status !== "abandoned")) return stale(`${a.run_id} is already finished`);
    if (a.kind === "decision" || a.kind === "fix") {
      let r: BoardRun;
      try { r = await board.run(a.project_dir, a.run_id!); } catch { return stale(`${a.run_id} could not be read`); }
      if (a.kind === "decision" && b.seen !== undefined && runUpdated(r) !== b.seen) return stale(`${a.run_id} changed since this card was made`);
      if (a.kind === "fix" && b.seen !== undefined && reviewMark(r) !== b.seen) return stale(`the review of ${a.run_id} changed since this card was made`);
    }
    if (a.kind === "start_run") {
      const idea = st.cards.find((c) => c.kind === "idea" && c.state === a.project_dir && normalise(c.text) === normalise(b.text ?? ""));
      if (idea?.status === "starting" || (b.idea === "idea" && !idea)) return stale(`"${b.text}" was already started on the board`);
    }
    // One answer per wait: a decision already sent for this run and this wait refuses the
    // next. No await between this check and the claim below, so two clicks cannot both pass.
    // A fix from a live card carries the wait it answers (`wait`: state.json updated) for the same check.
    const same = (x: any) => a.kind === "decision" ? sameWait(x, b) : b.wait != null && x?.wait === b.wait;
    const sent = a.kind !== "decision" && !(a.kind === "fix" && b.wait != null) ? null : store.actions().find((x) => x.id !== a.id && x.kind === a.kind && x.run_id === a.run_id
      && x.project_dir === a.project_dir && (x.status === "working" || x.status === "done") && same(parse(x.body)));
    if (sent) return stale(`${a.run_id} was already answered (card #${sent.id})`);

    if (!store.claimAction(a.id, "needed", "working")) return bad("this card is already handled", 409);
    const known = st.cards.filter((c) => c.kind === "run" && c.state === a.project_dir).map((c) => c.id!);
    let r;
    try {
      r = a.kind === "start_run" ? await board.launch(a.project_dir, b.text, b.kind ?? "")
        : a.kind === "decision" ? await board.decide(a.project_dir, a.run_id!, b.awaiting, b.why, b.answers)
        : a.kind === "fix" ? await board.fix(a.project_dir, a.run_id!, b.nums)
        : await board.abort(a.project_dir, a.run_id!, b.why);
    } catch (e) { r = { ok: false, why: (e as Error).message }; }

    if (!r.ok) store.updateAction(a.id, { status: "failed", result: [r.why, r.manual].filter(Boolean).join(" — ") || "the board refused" });
    else if (a.kind === "start_run") store.updateAction(a.id, { known_runs: JSON.stringify(known), snapshot: JSON.stringify({ launched: true, stage: "starting", at: Date.now() }), result: "launched" });
    else store.updateAction(a.id, { status: "done", result: "ok" });
    emitAction(a.id);
    // The run's live card stops asking: this wait is answered.
    if ((a.kind === "decision" || a.kind === "fix") && r.ok) for (const c of store.actions().filter((x) => x.kind === "start_run" && x.run_id === a.run_id && x.project_dir === a.project_dir)) {
      const s = parse(c.snapshot) ?? {};
      const fits = a.kind === "decision" ? s.awaiting === b.awaiting : s.awaiting === "approvals.review" || s.awaiting === "findings";
      if (!fits) continue;
      store.updateAction(c.id, { status: "working", snapshot: JSON.stringify({ ...s, answered: { awaiting: s.awaiting, seen: a.kind === "decision" ? b.seen ?? null : s.updated ?? null } }) });
      emitAction(c.id);
    }
    if (a.kind === "start_run" && r.ok) void refresh();
    return r.ok ? json(one(a.id)) : json({ ...one(a.id), error: r.why ?? "the board refused" }, 502);
  }

  // ---- live run cards: board events first, a poll as the fallback ----
  let waiting: Set<string> | null = null;
  let refreshing: Promise<void> | null = null;
  const launched = () => store.actions({ open: true }).filter((a) => a.kind === "start_run" && parse(a.snapshot)?.launched);

  async function refreshOnce() {
    const board = boardNow();
    let st: BoardState;
    try { st = await board.state(); } catch { return; }

    const claimed = new Set(store.claimedRuns());
    for (const a of launched()) {
      let cur: Action = a;
      const b = parse(a.body) ?? {};
      if (!cur.run_id) {
        // Link to the first run that is new since the launch, unclaimed, and whose request holds the idea.
        const known = new Set<string>(parse(a.known_runs) ?? []);
        const ids = st.cards.filter((c) => c.kind === "run" && c.state === a.project_dir && !known.has(c.id!) && !claimed.has(c.id!)).map((c) => c.id!).sort();
        for (const runId of ids) {
          const r = await board.run(a.project_dir, runId).catch(() => null);
          if (r && normalise(r.request ?? "").includes(normalise(b.text ?? ""))) {
            cur = store.updateAction(a.id, { run_id: runId })!;
            claimed.add(runId);
            break;
          }
        }
        if (!cur.run_id) {
          const snap = parse(a.snapshot) ?? {};
          if (!snap.unseen && Date.now() - (snap.at ?? a.updated) > UNSEEN_MS) {
            store.updateAction(a.id, { snapshot: JSON.stringify({ ...snap, unseen: true }) });
            emitAction(a.id);
          }
          continue;
        }
      }
      const r = await board.run(a.project_dir, cur.run_id!).catch(() => null);
      if (!r) continue;
      const card = st.cards.find((c) => c.kind === "run" && c.state === a.project_dir && c.id === cur.run_id);
      const prev = parse(cur.snapshot) ?? {};
      const fresh = snapshotOf(r);
      // An answer holds only for the wait it answered (same awaiting, same state.json updated).
      const answered = prev.answered && prev.answered.awaiting === fresh.awaiting && prev.answered.seen === fresh.updated ? prev.answered : undefined;
      const snap = { ...fresh, answered, stalled: card?.status === "stalled", at: prev.at };
      const status = statusFrom(snap);
      const next = JSON.stringify(snap);
      if (next !== cur.snapshot || status !== cur.status || cur !== a) {
        store.updateAction(a.id, { snapshot: next, status });
        emitAction(a.id);
      }
    }

    // A run waiting on the user that no card follows (started on the board or in a
    // terminal) gets a live card in a chat, so its decision is made there too.
    const taken = new Set(store.claimedRuns());
    const linking = launched().filter((a) => !a.run_id && !parse(a.snapshot)?.unseen);
    const bots = store.bots().filter((b) => !b.hidden);
    for (const c of st.cards) {
      if (c.kind !== "run" || !c.awaiting || !c.id || c.archived || taken.has(c.id)) continue;
      // It may be the run a launch card is still waiting to link.
      if (linking.some((a) => a.project_dir === c.state && !(parse(a.known_runs) ?? []).includes(c.id))) continue;
      const proj = st.projects.find((p) => p.dir === c.state);
      const owner = bots.find((b) => b.project && proj && (b.project === proj.label || b.project === proj.dir))
        ?? bots.find((b) => b.role === "chief") ?? bots[0];
      if (!owner) continue;
      const r = await board.run(c.state, c.id).catch(() => null);
      if (!r) continue;
      const title = c.title ?? c.text;
      const a = store.addAction(owner.id, { kind: "start_run", project_dir: c.state, run_id: c.id, body: { text: title, adopted: true },
        summary: `Run ${c.id} in ${proj?.label ?? c.state}: ${title}`.slice(0, 300) });
      const snap = { ...snapshotOf(r), stalled: c.status === "stalled", at: Date.now() };
      store.updateAction(a.id, { snapshot: JSON.stringify(snap), status: statusFrom(snap) });
      taken.add(c.id);
      emitAction(a.id);
    }

    // "Waiting on you" notifications: runs that started waiting since the last look.
    const now = new Set(st.cards.filter((c) => c.kind === "run" && c.awaiting).map((c) => `${c.state}|${c.id}|${c.awaiting}`));
    if (waiting) for (const k of now) if (!waiting.has(k)) {
      const [dir, run, awaiting] = k.split("|");
      const owner = store.actions().find((a) => a.kind === "start_run" && a.run_id === run && a.project_dir === dir)?.bot_id
        ?? store.bots().find((b) => b.role === "chief")?.id;
      push("waiting", { run, awaiting, project: st.projects.find((p) => p.dir === dir)?.label ?? dir, botId: owner });
    }
    waiting = now;
  }
  // One refresh at a time; a change during one is picked up by running again after it.
  let again = false;
  function refresh(): Promise<void> {
    if (refreshing) { again = true; return refreshing; }
    refreshing = (async () => {
      do { again = false; await refreshOnce(); } while (again);
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  let boardUp: boolean | null = null;
  const stopper = new AbortController();
  const timers: ReturnType<typeof setInterval>[] = [];
  if (deps.watch !== false) {
    // Board events, reconnecting with backoff. ponytail: one stream per server; fine for one user.
    (async () => {
      let wait = 1000;
      while (!stopper.signal.aborted) {
        try {
          const res = await boardNow().events(stopper.signal);
          if (!res.ok || !res.body) throw new Error("no stream");
          if (boardUp !== true) { boardUp = true; push("board", { ok: true }); }
          wait = 1000;
          void refresh();
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value.includes("changed")) void refresh();
          }
        } catch { /* down or dropped */ }
        if (stopper.signal.aborted) break;
        if (boardUp !== false) { boardUp = false; push("board", { ok: false }); }
        await Bun.sleep(wait);
        wait = Math.min(wait * 2, 30_000);
      }
    })();
    // The poll only runs while a launched card is still open, and stops otherwise.
    timers.push(setInterval(() => { if (launched().length) void refresh(); }, POLL_MS));
  }

  const busy = new Set<number>();
  // A thread with no send() stream open for it (a routine's, a teammate's): its events go to every page.
  const broadcast = (botId: number) => (ev: string, data: unknown) =>
    push(ev === "message" ? "msg" : ev, ev === "action" ? one((data as Action).id) : { ...(data as object), bot_id: botId });
  const ctxNow = (cfg: ModelConfig) => ({ store, cfg, board: boardNow(), fetch: deps.fetch, busy, emitTo: broadcast });

  // ---- routines: a due one runs as an ordinary turn, its output pushed to every open page.
  // Rescheduled from now before it runs, so a slow turn or a long downtime fires it once.
  // An agent mid-turn is skipped this tick and picked up on the next.
  async function tick(at = Date.now()) {
    let cfg: ModelConfig;
    try { cfg = cfgNow(); } catch { return; }
    const turns: Promise<unknown>[] = [];
    for (const r of store.dueRoutines(at)) {
      if (busy.has(r.bot_id)) continue;
      // A row with no valid days (only by editing the DB) can never be scheduled: pause it.
      let next: number;
      try { next = nextRun(parseDays(r.days), r.time, at); } catch { store.updateRoutine(r.id, { enabled: 0 }); continue; }
      store.updateRoutine(r.id, { next_run: next, last_run: at });
      const botId = r.bot_id;
      busy.add(botId);
      turns.push(runTurn(ctxNow(cfg), botId, r.prompt, broadcast(botId), { routine: r.name })
        .finally(() => { busy.delete(botId); push("status", { bot_id: botId, text: null }); })
        // Bun exits on an unhandled rejection; a turn that throws (its agent deleted mid-turn) must not take the server down.
        .catch(() => {}));
    }
    await Promise.all(turns);
  }
  if (deps.watch !== false) timers.push(setInterval(() => void tick().catch(() => {}), TICK_MS));

  async function handle(req: Request): Promise<Response> {
    // Host check stops DNS rebinding: a rebound name still arrives with that name in Host.
    const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
    if (host !== "127.0.0.1" && host !== "localhost") return new Response("forbidden", { status: 403 });
    if (req.method !== "GET" && !localOrigin(req)) return new Response("forbidden", { status: 403 });

    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const [a, b, c, d] = parts;
    const m = req.method;

    if (m === "GET" && parts.length === 0)
      return new Response(Bun.file(PAGE), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

    if (m === "GET" && a === "events" && !b) {
      let ctl: ReadableStreamDefaultController;
      const stream = new ReadableStream({
        start(x) { ctl = x; clients.add(x); x.enqueue(enc.encode(`event: board\ndata: ${JSON.stringify({ ok: boardUp })}\n\n`)); },
        cancel() { clients.delete(ctl); },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
    }

    // The app has no console window to close; Settings stops it through here.
    if (m === "POST" && a === "quit" && !b) {
      if (!deps.quit) return bad("not found", 404);
      setTimeout(deps.quit, 100);
      return json({ ok: true });
    }

    // The model is deliberately absent here: it lives in Settings only.
    if (m === "GET" && a === "info" && !b)
      return json({ user: store.setting("userName") ?? "You", roles: ROLES.map(({ id, name, division, color, blurb, never }) => ({ id, name, division, color, blurb, never, preset: DEFAULTS.includes(id) })) });

    if (m === "GET" && a === "board" && !b) {
      const board = boardNow();
      const ping = await board.ping();
      let projects: { dir: string; label: string }[] = [];
      if (ping.ok) try { projects = (await board.state()).projects; } catch { /* listed as none */ }
      return json({ ok: ping.ok, url: board.base, version: ping.version ?? null, projects });
    }
    if (m === "POST" && a === "board" && b === "start") {
      if (!deps.startBoard) return bad("not found", 404);
      const why = await deps.startBoard(boardUrl());
      return why ? bad(why, 502) : json({ ok: true });
    }

    if (a === "settings") {
      const keys = { anthropic: !!env.ANTHROPIC_API_KEY?.trim(), openai: !!env.OPENAI_API_KEY?.trim(), requesty: !!env.REQUESTY_API_KEY?.trim() };
      if (m === "GET" && !b) {
        let cfg: ModelConfig | null = null;
        try { cfg = cfgNow(); } catch { /* shown as unset */ }
        return json({ provider: cfg?.provider ?? null, model: cfg?.model ?? null, keys, boardUrl: boardUrl(), userName: store.setting("userName") ?? "You", canQuit: !!deps.quit,
          autoBoard: store.setting("autoBoard") !== "off", canStartBoard: !!deps.startBoard });
      }
      if (m === "GET" && b === "models") {
        try { return json(await listModels(configFromEnv(merged({ provider: url.searchParams.get("provider") ?? undefined, model: "x" })), deps.fetch)); }
        catch { return json([]); }
      }
      if (m === "POST" && !b) {
        const p = await body(req);
        if (p.boardUrl !== undefined) {
          const u = loopbackUrl(text(p.boardUrl, 200));
          if (!u) return bad("Board URL must be http://127.0.0.1:<port> or http://localhost:<port>");
          store.setSetting("boardUrl", u);
        }
        if (p.userName !== undefined) store.setSetting("userName", text(p.userName, 40) || "You");
        if (p.autoBoard !== undefined) store.setSetting("autoBoard", p.autoBoard ? "on" : "off");
        if (p.provider !== undefined || p.model !== undefined) {
          let cfg: ModelConfig;
          try { cfg = configFromEnv(merged({ provider: text(p.provider, 20) || undefined, model: text(p.model, 120) || undefined })); }
          catch (e) { return bad((e as Error).message); }
          // Prove it works before saving; a failed probe leaves the old setting in place.
          try { await probe(cfg, deps.fetch); } catch (e) { return bad(`That model did not answer: ${(e as Error).message}`); }
          store.setSetting("provider", cfg.provider);
          store.setSetting("model", cfg.model);
        }
        return json({ ok: true });
      }
    }

    if (a === "bots") {
      if (!b) {
        if (m === "GET") return json(store.bots());
        if (m === "POST") {
          const p = await body(req);
          if (!ROLES.some((r) => r.id === p.role)) return bad("unknown role");
          return json(store.createBot(p.role as string, text(p.name, 80)), 201);
        }
      }
      const botId = id(b);
      if (!botId || !store.bot(botId)) return bad("no such bot", 404);
      if (!c) {
        if (m === "PATCH") {
          const p = await body(req);
          const patch: Record<string, unknown> = {};
          if (p.name !== undefined) { const n = text(p.name, 80); if (!n) return bad("name required"); patch.name = n; }
          if (p.title !== undefined) patch.title = text(p.title, 80);
          if (p.description !== undefined) patch.description = text(p.description, 1000);
          if (p.notify !== undefined) patch.notify = p.notify ? 1 : 0;
          if (p.project !== undefined) patch.project = text(p.project, 500);
          if (p.hidden !== undefined) patch.hidden = p.hidden ? 1 : 0;
          return json(store.updateBot(botId, patch));
        }
        if (m === "DELETE") { store.deleteBot(botId); return json({ ok: true }); }
      }
      if (c === "messages" && !d) {
        if (m === "GET") return json({ messages: store.messages(botId), actions: store.actions({ botId }).map(view) });
        if (m === "POST") {
          // Room for attached text files, which the page sends inside the message.
          const msg = text((await body(req)).text, 300_000);
          if (!msg) return bad("text required");
          let cfg: ModelConfig;
          try { cfg = cfgNow(); } catch (e) { return bad((e as Error).message); }
          if (busy.has(botId)) return bad("this bot is still working", 409);
          busy.add(botId);
          // Stream every saved message, card and status line as an SSE event.
          const stream = new ReadableStream({
            async start(ctl) {
              const send = (ev: string, data: unknown) => { try { ctl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {} };
              try {
                await runTurn(ctxNow(cfg), botId, msg,
                  (ev, data) => send(ev, ev === "action" ? one((data as Action).id) : data));
              } finally { busy.delete(botId); send("done", {}); try { ctl.close(); } catch {} }
            },
          });
          return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
        }
      }
      if (c === "routines") {
        const rv = (x: ReturnType<typeof store.routines>[number]) => ({ ...x, label: scheduleLabel(parseDays(x.days), x.time) });
        if (m === "GET" && !d) return json(store.routines(botId).map(rv));
        const r = store.routine(botId, id(d));
        if (!r) return bad("no such routine", 404);
        if (m === "PATCH") {
          const on = (await body(req)).enabled ? 1 : 0;
          // Resuming schedules from now, so a paused routine never fires the moment it is turned back on.
          return json(rv(store.updateRoutine(r.id, { enabled: on, next_run: on && !r.enabled ? nextRun(parseDays(r.days), r.time, Date.now()) : r.next_run })!));
        }
        if (m === "DELETE") { store.deleteRoutine(botId, r.id); return json({ ok: true }); }
      }
      if (c === "memories") {
        if (m === "GET" && !d) return json(store.memories(botId));
        if (m === "POST" && !d) {
          const t = text((await body(req)).text, 2000);
          return t ? json(store.addMemory(botId, t), 201) : bad("text required");
        }
        const memId = id(d);
        if (memId && m === "PUT") {
          const t = text((await body(req)).text, 2000);
          if (!t) return bad("text required");
          return store.updateMemory(botId, memId, t) ? json({ ok: true }) : bad("no such memory", 404);
        }
        if (memId && m === "DELETE") return store.deleteMemory(botId, memId) ? json({ ok: true }) : bad("no such memory", 404);
      }
    }

    if (a === "actions") {
      if (m === "GET" && !b) {
        const s = url.searchParams.get("status");
        if (s && !["needed", "working", "done", "declined", "failed"].includes(s)) return bad("bad status");
        return json(store.actions({ status: (s as Action["status"]) || undefined }).map(view));
      }
      const actionId = id(b);
      const act = actionId ? store.action(actionId) : null;
      if (!act) return bad("no such card", 404);
      if (m === "POST" && !c) {
        const p = await body(req);
        if (p.op === "approve") return approve(act);
        if (p.op === "decline") {
          // A started run waiting on you is answered with Approve or Revise, not declined.
          if (act.kind === "start_run" && parse(act.snapshot)?.launched) return bad("this run already started; approve or revise it", 409);
          if (!store.claimAction(act.id, "needed", "declined")) return bad("this card is already handled", 409);
          store.updateAction(act.id, { result: text(p.why, 500) || "declined" });
          if (act.kind === "draft") store.updateDraft(act.draft_id!, { status: "rejected" });
          emitAction(act.id);
          return json(one(act.id));
        }
        if (p.op === "edit") {
          if (act.kind !== "draft" || act.status !== "needed") return bad("only a waiting draft can be edited", 409);
          const patch: Record<string, string> = {};
          for (const k of ["recipient", "subject", "body"] as const) if (typeof p[k] === "string") patch[k] = text(p[k]);
          store.updateDraft(act.draft_id!, patch);
          emitAction(act.id);
          return json(one(act.id));
        }
        if (p.op === "fix") {
          // From a live run card: fix the picked open findings, as one fix card approved at once.
          const snap = parse(act.snapshot);
          if (act.kind !== "start_run" || !snap?.launched || !act.run_id || !(snap.awaiting === "approvals.review" || snap.awaiting === "findings")) return bad("this run is not waiting on its findings", 409);
          if (snap.answered) return bad("already answered; waiting for the run to pick it up", 409);
          const open = new Set<number>((snap.open ?? []).map((f: { n: number }) => f.n));
          const nums = Array.isArray(p.nums) ? [...new Set(p.nums.map(Number))] : [];
          if (!nums.length || nums.some((n) => !open.has(n))) return bad("pick open findings to fix");
          let r: BoardRun;
          try { r = await boardNow().run(act.project_dir, act.run_id); } catch { return bad(`could not read ${act.run_id}`, 503); }
          const fix = store.addAction(act.bot_id, { kind: "fix", project_dir: act.project_dir, run_id: act.run_id, body: { nums, seen: reviewMark(r), wait: snap.updated ?? "" },
            summary: `Fix finding${nums.length > 1 ? "s" : ""} ${nums.join(", ")} of ${act.run_id}` });
          emitAction(fix.id);
          return approve(fix);
        }
        if (p.op === "decide") {
          // From a live run card: the click makes a decision card and approves it in one go.
          const snap = parse(act.snapshot);
          if (act.kind !== "start_run" || !snap?.launched || !act.run_id || !snap.awaiting) return bad("this run is not waiting on you", 409);
          if (snap.awaiting !== "approvals.plan" && snap.awaiting !== "approvals.review") return bad("the board takes no approval for this wait", 409);
          if (snap.answered) return bad("already answered; waiting for the run to pick it up", 409);
          const approveIt = p.approve === true;
          const why = text(p.why, 2000);
          if (!approveIt && !why) return bad("a revise needs a comment");
          const answers = Array.isArray(p.answers) ? p.answers.map((x) => text(x, 500)).filter(Boolean) : [];
          const what = snap.awaiting === "approvals.plan" ? "plan" : "final work";
          const dec = store.addAction(act.bot_id, {
            kind: "decision", project_dir: act.project_dir, run_id: act.run_id,
            body: approveIt ? { awaiting: snap.awaiting, seen: snap.updated, answers: snap.awaiting === "approvals.plan" ? answers : [] } : { awaiting: snap.awaiting, seen: snap.updated, why },
            summary: approveIt ? `Approve the ${what} of ${act.run_id}${answers.length ? ` with answers: ${answers.join("; ")}` : ""}` : `Send the ${what} of ${act.run_id} back: ${why}`,
          });
          emitAction(dec.id);
          return approve(dec);
        }
        return bad("unknown op");
      }
    }

    if (a === "drafts" && m === "GET") {
      if (!b) {
        const s = url.searchParams.get("status");
        if (s && !["pending", "approved", "rejected"].includes(s)) return bad("bad status");
        return json(store.drafts((s as DraftStatus) || undefined));
      }
      if (b === "export") {
        const md = store.drafts("approved").map((x) =>
          [`## ${x.subject || "(no subject)"}`, "", `- Channel: ${x.channel}`, `- To: ${x.recipient}`, `- From bot: ${x.bot_name}`, "", x.body, ""].join("\n"),
        ).join("\n");
        return new Response(`# Approved drafts\n\n${md}`, {
          headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": 'attachment; filename="approved-drafts.md"' },
        });
      }
    }

    return bad("not found", 404);
  }

  return {
    handle, refresh, approve, tick,
    stop() { stopper.abort(); for (const t of timers) clearInterval(t); },
  };
}

// `kaizen web --daemon` on the board's port; returns why it could not, or null once it runs.
export async function startBoard(board: string): Promise<string | null> {
  const kaizen = Bun.which("kaizen");
  if (!kaizen) return "kaizen is not installed, or not on PATH. Install it, then try again.";
  const args = ["web", "--daemon", "--no-open", "--port", new URL(board).port || "80"];
  const { cmdExe } = await import("../../cli/state.ts");
  const cmd = process.platform === "win32" ? [cmdExe(), "/c", "kaizen", ...args] : [kaizen, ...args];
  try {
    const code = await Bun.spawn(cmd, { stdio: ["ignore", "inherit", "inherit"], windowsHide: true }).exited;
    return code === 0 ? null : `kaizen web exited ${code}`;
  } catch (e) { return `could not start kaizen web: ${(e as Error).message}`; }
}

if (import.meta.main) {
  // The compiled app runs from Bun's virtual filesystem, started from any folder, so its
  // .env and database live in ~/.kaizen-bot instead of beside the source.
  const compiled = import.meta.dir.startsWith("/$bunfs") || import.meta.dir.includes("~BUN");
  const home = join(homedir(), ".kaizen-bot");
  const envFile = join(home, ".env");
  const env = process.env;
  if (compiled && existsSync(envFile)) {
    for (const [k, v] of Object.entries(parseEnv(readFileSync(envFile, "utf8")))) env[k] ??= v;
  }
  // The macOS and Windows apps have no console, so the reason is a dialog; a Linux
  // binary's console closes the moment it exits, so it waits for Enter.
  const gui = compiled && (process.platform === "darwin" || process.platform === "win32");
  const fail = (why: string): never => {
    if (gui) dialog(why);
    else { console.error(`kaizen-bot: ${why}`); if (compiled) prompt("\nPress Enter to close."); }
    process.exit(1);
  };
  if (compiled && process.platform === "darwin") {
    const path = loginPath();
    if (path) env.PATH = path;
  }
  const store = openStore(compiled ? join(home, "bot.db") : join(import.meta.dir, "../data/bot.db"));
  // Refuse to start without a working provider config, saying which key or model is missing.
  try {
    const s = { PROVIDER: store.setting("provider"), MODEL: store.setting("model") };
    configFromEnv({ ...env, PROVIDER: s.PROVIDER ?? env.PROVIDER, MODEL: s.MODEL ?? env.MODEL });
  } catch (e) {
    let why = (e as Error).message;
    if (compiled && !existsSync(envFile)) {
      mkdirSync(home, { recursive: true });
      writeFileSync(envFile, ENV_TEMPLATE);
      const edit = process.platform === "win32" ? ["notepad", envFile] : process.platform === "darwin" ? ["open", "-t", envFile] : ["xdg-open", envFile];
      try { Bun.spawn(edit, { stdio: ["ignore", "ignore", "ignore"] }).unref(); } catch { /* the path is printed below */ }
      why = `first run: created ${envFile}\nSet PROVIDER and its API key in it, save, then open Kaizen Bot again.`;
    } else if (compiled) why += `\nSettings are read from ${envFile}`;
    fail(why);
  }
  if (env.BOARD_URL && !loopbackUrl(env.BOARD_URL)) console.error(`kaizen-bot: BOARD_URL must be a loopback http URL; using ${DEFAULT_BOARD}`);
  const port = Number(env.PORT) || 7430;
  const url = `http://127.0.0.1:${port}`;
  // Loopback only: the board URL passed loopbackUrl() and url is 127.0.0.1.
  const answers = (u: string, f: Fetch = fetch) => f(u, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
  // Only the app opens windows and starts the board; `bun start` behaves as it always has.
  const web = compiled ? await import("../../cli/web.ts") : null;
  // Its own browser profile makes the window the app's alone: own taskbar entry, never a
  // tab in, or a window of, the browser the user already has open.
  const openApp = async (u: string) => web?.openApp(u, join(home, "window"));
  if (compiled) {
    const board = loopbackUrl(store.setting("boardUrl") ?? "") ?? loopbackUrl(env.BOARD_URL ?? "") ?? DEFAULT_BOARD;
    // Settings → "Start the board with Kaizen Bot", on unless turned off.
    if (store.setting("autoBoard") !== "off" && Bun.which("kaizen") && !(await answers(board))) {
      const why = await startBoard(board);
      if (why) console.error(`kaizen-bot: ${why}; the board shows as down`);
    }
  }
  const app = createApp({ store, env, quit: compiled ? () => process.exit(0) : undefined, startBoard });
  try {
    Bun.serve({ hostname: "127.0.0.1", port, idleTimeout: 0, fetch: app.handle });
  } catch (e) {
    // Something already answers on the port: a second launch of the app just opens its window.
    if (compiled && (await answers(url))) {
      console.log(`Kaizen Bot already running on ${url}`);
      await openApp(url);
      process.exit(0);
    }
    if (!compiled) throw e;
    fail(`cannot listen on ${url}: ${(e as Error).message}`);
  }
  console.log(`Kaizen Bot on ${url}`);
  if (compiled) await openApp(url);
}
