// The footer's usage and phone readers, and the run workspace's /shell route on a real
// board: guarded like /pty, an agent only from the known list, a pwd in the project.
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexUsage, claudeUsage, phonePeers } from "./usage.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "kaizen-usage-")));
const rl = (p: number, s: number) => JSON.stringify({ type: "event_msg", payload: { type: "token_count", rate_limits: { primary: { used_percent: p, window_minutes: 300, resets_at: 1800000000 }, secondary: { used_percent: s, window_minutes: 10080, resets_at: 1800500000 } } } });

test("codexUsage: the newest rollout's last rate_limits, windows by length; nothing when absent", () => {
  const h = join(root, "codex");
  expect(codexUsage(h)).toBeNull();
  const d = join(h, ".codex", "sessions", "2026", "10", "28");
  mkdirSync(d, { recursive: true });
  const old = join(d, "rollout-a.jsonl"), nu = join(d, "rollout-b.jsonl");
  writeFileSync(old, rl(99, 99) + "\n");
  writeFileSync(nu, rl(10, 20) + "\n" + rl(42, 7) + "\n{\"torn");
  utimesSync(old, new Date(1000), new Date(1000));
  expect(codexUsage(h)).toEqual({ agent: "codex", five: { pct: 42, resetsAt: 1800000000000 }, week: { pct: 7, resetsAt: 1800500000000 } });
  // A session just started, no rate_limits yet: the one before it still counts.
  writeFileSync(nu, '{"type":"session_meta"}\n');
  expect(codexUsage(h)?.five?.pct).toBe(99);
  writeFileSync(old, '{"type":"session_meta"}\n');
  expect(codexUsage(h)).toBeNull();
});

