import { test, expect } from "bun:test";
import { readFileSync, rmSync, mkdtempSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore } from "../src/db";
import { configFromEnv, chat, type ModelConfig } from "../src/model";
import { runTurn, systemPrompt } from "../src/agent";
import { createApp } from "../src/server";
import { ROLES, PALETTE } from "../src/roles";

const KEY = "sk-test-SECRET-123";
const anthropicCfg: ModelConfig = { provider: "anthropic", model: "m", key: KEY, baseUrl: "https://api.anthropic.com/v1" };
const openaiCfg: ModelConfig = { provider: "openai", model: "m", key: KEY, baseUrl: "https://api.openai.com/v1" };

// A fake provider: returns the queued replies in order and records every request.
function fake(replies: unknown[]) {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  const f = async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    const r = replies.shift();
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r), { status: 200 });
  };
  return { f, calls };
}
const anthTool = (name: string, input: unknown) => ({ content: [{ type: "tool_use", id: "tu_1", name, input }] });
const anthText = (text: string) => ({ content: [{ type: "text", text }] });
const oaiTool = (name: string, input: unknown) => ({ choices: [{ message: { content: null, tool_calls: [{ id: "call_1", type: "function", function: { name, arguments: JSON.stringify(input) } }] } }] });
const oaiText = (text: string) => ({ choices: [{ message: { content: text } }] });

const DRAFT = { channel: "email", to: "dana@acme.test", subject: "Renewal", body: "Hi Dana, ..." };

test("config: picks provider, base URL and key from env; refuses a missing key", () => {
  const r = configFromEnv({ PROVIDER: "requesty", MODEL: "openai/x", REQUESTY_API_KEY: "rq", OPENAI_API_KEY: "oa" });
  expect(r).toEqual({ provider: "requesty", model: "openai/x", key: "rq", baseUrl: "https://router.requesty.ai/v1" });
  expect(configFromEnv({ ANTHROPIC_API_KEY: "a" }).model).toBe("claude-sonnet-5-5");
  expect(() => configFromEnv({ PROVIDER: "openai", MODEL: "x" })).toThrow("OPENAI_API_KEY is not set");
  expect(() => configFromEnv({ PROVIDER: "openai", OPENAI_API_KEY: "k" })).toThrow("MODEL is not set");
  expect(() => configFromEnv({ PROVIDER: "grok", OPENAI_API_KEY: "k" })).toThrow("PROVIDER must be");
});

test("G-11 anthropic adapter: tool-call round trip", async () => {
  const { f, calls } = fake([anthTool("remember", { fact: "x" })]);
  const r = await chat(anthropicCfg, "sys", [{ role: "user", text: "hi" }], [{ name: "remember", description: "d", schema: {} }], f);
  expect(r.toolCalls).toEqual([{ id: "tu_1", name: "remember", input: { fact: "x" } }]);
  expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
  expect(calls[0].headers["x-api-key"]).toBe(KEY);
  expect(calls[0].body.system).toBe("sys");
  expect(calls[0].body.tools[0].input_schema).toEqual({});
  // tool results go back as tool_result blocks
  const { f: f2, calls: c2 } = fake([anthText("ok")]);
  await chat(anthropicCfg, "s", [{ role: "user", text: "hi" }, { role: "assistant", text: "", toolCalls: r.toolCalls }, { role: "tool", results: [{ id: "tu_1", content: "done" }] }], [], f2);
  expect(c2[0].body.messages[1].content[0]).toEqual({ type: "tool_use", id: "tu_1", name: "remember", input: { fact: "x" } });
  expect(c2[0].body.messages[2].content[0]).toEqual({ type: "tool_result", tool_use_id: "tu_1", content: "done" });
});

