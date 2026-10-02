import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore, type Store } from "../src/db";
import { createApp } from "../src/server";
import { runTurn, systemPrompt } from "../src/agent";
import { loopbackUrl, resolveProject, type BoardState } from "../src/board";
import { ROLES } from "../src/roles";
import type { ModelConfig } from "../src/model";

const KEY = "sk-test-SECRET-123";
const cfg: ModelConfig = { provider: "anthropic", model: "m", key: KEY, baseUrl: "https://api.anthropic.com/v1" };
const ENV = { PROVIDER: "anthropic", MODEL: "m", ANTHROPIC_API_KEY: KEY };
const P = "/w/kaizen/.kaizen", S = "/w/sales/.kaizen";

// A pretend kaizen board: the routes Kaizen Bot uses, in memory, recording every write.
function fakeBoard() {
  const state: BoardState = { project: "kaizen", dir: P, projects: [{ dir: P, label: "kaizen" }, { dir: S, label: "sales" }], cards: [] };
  const runs: Record<string, any> = {};
  const writes: { path: string; body: any }[] = [];
  const b = { up: true, launchFails: false };
  const statusOf = (st: any) => st.stage === "done" ? "done" : st.stage === "abandoned" ? "abandoned" : st.awaiting ? "waiting" : "running";
  const setRun = (dir: string, id: string, st: any, extra: any = {}) => {
    const k = `${dir}|${id}`;
    runs[k] = { id, request: "", plan: null, approval: null, impl: null, review: null, progress: null, findings: [], ...runs[k], ...extra, state: JSON.stringify(st) };
    const card = { kind: "run" as const, id, status: statusOf(st), text: id, state: dir, awaiting: st.awaiting ?? null, column: 1, title: runs[k].request };
    const i = state.cards.findIndex((c) => c.kind === "run" && c.state === dir && c.id === id);
    if (i < 0) state.cards.push(card); else state.cards[i] = card;
  };
  const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status });
  const f = async (url: string, init?: RequestInit) => {
    if (!b.up) throw new Error("ECONNREFUSED");
    const u = new URL(url);
    if ((init?.method ?? "GET") === "GET") {
      if (u.pathname === "/") return new Response("", { headers: { "x-kaizen-version": "1.11.1" } });
      if (u.pathname === "/state") return json(state);
      if (u.pathname.startsWith("/run/")) {
        const r = runs[`${u.searchParams.get("dir")}|${decodeURIComponent(u.pathname.slice(5))}`];
        return r ? json(r) : json({ error: "no such run" }, 404);
      }
      if (u.pathname === "/events") return new Response(new ReadableStream({ start() {} }));
      return json({ error: "not found" }, 404);
    }
    const body = JSON.parse(String(init!.body));
    writes.push({ path: u.pathname, body });
    if (u.pathname === "/inbox") { state.cards.push({ kind: "idea", status: "idea", text: body.text, state: body.dir, awaiting: null, column: 0 }); return json({ ok: true }); }
    if (u.pathname === "/run" && b.launchFails) return json({ ok: false, why: "no terminal", manual: "run: claude 'x'" }, 500);
    if (u.pathname === "/decide") {
      const st = JSON.parse(runs[`${body.dir}|${body.id}`].state);
      if (st.awaiting !== body.awaiting) return json({ error: "this run is not waiting on that approval" }, 409);
    }
    return json({ ok: true });
  };
  return { f, state, runs, writes, setRun, b };
}

// A pretend model that calls the given tools in order, then says "ok".
function model(...calls: [string, unknown][]) {
  const replies = [...calls.map(([name, input], i) => ({ content: [{ type: "tool_use", id: `t${i}`, name, input }] })), { content: [{ type: "text", text: "ok" }] }];
  return async () => new Response(JSON.stringify(replies.shift() ?? { content: [{ type: "text", text: "ok" }] }));
}

function setup() {
  const store = openStore(":memory:");
  const board = fakeBoard();
  const app = createApp({ store, env: ENV, boardFetch: board.f, watch: false });
  const req = (path: string, body?: unknown) => app.handle(new Request(`http://127.0.0.1:7430${path}`, body === undefined ? { headers: { host: "127.0.0.1:7430" } }
    : { method: "POST", headers: { host: "127.0.0.1:7430", "content-type": "application/json" }, body: JSON.stringify(body) }));
  const chief = store.bots().find((b) => b.role === "chief")!;
  const say = (botId: number, f: ReturnType<typeof model>) =>
    runTurn({ store, cfg, board: boardClientFor(board.f), fetch: f }, botId, "go", () => {});
  return { store, board, app, req, chief, say };
}
import { boardClient } from "../src/board";
const boardClientFor = (f: any) => boardClient("http://127.0.0.1:7420", f);
const cards = (s: Store, botId?: number) => s.actions({ botId });