test("claudeUsage: maps the windows; a failure is an error that never carries the token", async () => {
  const h = join(root, "claude");
  expect(await claudeUsage(h, (() => { throw new Error("no call"); }) as any)).toBeNull();
  mkdirSync(join(h, ".claude"), { recursive: true });
  writeFileSync(join(h, ".claude", ".credentials.json"), JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-oat-SECRET" } }));
  let sent: any;
  const ok = (async (_u: string, init: any) => { sent = init; return new Response(JSON.stringify({ five_hour: { utilization: 62, resets_at: "2026-10-28T12:00:00Z" }, seven_day: { utilization: 34.4, resets_at: null } })); }) as any;
  expect(await claudeUsage(h, ok)).toEqual({ agent: "claude", five: { pct: 62, resetsAt: Date.parse("2026-10-28T12:00:00Z") }, week: { pct: 34, resetsAt: null } });
  expect(sent.headers["anthropic-beta"]).toBe("oauth-2025-04-20");
  const fail = (async () => { throw new Error("refused Bearer sk-ant-oat-SECRET"); }) as any;
  const e = await claudeUsage(h, fail);
  expect(e).toHaveProperty("error");
  expect(JSON.stringify(e)).not.toContain("SECRET");
  expect(await claudeUsage(h, (async () => new Response("", { status: 401 })) as any)).toEqual({ agent: "claude", error: "HTTP 401" });
});

test("phonePeers: online, offline, no phone, not running", () => {
  const st = (peers: object, state = "Running") => JSON.stringify({ BackendState: state, Peer: peers });
  expect(phonePeers(st({ a: { OS: "iOS", HostName: "iphone", Online: true }, b: { OS: "linux", HostName: "pc", DNSName: "pc.tail1.ts.net.", Online: true } }))).toEqual({ running: true, phones: [{ name: "iphone", online: true }], computers: [{ name: "pc", dns: "pc.tail1.ts.net", os: "linux", online: true }], self: null });
  const me = JSON.stringify({ BackendState: "Running", Self: { OS: "linux", HostName: "me", DNSName: "me.ts.net." }, Peer: { m: { OS: "macOS", HostName: "mac", Online: false } } });
  expect(phonePeers(me).self).toEqual({ name: "me", dns: "me.ts.net", os: "linux", online: true });
  expect(phonePeers(me).computers).toEqual([{ name: "mac", dns: "", os: "macOS", online: false }]);
  expect(phonePeers(st({ a: { OS: "android", HostName: "pixel", Online: false } })).phones).toEqual([{ name: "pixel", online: false }]);
  expect(phonePeers(st({ b: { OS: "windows", Online: true } })).phones).toEqual([]);
  expect(phonePeers(st({}, "Stopped")).running).toBe(false);
  expect(phonePeers("").running).toBe(false);
});

test.skipIf(process.platform === "win32")("/shell: foreign origin, unknown project and unknown agent refused; a shell opens in the project; /usage and /phone answer", async () => {
  const homeDir = join(root, "home"), proj = join(homeDir, "a"), st = join(proj, ".kaizen"), bin = join(root, "bin");
  for (const d of [st, join(homeDir, ".kaizen"), bin]) mkdirSync(d, { recursive: true });
  writeFileSync(join(homeDir, ".kaizen", "projects"), proj + "\n");
  writeFileSync(join(st, "inbox.md"), "# Inbox\n");
  // A shell that says where it is, then echoes.
  const sh = join(bin, "fakesh");
  writeFileSync(sh, '#!/bin/sh\necho "pwd:$(pwd)"\nwhile read x; do echo "got:$x"; done\n', { mode: 0o755 });
  // Some agent must exist for the board to start; not claude or codex, so /usage has none.
  writeFileSync(join(bin, "gemini"), "#!/bin/sh\n", { mode: 0o755 });
  const port = 20000 + Math.floor(Math.random() * 20000);
  const repo = join(import.meta.dir, "..");
  // PATH without tailscale, claude or codex: /phone and /usage must still answer.
  const proc = Bun.spawn([process.execPath, join(repo, "cli", "install.ts"), "web", "--port", String(port), "--no-open", "--foreground"], {
    cwd: proj, stdout: "ignore", stderr: "ignore",
    env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir, KAIZEN_HOME: repo, PATH: bin, SHELL: sh, DISPLAY: "", WAYLAND_DISPLAY: "", TERMINAL: "", TMUX: "" },
  });
  try {
    const at = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { await fetch(at + "/state"); break; } catch { if (i > 100) throw new Error("board did not start"); await Bun.sleep(50); } }
    const post = (body: object, origin?: string, type = "application/json") => fetch(at + "/shell", { method: "POST", headers: { "content-type": type, ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
    expect((await post({ dir: st }, "https://evil.example")).status).toBe(403);
    // Another local server's page: same hostname, other port.
    expect((await post({ dir: st }, `http://127.0.0.1:${port + 1}`)).status).toBe(403);
    expect((await post({ dir: st }, "http://localhost:3000")).status).toBe(403);
    // A simple (no-preflight) POST body type.
    expect((await post({ dir: st }, at, "text/plain")).status).toBe(415);
    expect((await post({ dir: join(root, "elsewhere", ".kaizen") })).status).toBe(404);
    expect((await post({ dir: join(homeDir, ".kaizen") })).status).toBe(404);
    expect((await post({ dir: st, agent: "rm -rf /" })).status).toBe(400);
    expect((await post({ dir: st, agent: "codex" })).status).toBe(400); // known, not installed

    // Resume: the session id comes only from the run's own state.json; a page-sent one is ignored.
    const resume = (run: string, extra = {}) => post({ dir: st, run, resume: true, ...extra }, at);
    mkdirSync(join(st, "runs", "r1"), { recursive: true });
    writeFileSync(join(st, "runs", "r1", "state.json"), JSON.stringify({ id: "r1", agent: "claude" }));
    expect((await resume(`run:${st}:r1`, { session: "aaaaaaaa-page-chosen" })).status).toBe(404); // no session recorded
    expect((await resume(`run:${st}:..`)).status).toBe(404);
    expect((await resume(`run:${st}:../r1`)).status).toBe(404);
    expect((await resume(`run:/elsewhere/.kaizen:r1`)).status).toBe(404); // a run of another dir
    writeFileSync(join(st, "runs", "r1", "state.json"), JSON.stringify({ id: "r1", agent: "codex", session: "abcdef12-3456" }));
    expect((await resume(`run:${st}:r1`)).status).toBe(404); // not a Claude run
    writeFileSync(join(st, "runs", "r1", "state.json"), JSON.stringify({ id: "r1", agent: "claude", session: "abcdef12-3456" }));
    expect((await resume(`run:${st}:r1`)).status).toBe(400); // claude is not on this test's PATH

    // /open-url: the same guards, and only an http(s) address. No success case: it opens a real window.
    const open = (body: object, origin?: string, type = "application/json") => fetch(at + "/open-url", { method: "POST", headers: { "content-type": type, ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
    expect((await open({ url: "http://localhost:3000/" }, "http://localhost:3000")).status).toBe(403);
    expect((await open({ url: "http://localhost:3000/" }, at, "text/plain")).status).toBe(415);
    expect((await open({ url: "file:///etc/passwd" }, at)).status).toBe(400);
    expect((await open({ url: "javascript:alert(1)" }, at)).status).toBe(400);
    // /frameable: board pages only, http(s) only; the answer is a boolean (or null when unreachable).
    expect((await fetch(`${at}/frameable?url=${encodeURIComponent(at + "/")}`, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await fetch(`${at}/frameable?url=${encodeURIComponent("file:///etc/passwd")}`)).status).toBe(400);
    expect(await (await fetch(`${at}/frameable?url=${encodeURIComponent(at + "/")}`)).json()).toEqual({ frameable: true });

    const r = await post({ dir: st }, at);
    expect(r.status).toBe(200);
    const sh1 = await r.json() as any;
    expect(sh1).toMatchObject({ dir: st, title: "shell", agent: "", run: "" });
    expect(sh1.key).toMatch(/^sh-[\w-]+$/);
    const url = `${at}/pty?key=${sh1.key}`, up = { upgrade: "websocket", connection: "Upgrade", "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" };
    expect((await fetch(url, { headers: { ...up, origin: "https://evil.example" } })).status).toBe(403);
    let seen = "";
    const ws = new WebSocket(url.replace("http", "ws"), { headers: { origin: at } } as any);
    ws.onmessage = (e) => { seen += String(e.data); };
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    for (let i = 0; i < 100 && !seen.includes("pwd:"); i++) await Bun.sleep(30);
    expect(seen).toContain(`pwd:${proj}`);
    ws.close();
    expect(((await (await fetch(`${at}/shells?dir=${encodeURIComponent(st)}`)).json()) as any[]).map((s) => s.key)).toEqual([sh1.key]);
    expect((await fetch(at + "/pty/exit", { method: "POST", body: JSON.stringify({ key: sh1.key }) })).status).toBe(200);
    for (let i = 0; i < 100; i++) { if (!((await (await fetch(`${at}/shells`)).json()) as any[]).length) break; await Bun.sleep(50); }
    expect(await (await fetch(`${at}/shells`)).json()).toEqual([]);

    // At most 8 live terminals per project.
    const keys: string[] = [];
    for (let i = 0; i < 8; i++) { const x = await post({ dir: st }, at); expect(x.status).toBe(200); keys.push(((await x.json()) as any).key); }
    expect((await post({ dir: st }, at)).status).toBe(429);
    for (const k of keys) await fetch(at + "/pty/exit", { method: "POST", body: JSON.stringify({ key: k }) });

    const u = await fetch(at + "/usage");
    expect(u.status).toBe(200);
    expect(await u.json()).toEqual([]);
    const p = await fetch(at + "/phone");
    expect(p.status).toBe(200);
    expect(await p.json()).toEqual({ tailscale: false });
  } finally { proc.kill(); }
}, 30_000);