test("G-11 openai-compatible adapter: tool-call round trip; requesty hits the router with its key", async () => {
  const { f, calls } = fake([oaiTool("remember", { fact: "x" })]);
  const r = await chat(openaiCfg, "sys", [{ role: "user", text: "hi" }], [{ name: "remember", description: "d", schema: {} }], f);
  expect(r.toolCalls).toEqual([{ id: "call_1", name: "remember", input: { fact: "x" } }]);
  expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
  expect(calls[0].body.messages[0]).toEqual({ role: "system", content: "sys" });
  const { f: f2, calls: c2 } = fake([oaiText("ok")]);
  await chat(openaiCfg, "s", [{ role: "user", text: "hi" }, { role: "assistant", text: "", toolCalls: r.toolCalls }, { role: "tool", results: [{ id: "call_1", content: "done" }] }], [], f2);
  expect(c2[0].body.messages[2].tool_calls[0].function).toEqual({ name: "remember", arguments: '{"fact":"x"}' });
  expect(c2[0].body.messages[3]).toEqual({ role: "tool", tool_call_id: "call_1", content: "done" });

  const rq = configFromEnv({ PROVIDER: "requesty", MODEL: "openai/gpt", REQUESTY_API_KEY: "rq-key", OPENAI_API_KEY: "oa-key" });
  const { f: f3, calls: c3 } = fake([oaiText("hi")]);
  expect((await chat(rq, "s", [{ role: "user", text: "hi" }], [], f3)).text).toBe("hi");
  expect(c3[0].url).toBe("https://router.requesty.ai/v1/chat/completions");
  expect(c3[0].headers.authorization).toBe("Bearer rq-key");
});

for (const [name, cfg, tool, text] of [["anthropic", anthropicCfg, anthTool, anthText], ["openai", openaiCfg, oaiTool, oaiText]] as const) {
  test(`G-01 ${name}: a model-issued draft_message stays pending and nothing but the model is called`, async () => {
    const s = openStore(":memory:");
    const bot = s.createBot("sales");
    const { f, calls } = fake([tool("draft_message", DRAFT), text("Queued one draft for review.")]);
    const seen: string[] = [];
    await runTurn({ store: s, cfg, fetch: f }, bot.id, "email dana about renewal", (ev, d: any) => { if (ev !== "status") seen.push(ev === "message" ? d.kind : `card:${d.kind}`); });
    const drafts = s.drafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ status: "pending", recipient: "dana@acme.test", body: "Hi Dana, ..." });
    expect(seen).toEqual(["user", "card:draft", "bot"]);
    expect(s.actions({ botId: bot.id })).toMatchObject([{ kind: "draft", status: "needed", summary: "email to dana@acme.test" }]);
    expect(calls.every((c) => c.url.startsWith(cfg.baseUrl))).toBe(true);
  });
}