test("G-33/G-24: every acting tool leaves exactly one card, reads leave receipts, proposals write nothing to the board", async () => {
  const { store, board, chief, say } = setup();
  board.setRun(P, "r-plan", { stage: "plan", awaiting: "approvals.plan" }, { request: "plan me" });
  board.setRun(P, "r-done", { stage: "done", awaiting: null }, { request: "done one", findings: [{ n: 1, text: "x", done: false }, { n: 2, text: "y", done: true }] });
  board.setRun(P, "r-live", { stage: "build", awaiting: null }, { request: "live one" });
  await say(chief.id, model(
    ["board_status", {}], ["read_run", { project: "kaizen", run: "r-plan" }],
    ["add_idea", { project: "kaizen", text: "invoice export" }], ["add_note", { project: "kaizen", run: "r-live", text: "fyi" }],
    ["propose_start_run", { project: "kaizen", idea: "invoice export" }], ["propose_decision", { project: "kaizen", run: "r-plan", approve: true, answers: ["base"] }],
    ["propose_fix", { project: "kaizen", run: "r-done", findings: [1, 2] }], ["propose_abort", { project: "kaizen", run: "r-live", reason: "wrong idea" }],
  ));
  // board_status, read_run and add_note fall in the first 8 model steps; the rest in a second turn.
  await say(chief.id, model(["propose_abort", { project: "kaizen", run: "r-live", reason: "wrong idea" }], ["remember", { fact: "kaizen is the main project" }], ["draft_message", { channel: "email", to: "a@b.c", body: "hi" }]));
  const kinds = cards(store, chief.id).map((a) => a.kind).sort();
  expect(kinds).toEqual(["abort", "abort", "decision", "draft", "fix", "idea", "memory", "note", "start_run"].sort());
  expect(store.messages(chief.id).filter((m) => m.kind === "receipt").map((m) => m.text)).toEqual(["Board → 1 waiting on you · 1 in flight · 0 ideas", "Run → read r-plan"]);
  // Only the two direct board tools wrote; no proposal reached the board.
  expect(board.writes.map((w) => w.path)).toEqual(["/inbox", "/note"]);
  const gated = cards(store, chief.id).filter((a) => a.gated);
  expect(gated.every((a) => a.status === "needed")).toBe(true);
  // A fix names only open findings.
  expect(JSON.parse(gated.find((a) => a.kind === "fix")!.body)).toMatchObject({ nums: [1] });
});