test("G-01 no send code exists: the only network call in src is the model API", () => {
  const src = readdirSync(join(import.meta.dir, "../src")).map((f) => readFileSync(join(import.meta.dir, "../src", f), "utf8")).join("\n");
  expect(src).not.toMatch(/smtp|nodemailer|webhook|sendmail/i);
  // No direct network call anywhere: model.ts (the provider) and board.ts (the loopback board) call only their injected f().
  expect(src).not.toMatch(/\bfetch\s*\(|WebSocket|Bun\.connect|node:net|node:http/);
});

test("G-04 memories persist across a fresh connection and reach the next system prompt", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kbot-"));
  const path = join(dir, "bot.db");
  try {
    let s = openStore(path);
    const bot = s.createBot("cs");
    const { f } = fake([anthTool("remember", { fact: "Acme only signs annual contracts" }), anthText("Noted.")]);
    await runTurn({ store: s, cfg: anthropicCfg, fetch: f }, bot.id, "fyi acme only signs annual", () => {});
    s.close();
    s = openStore(path);
    expect(s.memories(bot.id).map((m) => m.text)).toEqual(["Acme only signs annual contracts"]);
    const { f: f2, calls } = fake([anthText("Annual only.")]);
    await runTurn({ store: s, cfg: anthropicCfg, fetch: f2 }, bot.id, "what does acme sign?", () => {});
    expect(calls[0].body.system).toContain("Acme only signs annual contracts");
    expect(systemPrompt(s, bot.id)).toContain("Acme only signs annual contracts");
    s.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("remember with for teaches a teammate, and an unknown name saves nothing", async () => {
  const s = openStore(":memory:");
  const sales = s.createBot("sales"), am = s.createBot("am");
  expect(systemPrompt(s, sales.id)).toContain("Your teammates: Account Manager");
  expect(systemPrompt(s, sales.id)).toContain("the user sets a standing rule for you");
  expect(systemPrompt(s, sales.id)).toContain("A question gets an answer, not board work");
  const { f } = fake([anthTool("remember", { fact: "Acme only signs annual", for: "account manager" }), anthText("Noted.")]);
  await runTurn({ store: s, cfg: anthropicCfg, fetch: f }, sales.id, "acme signs annual only", () => {});
  expect(s.memories(am.id).map((m) => m.text)).toEqual(["Acme only signs annual (from Sales Outbound)"]);
  expect(s.memories(sales.id)).toEqual([]);
  expect(systemPrompt(s, am.id)).toContain("Acme only signs annual (from Sales Outbound)");
  const act = s.actions({ botId: sales.id }).find((a) => a.kind === "memory")!;
  expect(JSON.parse(act.body)).toEqual({ for: am.id, fact: "Acme only signs annual" });

  const { f: f2, calls } = fake([anthTool("remember", { fact: "x", for: "Nobody" }), anthText("ok")]);
  await runTurn({ store: s, cfg: anthropicCfg, fetch: f2 }, sales.id, "tell nobody", () => {});
  expect(JSON.stringify(calls[1].body.messages)).toContain('no teammate named \\"Nobody\\", nothing saved. Teammates: Account Manager');
  expect([...s.memories(am.id), ...s.memories(sales.id)]).toHaveLength(1);
  s.close();
});

test("ask_teammate: one hop, nothing in the teammate's thread, busy teammate refused", async () => {
  const s = openStore(":memory:");
  const chief = s.createBot("chief"), sales = s.createBot("sales");
  const shown: string[] = [];
  const emitTo = (id: number) => (ev: string, d: any) => { if (ev === "message") shown.push(`${id}:${d.kind}`); };
  // Chief asks Sales; Sales tries to ask back (refused: depth), then answers; Chief wraps up.
  const { f, calls } = fake([
    anthTool("ask_teammate", { to: "sales outbound", message: "Is Acme warm?" }),
    anthTool("ask_teammate", { to: "Chief", message: "loop?" }),
    anthText("Acme is warm."),
    anthText("Sales says Acme is warm."),
  ]);
  const busy = new Set<number>();
  await runTurn({ store: s, cfg: anthropicCfg, fetch: f, busy, emitTo }, chief.id, "how is acme?", () => {});
  expect(JSON.stringify(calls[1].body.messages)).toContain("Your teammate Chief asks you");
  expect(JSON.stringify(calls[2].body.messages)).toContain("you cannot ask another one now");
  expect(JSON.stringify(calls[3].body.messages)).toContain("Reply from Sales Outbound:\\nAcme is warm.");
  // The asker relays the answer; the teammate's thread stays as it was.
  expect(s.messages(sales.id)).toEqual([]);
  expect(shown).toEqual([]);
  expect(s.messages(chief.id).map((m) => m.text)).toEqual(["how is acme?", "Teammate → asked Sales Outbound", "Sales says Acme is warm."]);
  expect(busy.size).toBe(0);

  busy.add(sales.id);
  const { f: f2, calls: c2 } = fake([anthTool("ask_teammate", { to: "Sales Outbound", message: "hi" }), anthText("ok")]);
  await runTurn({ store: s, cfg: anthropicCfg, fetch: f2, busy, emitTo }, chief.id, "ask sales", () => {});
  expect(c2).toHaveLength(2);
  expect(JSON.stringify(c2[1].body.messages)).toContain("Sales Outbound is busy");
  expect(s.messages(sales.id)).toEqual([]);
  s.close();
});

test("G-05 tool loop is capped and model errors become a visible message", async () => {
  const s = openStore(":memory:");
  const bot = s.createBot("chief");
  const { f, calls } = fake(Array.from({ length: 20 }, () => anthTool("remember", { fact: "loop" })));
  await runTurn({ store: s, cfg: anthropicCfg, fetch: f }, bot.id, "go", () => {});
  expect(calls).toHaveLength(8);
  expect(s.messages(bot.id).at(-1)!.text).toContain("stopped after 8 steps");

  const { f: f2 } = fake([new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401 })]);
  await runTurn({ store: s, cfg: anthropicCfg, fetch: f2 }, bot.id, "hi", () => {});
  const last = s.messages(bot.id).at(-1)!;
  expect(last.kind).toBe("bot");
  expect(last.text).toBe("I couldn't reach the model: anthropic returned 401: invalid x-api-key");
  expect(last.text).not.toContain(KEY);

  const boom = async () => { throw new Error("network down"); };
  await runTurn({ store: s, cfg: anthropicCfg, fetch: boom }, bot.id, "hi", () => {});
  expect(s.messages(bot.id).at(-1)!.text).toContain("network down");
});

test("G-02/G-14 server: key never in any response; host and origin checked", async () => {
  const s = openStore(":memory:");
  const { f } = fake([anthTool("draft_message", DRAFT), anthText(`done`)]);
  const down = async () => { throw new Error("ECONNREFUSED"); };
  const app = createApp({ store: s, env: { PROVIDER: "anthropic", MODEL: "m", ANTHROPIC_API_KEY: KEY, OPENAI_API_KEY: KEY + "o", REQUESTY_API_KEY: KEY + "r" }, fetch: f as any, boardFetch: down, watch: false });
  const req = (path: string, init: RequestInit = {}, host = "127.0.0.1:7430") =>
    app.handle(new Request(`http://${host}${path}`, { ...init, headers: { host, "content-type": "application/json", ...(init.headers as object) } }));
  const bodies: string[] = [];
  const read = async (r: Response) => { const t = await r.text(); bodies.push(t); return t; };

  expect((await req("/info", {}, "evil.test")).status).toBe(403);
  expect((await req("/bots", { method: "POST", body: '{"role":"sales"}', headers: { origin: "https://evil.test" } })).status).toBe(403);

  const bot = JSON.parse(await read(await req("/bots", { method: "POST", body: '{"role":"sales"}' })));
  const sse = await read(await req(`/bots/${bot.id}/messages`, { method: "POST", body: '{"text":"draft it"}' }));
  expect(sse).toContain("event: message");
  expect(sse).toContain("event: action");
  expect(sse).toContain("event: done");
  const cards = JSON.parse(await read(await req("/actions?status=needed")));
  expect(cards).toHaveLength(1);
  const done = JSON.parse(await read(await req(`/actions/${cards[0].id}`, { method: "POST", body: '{"op":"approve"}' })));
  expect(done.status).toBe("done");
  expect(s.drafts()[0].status).toBe("approved");
  expect((await req(`/actions/${cards[0].id}`, { method: "POST", body: '{"op":"approve"}' })).status).toBe(409);
  const md = await read(await req("/drafts/export"));
  expect(md).toContain("Hi Dana, ...");
  for (const p of ["/info", "/bots", `/bots/${bot.id}/messages`, "/settings", "/board", "/actions"]) await read(await req(p));
  for (const provider of ["anthropic", "openai", "requesty"]) await read(await req(`/settings/models?provider=${provider}`));
  for (const b of bodies) expect(b).not.toContain(KEY);
  expect(JSON.parse(bodies.find((b) => b.includes('"keys"'))!).keys).toEqual({ anthropic: true, openai: true, requesty: true });
});

test("G-02 secrets stay out of git and the DB", () => {
  // Ask git itself: the key and the database are ignored wherever this folder sits.
  const ignored = (p: string) => Bun.spawnSync(["git", "check-ignore", "-q", p], { cwd: join(import.meta.dir, "..") }).exitCode === 0;
  expect(ignored(".env")).toBe(true);
  expect(ignored("data/bot.db")).toBe(true);
  expect(readFileSync(join(import.meta.dir, "../src/server.ts"), "utf8")).toContain('hostname: "127.0.0.1"');
  const schema = /const SCHEMA = `([^`]*)`/.exec(readFileSync(join(import.meta.dir, "../src/db.ts"), "utf8"))![1];
  expect(schema).not.toMatch(/api.?key|secret|token/i);
});

test("G-03 page never feeds data to innerHTML", () => {
  const page = readFileSync(join(import.meta.dir, "../web/index.html"), "utf8");
  expect(page).not.toMatch(/\.innerHTML\s*=|outerHTML|document\.write/);
  // the one insertAdjacentHTML takes a constant icon string
  expect(page.match(/insertAdjacentHTML\([^)]*\)/g)).toEqual(['insertAdjacentHTML("afterbegin", ICONS[name])']);
});

// Agent replies render Markdown through mdTree, a pure function in the page: load it on its own.
const mdTree: (s: string) => any[] = (() => {
  const page = readFileSync(join(import.meta.dir, "../web/index.html"), "utf8");
  const src = /\/\/ ---- markdown[\s\S]*?(?=const mdNodes)/.exec(page)![0];
  return new Function(`${src}; return mdTree;`)();
})();
const tags = (n: any): string[] => (typeof n === "string" ? [] : [n[0], ...n.slice(2).flatMap(tags)]);
const texts = (n: any): string[] => (typeof n === "string" ? [n] : n.slice(2).flatMap(texts));

test("markdown: each construct becomes its node", () => {
  const t = mdTree("# Title\n\n**Bold** and *it* and _it_ and `c`\n\n- a\n- b\n  - nested\n\n3. x\n4. y\n\n```js\nlet a = 1;\n```\n\n[docs](https://x.dev) ---\n\n---");
  expect(t.map((n) => n[0])).toEqual(["h4", "p", "ul", "ol", "pre", "p", "hr"]);
  expect(tags(t[1])).toEqual(["p", "strong", "em", "em", "code"]);
  expect(tags(t[2])).toEqual(["ul", "li", "li", "ul", "li"]);
  expect(t[3][1]).toEqual({ start: "3" });
  expect(texts(t[4])).toEqual(["let a = 1;"]);
  expect(t[5][2]).toEqual(["a", { href: "https://x.dev", target: "_blank", rel: "noopener noreferrer" }, "docs"]);
  expect(tags(mdTree("line one\nline two")[0])).toEqual(["p", "br"]);
});

test("markdown: unsafe links and HTML stay text; stray and unclosed syntax is kept", () => {
  for (const s of ["[x](javascript:alert(1))", "<b>hi</b><img src=x onerror=alert(1)>", "[x](data:text/html,hi)"]) {
    const t = mdTree(s);
    expect(t.flatMap(tags)).toEqual(["p"]);
    expect(texts(t[0]).join("")).toBe(s);
  }
  expect(texts(mdTree("5 * 3 * 2 and snake_case_name")[0]).join("")).toBe("5 * 3 * 2 and snake_case_name");
  expect(texts(mdTree("**never closed")[0]).join("")).toBe("**never closed");
  expect(mdTree("```\nopen fence\nto the end")).toEqual([["pre", {}, ["code", {}, "open fence\nto the end"]]]);
});