test("G-24: only the approve route in server.ts calls the gated board routes", () => {
  const src = readdirSync(join(import.meta.dir, "../src")).map((f) => [f, readFileSync(join(import.meta.dir, "../src", f), "utf8")] as const);
  for (const [f, t] of src) {
    const calls = t.match(/board\.(launch|decide|fix|abort)\(/g) ?? [];
    if (f !== "server.ts") expect(calls).toEqual([]);
  }
  const server = readFileSync(join(import.meta.dir, "../src/server.ts"), "utf8");
  const approveFn = server.slice(server.indexOf("async function approve("), server.indexOf("// ---- live run cards"));
  expect((server.match(/board\.(launch|decide|fix|abort)\(/g) ?? []).length).toBe((approveFn.match(/board\.(launch|decide|fix|abort)\(/g) ?? []).length);
  expect((approveFn.match(/board\.(launch|decide|fix|abort)\(/g) ?? []).length).toBe(4);
});

test("G-25/G-34: approve launches with yolo false; decline never calls the board; no Yolo, commit or cd anywhere", async () => {
  const { store, board, chief, say, req } = setup();
  await say(chief.id, model(["propose_start_run", { project: "kaizen", idea: "a" }], ["propose_start_run", { project: "kaizen", idea: "b", mode: "lite" }]));
  const [a, b] = cards(store, chief.id);
  expect((await req(`/actions/${b!.id}`, { op: "decline", why: "not now" })).status).toBe(200);
  expect(board.writes).toEqual([]);
  expect(store.action(b!.id)!.status).toBe("declined");
  expect((await req(`/actions/${a!.id}`, { op: "approve" })).status).toBe(200);
  expect(board.writes).toEqual([{ path: "/run", body: { dir: P, text: "a", kind: "", yolo: false } }]);
  expect(store.action(a!.id)!.status).toBe("working");
  expect((await req(`/actions/${a!.id}`, { op: "approve" })).status).toBe(409);
  const src = readdirSync(join(import.meta.dir, "../src")).map((f) => readFileSync(join(import.meta.dir, "../src", f), "utf8")).join("\n");
  expect(src).not.toMatch(/yolo:\s*true|"\/commit"|"\/cd"/);
  expect(readFileSync(join(import.meta.dir, "../src/agent.ts"), "utf8")).not.toMatch(/yolo/i);
});

test("G-26: a card that no longer fits is refused without calling the board; a second approve is 409", async () => {
  const { store, board, chief, say, req } = setup();
  board.setRun(P, "r1", { stage: "plan", awaiting: "approvals.plan" }, { request: "x" });
  await say(chief.id, model(["propose_decision", { project: "kaizen", run: "r1", approve: true }], ["propose_decision", { project: "kaizen", run: "r1", approve: false, reason: "smaller" }]));
  const [first, second] = cards(store, chief.id);
  board.setRun(P, "r1", { stage: "build", awaiting: null }); // answered on the board meanwhile
  const res = await req(`/actions/${first!.id}`, { op: "approve" });
  expect(res.status).toBe(409);
  expect((await res.json()).error).toContain("no longer waiting on approvals.plan");
  expect(board.writes).toEqual([]);
  expect(store.action(first!.id)!.status).toBe("failed");
  board.setRun(P, "r1", { stage: "plan", awaiting: "approvals.plan" });
  expect((await req(`/actions/${second!.id}`, { op: "approve" })).status).toBe(200);
  expect(board.writes).toEqual([{ path: "/decide", body: { dir: P, id: "r1", awaiting: "approvals.plan", why: "smaller" } }]);
  expect((await req(`/actions/${second!.id}`, { op: "approve" })).status).toBe(409);
  expect(board.writes).toHaveLength(1);
});

test("G-27: a project the board does not list is refused by every board tool", async () => {
  const { store, board, chief, say } = setup();
  await say(chief.id, model(["add_idea", { project: "/etc", text: "x" }], ["propose_start_run", { project: "nope", idea: "x" }], ["board_status", { project: "nope" }]));
  expect(cards(store, chief.id)).toEqual([]);
  expect(board.writes).toEqual([]);
  expect(resolveProject(board.state, "Sales")).toEqual({ dir: S, label: "sales" });
  expect(resolveProject(board.state, "/w/sales")).toEqual({ dir: S, label: "sales" });
  expect(resolveProject(board.state, "/w/other/.kaizen")).toBeNull();
});

test("G-28: with the board down, tools say so, the chat keeps going, and /board reports it", async () => {
  const { store, board, chief, say, req } = setup();
  board.b.up = false;
  const results: string[] = [];
  const f = model(["board_status", {}]);
  await runTurn({ store, cfg, board: boardClientFor(board.f), fetch: async (u, i) => { const b = JSON.parse(String(i!.body)); const last = b.messages.at(-1); if (Array.isArray(last.content) && last.content[0].type === "tool_result") results.push(last.content[0].content); return f(); } }, chief.id, "status?", () => {});
  expect(results[0]).toContain("not running at http://127.0.0.1:7420");

  expect(store.messages(chief.id).at(-1)!.text).toBe("ok");
  expect(await (await req("/board")).json()).toMatchObject({ ok: false, projects: [] });
  // The model is told up front, so it reports a down board instead of answering from old messages.
  const sys: string[] = [];
  await runTurn({ store, cfg, board: boardClientFor(board.f), fetch: async (u, i) => { sys.push(JSON.parse(String(i!.body)).system); return model()(); } }, chief.id, "status?", () => {});
  expect(sys[0]).toContain("NOT reachable at http://127.0.0.1:7420");
  expect(store.messages(chief.id).filter((m) => m.kind === "receipt").at(-1)!.text).toBe("Board → not running at http://127.0.0.1:7420");
  expect(sys[0]).toContain("You have no open cards now");
  board.b.up = true;
  await runTurn({ store, cfg, board: boardClientFor(board.f), fetch: async (u, i) => { sys.push(JSON.parse(String(i!.body)).system); return model()(); } }, chief.id, "status?", () => {});
  expect(sys[1]).toContain("board is reachable");
});

test("G-29: the board URL is loopback http only", async () => {
  expect(loopbackUrl("http://127.0.0.1:7499")).toBe("http://127.0.0.1:7499");
  expect(loopbackUrl("http://localhost:7420/")).toBe("http://localhost:7420");
  for (const bad of ["https://127.0.0.1:7420", "http://10.0.0.2:7420", "http://evil.test", "http://127.0.0.1.evil.test:80", "http://u:p@127.0.0.1:1", "http://127.0.0.1:7420/x", "file:///etc"]) expect(loopbackUrl(bad)).toBeNull();
  const { req, store } = setup();
  expect((await req("/settings", { boardUrl: "http://example.com:7420" })).status).toBe(400);
  expect(store.setting("boardUrl")).toBeUndefined();
  expect((await req("/settings", { boardUrl: "http://127.0.0.1:7499" })).status).toBe(200);
  expect(store.setting("boardUrl")).toBe("http://127.0.0.1:7499");
});

test("G-35/G-36: a launch card links only to a new matching run, follows it live, and survives reload and restart", async () => {
  const { store, board, chief, say, req, app } = setup();
  board.setRun(P, "2026-10-01-old", { stage: "done" }, { request: "Invoice export" }); // existed before: never claimed
  await say(chief.id, model(["propose_start_run", { project: "kaizen", idea: "Invoice   export" }], ["propose_start_run", { project: "kaizen", idea: "invoice export" }]));
  const [a, b] = cards(store, chief.id);
  await req(`/actions/${a!.id}`, { op: "approve" });
  await req(`/actions/${b!.id}`, { op: "approve" });
  board.setRun(P, "2026-10-02-other", { stage: "plan" }, { request: "something else" });
  board.setRun(P, "2026-10-02-invoice", { stage: "plan" }, { request: "# Request\n\ninvoice export" });
  await app.refresh();
  expect(store.action(a!.id)!.run_id).toBe("2026-10-02-invoice");
  expect(store.action(b!.id)!.run_id).toBeNull(); // the one match is taken; the old run is not
  // The run stops for the plan approval: the card asks, with the plan's questions.
  board.setRun(P, "2026-10-02-invoice", { stage: "plan", awaiting: "approvals.plan" }, {
    plan: "# Plan\n\n## Work list\n\n- Export CSV\n\n## Open questions\n\nQ: Which format?\n- CSV (recommended) — simple\n- XLSX — richer\n",
    progress: "- done: scaffold\n- todo: export",
  });
  await app.refresh();
  let snap = JSON.parse(store.action(a!.id)!.snapshot!);
  expect(store.action(a!.id)!.status).toBe("needed");
  expect(snap.questions).toEqual([{ q: "Which format?", options: ["CSV (recommended)", "XLSX"] }]);
  expect(snap.items).toEqual([{ state: "done", text: "scaffold" }, { state: "todo", text: "export" }]);
  // Reload: the page's thread read returns the stored card state.
  const page = await (await req(`/bots/${chief.id}/messages`)).json();
  expect(page.actions.find((x: any) => x.id === a!.id)).toMatchObject({ status: "needed", snapshot: { awaiting: "approvals.plan" }, link: `http://127.0.0.1:7420/?dir=${encodeURIComponent(P)}&run=2026-10-02-invoice` });
  // Answer from the card: a decision card is made and approved in one click.
  expect((await req(`/actions/${a!.id}`, { op: "decline" })).status).toBe(409);
  expect((await req(`/actions/${a!.id}`, { op: "decide", approve: true, answers: ["CSV"] })).status).toBe(200);
  expect(board.writes.at(-1)).toEqual({ path: "/decide", body: { dir: P, id: "2026-10-02-invoice", awaiting: "approvals.plan", answers: ["CSV"] } });
  // Restart: a new app over the same store picks the card up and follows it to Done.
  app.stop();
  board.setRun(P, "2026-10-02-invoice", { stage: "done", awaiting: null }, { progress: "- done: scaffold\n- done: export", review: "FINDINGS: 0 critical, 0 high, 0 medium, 0 low" });
  const app2 = createApp({ store, env: ENV, boardFetch: board.f, watch: false });
  await app2.refresh();
  snap = JSON.parse(store.action(a!.id)!.snapshot!);
  expect(store.action(a!.id)!.status).toBe("done");
  expect(snap.verdict).toBe("FINDINGS: 0 critical, 0 high, 0 medium, 0 low");
  // Abandoned shows Declined.
  board.setRun(P, "2026-10-02-b", { stage: "abandoned" }, { request: "invoice export" });
  await app2.refresh();
  expect(store.action(b!.id)!).toMatchObject({ run_id: "2026-10-02-b", status: "declined" });
});

test("G-15: a bad provider, missing key or failing model is refused and the setting is unchanged", async () => {
  const store = openStore(":memory:");
  let ok = false;
  const f = async () => ok ? new Response(JSON.stringify({ content: [{ type: "text", text: "OK" }] })) : new Response(JSON.stringify({ error: { message: "model not found" } }), { status: 404 });
  const app = createApp({ store, env: ENV, fetch: f as any, boardFetch: fakeBoard().f, watch: false });
  const post = (b: unknown) => app.handle(new Request("http://127.0.0.1:7430/settings", { method: "POST", headers: { host: "127.0.0.1", "content-type": "application/json" }, body: JSON.stringify(b) }));
  expect((await post({ provider: "grok", model: "x" })).status).toBe(400);
  expect((await post({ provider: "openai", model: "gpt-x" })).status).toBe(400); // no OPENAI key
  const res = await post({ provider: "anthropic", model: "claude-nope" });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toContain("model not found");
  expect(store.setting("model")).toBeUndefined();
  ok = true;
  expect((await post({ provider: "anthropic", model: "claude-haiku-4-5" })).status).toBe(200);
  expect([store.setting("provider"), store.setting("model")]).toEqual(["anthropic", "claude-haiku-4-5"]);
});

test("G-16: a v1 database opens after the upgrade with every row intact, and a backup is kept", () => {
  const dir = mkdtempSync(join(tmpdir(), "kbot-"));
  const path = join(dir, "bot.db");
  try {
    const old = new Database(path);
    old.exec(`CREATE TABLE bots(id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, color TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE messages(id INTEGER PRIMARY KEY, bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN ('user','bot','receipt')), text TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE drafts(id INTEGER PRIMARY KEY, bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE, channel TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), at INTEGER NOT NULL);
      CREATE TABLE memories(id INTEGER PRIMARY KEY, bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE, text TEXT NOT NULL, at INTEGER NOT NULL);
      INSERT INTO bots VALUES(1,'Sales Outbound','sales','#b4441c',1);
      INSERT INTO messages VALUES(1,1,'user','hi',2),(2,1,'receipt','Draft → email',3);
      INSERT INTO drafts VALUES(1,1,'email','dana','Hi','body','pending',3),(2,1,'email','raj','','b','approved',4);
      INSERT INTO memories VALUES(1,1,'Acme signs annual',5);`);
    old.close();
    const s = openStore(path);
    expect(existsSync(`${path}.bak`)).toBe(true);
    expect(s.bot(1)).toMatchObject({ name: "Sales Outbound", title: "", project: "", notify: 1 });
    expect(s.messages(1).map((m) => m.text)).toEqual(["hi", "Draft → email"]);
    expect(s.memories(1).map((m) => m.text)).toEqual(["Acme signs annual"]);
    expect(s.drafts().map((d) => d.status).sort()).toEqual(["approved", "pending"]);
    expect(s.actions().map((a) => [a.kind, a.status, a.draft_id])).toEqual([["draft", "needed", 1], ["draft", "done", 2]]);
    s.close();
    // Opening again does not migrate twice.
    const again = openStore(path);
    expect(again.actions()).toHaveLength(2);
    again.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("G-39/G-32: every role says what it never does; Chief is seeded, first and the front door", () => {
  for (const r of ROLES) expect(r.never.length).toBeGreaterThan(0);
  const { store, chief } = setup();
  store.createBot("sales");
  expect(store.bots()[0]!.id).toBe(chief.id);
  for (const b of store.bots()) {
    const p = systemPrompt(store, b.id);
    for (const n of ROLES.find((r) => r.id === b.role)!.never) expect(p).toContain(n);
  }
  // Seeding happens once: deleting Chief is respected across restarts.
  store.deleteBot(chief.id);
  createApp({ store, env: ENV, boardFetch: fakeBoard().f, watch: false });
  expect(store.bots().some((b) => b.role === "chief")).toBe(false);
  // Division agents cannot decide, fix or abort; that is Chief's.
  for (const r of ROLES.filter((x) => x.id !== "chief")) expect(r.tools.some((t) => ["propose_decision", "propose_fix", "propose_abort"].includes(t))).toBe(false);
});

test("G-20: the model is not in /info", async () => {
  const { req } = setup();
  const info = await (await req("/info")).json();
  expect(Object.keys(info).sort()).toEqual(["roles", "user"]);
  expect(JSON.stringify(info)).not.toMatch(/"model"|"provider"/);
});

test("G-26 (finding 1): a run waiting on you is answered once from its card; a new wait can be answered again", async () => {
  const { store, board, chief, say, req, app } = setup();
  await say(chief.id, model(["propose_start_run", { project: "kaizen", idea: "csv" }]));
  const [run] = cards(store, chief.id);
  await req(`/actions/${run!.id}`, { op: "approve" });
  board.setRun(P, "2026-10-02-csv", { stage: "plan", awaiting: "approvals.plan", updated: "t1" }, { request: "csv" });
  await app.refresh();
  expect(store.action(run!.id)!.status).toBe("needed");
  const first = await req(`/actions/${run!.id}`, { op: "decide", approve: true });
  expect(first.status).toBe(200);
  // The board still says awaiting until the agent records the answer; the card stops asking.
  expect(store.action(run!.id)!.status).toBe("working");
  expect((await req(`/actions/${run!.id}`, { op: "decide", approve: true })).status).toBe(409);
  await app.refresh();
  expect(store.action(run!.id)!.status).toBe("working");
  expect((await req(`/actions/${run!.id}`, { op: "decide", approve: true })).status).toBe(409);
  // A bot-proposed decision for the same wait is refused too, without a board call.
  await say(chief.id, model(["propose_decision", { project: "kaizen", run: "2026-10-02-csv", approve: true }]));
  const dup = cards(store, chief.id).filter((a) => a.kind === "decision").at(-1)!;
  expect((await req(`/actions/${dup.id}`, { op: "approve" })).status).toBe(409);
  expect(board.writes.filter((w) => w.path === "/decide")).toHaveLength(1);
  // The run moves on and comes back to the same approval later: that new wait is answerable.
  board.setRun(P, "2026-10-02-csv", { stage: "plan", awaiting: "approvals.plan", updated: "t2" });
  await app.refresh();
  expect(store.action(run!.id)!.status).toBe("needed");
  expect((await req(`/actions/${run!.id}`, { op: "decide", approve: false, why: "smaller" })).status).toBe(200);
  expect(board.writes.filter((w) => w.path === "/decide")).toHaveLength(2);
});

test("finding 2: a card whose run, review or idea changed since it was made is refused without a board call", async () => {
  const { store, board, chief, say, req } = setup();
  board.setRun(P, "r-plan", { stage: "plan", awaiting: "approvals.plan", updated: "v1" }, { request: "p" });
  board.setRun(P, "r-done", { stage: "done", updated: "d1" }, { request: "d", review: "review v1", findings: [{ n: 1, text: "x", done: false }] });
  board.state.cards.push({ kind: "idea", status: "idea", text: "invoice export", state: P, awaiting: null, column: 0 });
  await say(chief.id, model(["propose_decision", { project: "kaizen", run: "r-plan", approve: true, answers: ["CSV"] }],
    ["propose_fix", { project: "kaizen", run: "r-done", findings: [1] }], ["propose_start_run", { project: "kaizen", idea: "invoice export" }]));
  const [dec, fix, start] = cards(store, chief.id);
  // The plan was revised and came back to the same approval as v2.
  board.setRun(P, "r-plan", { stage: "plan", awaiting: "approvals.plan", updated: "v2" });
  // A newer review renumbered the findings.
  board.setRun(P, "r-done", { stage: "done", updated: "d2" }, { review: "review v2" });
  // The idea was started from the board itself.
  board.state.cards.find((c) => c.kind === "idea")!.status = "starting";
  for (const [a, why] of [[dec, "changed since"], [fix, "review of r-done changed"], [start, "already started"]] as const) {
    const res = await req(`/actions/${a!.id}`, { op: "approve" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain(why);
    expect(store.action(a!.id)!.status).toBe("failed");
  }
  expect(board.writes).toEqual([]);
  // Proposing a run for an idea already started is refused up front.
  await say(chief.id, model(["propose_start_run", { project: "kaizen", idea: "invoice export" }]));
  expect(cards(store, chief.id).filter((a) => a.kind === "start_run")).toHaveLength(1);
});