test("markdown: no words lost or reordered in a stored-reply shape", () => {
  const s = "**Talent Scout introduced themselves:**\n\nHi! I'm **Talent Scout** — your teammate.\n\n**What I do**\n- Turn a need into an idea (plan → approval)\n- Draft `job` posts, one *per* role\n\n1. First\n2. Second\nstill second";
  const want = s.replace(/[*`]|^\s*(-|\d+\.)\s/gm, " ").split(/\s+/).filter(Boolean);
  const got = mdTree(s).flatMap(texts).join(" ").split(/\s+/).filter(Boolean);
  expect(got).toEqual(want);
});

// G-12: WCAG contrast of every text/background pair the page uses, both themes.
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("G-12 text contrast >= 4.5:1 in light and dark", () => {
  const page = readFileSync(join(import.meta.dir, "../web/index.html"), "utf8");
  const theme = (re: RegExp) => Object.fromEntries([...re.exec(page)![1].matchAll(/--([\w-]+):(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
  const light = theme(/^:root\{(--bg:[^}]*)\}/m);
  const dark = { ...light, ...theme(/^:root\[data-theme=dark\]\{([^}]*)\}/m) };
  const pairs = [["ink", "bg"], ["ink", "bg-2"], ["dim", "bg"], ["dim", "bg-2"], ["on-accent", "accent"],
    ["ok", "bg-2"], ["warn", "bg-2"], ["danger", "bg-2"], ["danger", "bg"]];
  for (const [name, t] of [["light", light], ["dark", dark]] as const)
    for (const [fg, bg] of pairs) {
      const r = ratio(t[fg] ?? "#ffffff", t[bg]);
      if (r < 4.5) throw new Error(`${name} --${fg} on --${bg} is ${r.toFixed(2)}:1`);
    }
  for (const c of [...ROLES.map((r) => r.color), ...PALETTE]) expect(ratio("#ffffff", c)).toBeGreaterThanOrEqual(4.5);
  // The selected bot row is accent mixed into bg-2; its ink and dim text must read on it too.
  const mix = (a: string, b: string, pct: number) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * pct + parseInt(b.slice(i, i + 2), 16) * (1 - pct)).toString(16).padStart(2, "0")).join("");
  const pct = Number(/\.ag\.on\{background:color-mix\(in srgb,var\(--accent\) (\d+)%,var\(--bg-2\)\)\}/.exec(page)![1]) / 100;
  for (const [name, t] of [["light", light], ["dark", dark]] as const) {
    // The selected agent row is accent mixed into bg-2.
    for (const fg of ["ink", "dim"]) {
      const r = ratio(t[fg], mix(t.accent, t["bg-2"], pct));
      if (r < 4.5) throw new Error(`${name} --${fg} on the selected agent row is ${r.toFixed(2)}:1`);
    }
    // G-38: each status pill is its token on that token mixed into bg-2.
    const pills = [...page.matchAll(/\.pill\.(\w+)\{color:var\(--([\w-]+)\);background:color-mix\(in srgb,var\(--([\w-]+)\) (\d+)%,var\(--bg-2\)\)\}/g)];
    expect(pills.map((m) => m[1])).toEqual(["needed", "working", "done", "declined", "failed"]);
    for (const [, cls, fg, bg, p] of pills) {
      const r = ratio(t[fg!]!, mix(t[bg!]!, t["bg-2"], Number(p) / 100));
      if (r < 4.5) throw new Error(`${name} pill ${cls} is ${r.toFixed(2)}:1`);
    }
    for (const fg of ["accent-ink"]) if (ratio(t[fg], t["bg-2"]) < 4.5) throw new Error(`${name} --${fg} on --bg-2`);
  }
});

const PAGE = () => readFileSync(join(import.meta.dir, "../web/index.html"), "utf8");
test("G-17/G-18: nothing is fetched from another site at load; the CDN is only in the worker built on the first mic press; audio is only posted to that worker", () => {
  const page = PAGE();
  expect(page).not.toMatch(/<(script|link|img)[^>]+(src|href)="https?:/);
  const urls = [...page.matchAll(/https?:\/\/[^\s"'`<>)]+/g)].map((m) => m[0]);
  expect(urls).toEqual(["https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0"]);
  expect(page.indexOf("new Worker(")).toBeGreaterThan(page.indexOf("function loadAsr()"));
  // every fetch() and EventSource in the page is same-origin
  for (const m of page.matchAll(/(?:fetch|EventSource)\(\s*([^,)]+)/g)) expect(m[1]!.trim()).toMatch(/^(`\/|"\/|path$)/);
  expect(page).not.toMatch(/XMLHttpRequest|sendBeacon|WebSocket/);
  expect([...page.matchAll(/postMessage\(\{\s*type:\s*"run"[^)]*\)/g)].length).toBe(1);
});

test("G-19/G-20: no Send button; Enter sends and Shift+Enter makes a new line; the model is not on the main screen", () => {
  const page = PAGE();
  expect(page).not.toMatch(/>\s*Send\s*</);
  expect(page).toContain('e.key === "Enter" && !e.shiftKey');
  const body = page.slice(page.indexOf("<body>"), page.indexOf("<script>"));
  expect(body).not.toMatch(/model/i);
});

test("attachments: the + reads text files in the page and the server takes a message carrying them", async () => {
  const page = PAGE();
  expect(page).toContain('id="attach"');
  expect(page).toContain("await file.text()"); // read locally; nothing is uploaded anywhere else
  const s = openStore(":memory:");
  const { f } = fake([anthText("read it")]);
  const app = createApp({ store: s, env: { PROVIDER: "anthropic", MODEL: "m", ANTHROPIC_API_KEY: KEY }, fetch: f as any, boardFetch: async () => { throw new Error("down"); }, watch: false });
  const bot = s.createBot("custom");
  expect(bot).toMatchObject({ name: "New agent", description: "A newly created agent." });
  const big = "summarise this\n\n--- Attached: notes.md ---\n" + "x".repeat(250_000);
  const res = await app.handle(new Request(`http://127.0.0.1:7430/bots/${bot.id}/messages`, { method: "POST", headers: { host: "127.0.0.1", "content-type": "application/json" }, body: JSON.stringify({ text: big }) }));
  await res.text();
  expect(s.messages(bot.id)[0]!.text.length).toBe(big.length);
});

test("Needs you: lists only needed cards and never acts on them", () => {
  const page = PAGE();
  const block = page.slice(page.indexOf("async function openNeeds()"), page.indexOf('$("needsBtn").onclick'));
  expect(block).toContain('api("/actions?status=needed")');
  expect(block).not.toMatch(/method:|act\(|\/messages/);
});
