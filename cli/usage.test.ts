// The footer's usage and phone readers, and the run workspace's /shell route on a real
// board: guarded like /pty, an agent only from the known list, a pwd in the project.
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, utimesSync, rmSync, readFileSync, symlinkSync, existsSync } from "node:fs";
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
  expect(await claudeUsage(h, (async () => new Response("", { status: 401 })) as any)).toEqual({ agent: "claude", error: "HTTP 401", expired: true });
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
  symlinkSync(Bun.which("git")!, join(bin, "git"));
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
    expect((await open({ url: "https://example.com/" }, at)).status).toBe(400); // loopback only
    expect((await open({ url: "http://localhost.evil.test/" }, at)).status).toBe(400);
    // /frameable: board pages only, http(s) only; the answer is a boolean (or null when unreachable).
    expect((await fetch(`${at}/frameable?url=${encodeURIComponent(at + "/")}`, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await fetch(`${at}/frameable?url=${encodeURIComponent("file:///etc/passwd")}`)).status).toBe(400);
    expect((await fetch(`${at}/frameable?url=${encodeURIComponent("http://example.com/")}`)).status).toBe(400);
    expect(await (await fetch(`${at}/frameable?url=${encodeURIComponent(at + "/")}`)).json()).toEqual({ frameable: true });
    // A loopback page that redirects elsewhere is unknown, and the target is never fetched.
    let hit = 0;
    const far = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => { hit++; return new Response("x"); } });
    const hop = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => Response.redirect(`http://127.0.0.1:${far.port}/`, 302) });
    expect(await (await fetch(`${at}/frameable?url=${encodeURIComponent(`http://127.0.0.1:${hop.port}/`)}`)).json()).toEqual({ frameable: null });
    expect(hit).toBe(0);
    far.stop(true); hop.stop(true);

    // A workspace folder only from the project's own list (no git on this PATH: the project folder alone).
    expect((await post({ dir: st, ws: root }, at)).status).toBe(400);
    expect((await post({ dir: st, ws: join(proj, "..", "a", "..") }, at)).status).toBe(400);
    expect((await post({ dir: st, ws: ["x"] }, at)).status).toBe(400);
    // /worktree: the same guards; a folder that is not a repository gets none.
    const wt = (body: object, origin?: string) => fetch(at + "/worktree", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
    expect((await wt({ dir: st, branch: "x" }, "http://localhost:3000")).status).toBe(403);
    expect((await wt({ dir: join(homeDir, ".kaizen"), branch: "x" })).status).toBe(404);
    expect((await wt({ dir: st, branch: "x" })).status).toBe(400);
    // The rail's + sheet: /add-project, /new-project and /clone start git or make folders, so /worktree's guards and validated input.
    const sheet = (route: string, body: object, origin?: string, type = "application/json") => fetch(at + route, { method: "POST", headers: { "content-type": type, ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
    const bodies: [string, object][] = [["/add-project", { path: join(homeDir, "z") }], ["/new-project", { name: "z" }], ["/clone", { url: "https://127.0.0.1:1/z.git" }]];
    for (const [route, b] of bodies) {
      expect((await sheet(route, b, "http://localhost:3000")).status).toBe(403);
      expect((await sheet(route, b, "https://evil.example")).status).toBe(403);
      expect((await sheet(route, b, at, "text/plain")).status).toBe(415);
      expect((await sheet(route, b, at, "application/x-www-form-urlencoded")).status).toBe(415);
    }
    expect(existsSync(join(homeDir, "z"))).toBe(false);
    // Bad paths: root, home, ~/.kaizen, .., kaizen's own folders, below an existing project.
    for (const path of ["/", homeDir, "~", "~/.kaizen/x", homeDir + "/../etc", "/tmp/a/../../etc", join(proj, "sub"), join(proj, ".kaizen", "wt", "x"), "", "x\0y"]) {
      expect((await sheet("/add-project", { path })).status, path).toBe(400);
      if (!path) continue; // no `to` means the default folder, for these two
      expect((await sheet("/new-project", { name: "n", to: path })).status, path).toBe(400);
      expect((await sheet("/clone", { url: "https://127.0.0.1:1/z.git", to: path })).status, path).toBe(400);
    }
    expect((await sheet("/add-project", { path: join(homeDir, "missing") })).status).toBe(400); // not a folder
    expect((await sheet("/add-project", { path: 5 })).status).toBe(400);
    expect((await sheet("/new-project", { name: "con" })).status).toBe(400);
    // Bad clone URLs: nothing runs, nothing is made.
    for (const url of ["--upload-pack=touch /tmp/kz-pwn", "ext::sh -c id", "file:///etc", "http://example.com/o/r.git", "/etc", "https://example.com/o/r with space", 7, undefined]) {
      expect((await sheet("/clone", { url, to: join(homeDir, "c1") })).status, String(url)).toBe(400);
    }
    expect(existsSync(join(homeDir, "c1")) || existsSync("/tmp/kz-pwn")).toBe(false);
    // Bad branch, base, project.
    expect((await wt({ dir: st, branch: "-x" })).status).toBe(400);
    expect((await wt({ dir: st, branch: "a..b" })).status).toBe(400);
    expect((await wt({ dir: st, branch: "x y", base: "main" })).status).toBe(400);
    expect((await wt({ dir: st, branch: "x", base: "-x" })).status).toBe(400);
    expect((await wt({ dir: join(root, "elsewhere", ".kaizen"), branch: "x", base: "main" })).status).toBe(404);
    expect((await fetch(`${at}/branches?dir=${encodeURIComponent(join(root, "elsewhere", ".kaizen"))}`)).status).toBe(404);
    expect((await fetch(`${at}/branches?dir=${encodeURIComponent(join(homeDir, ".kaizen"))}`)).status).toBe(404);
    expect(await (await fetch(`${at}/branches?dir=${encodeURIComponent(st)}`)).json()).toEqual({ current: "", def: "", branches: [] }); // not a repository
    // Happy paths in the scratch home: an existing folder registers once; a new project gets .kaizen and git.
    const reg = () => readFileSync(join(homeDir, ".kaizen", "projects"), "utf8").split("\n").filter(Boolean);
    mkdirSync(join(homeDir, "b"));
    const add1 = await (await sheet("/add-project", { path: join(homeDir, "b") })).json() as any;
    expect(add1).toMatchObject({ ok: true, dir: join(homeDir, "b", ".kaizen"), already: false });
    expect(existsSync(join(homeDir, "b", ".kaizen"))).toBe(true);
    expect(reg().filter((l) => l === join(homeDir, "b"))).toHaveLength(1);
    expect(((await (await sheet("/add-project", { path: join(homeDir, "b") })).json()) as any).already).toBe(true);
    expect(reg().filter((l) => l === join(homeDir, "b"))).toHaveLength(1);
    const newp = await (await sheet("/new-project", { name: "d", to: join(homeDir, "d") })).json() as any;
    expect(newp).toMatchObject({ ok: true, dir: join(homeDir, "d", ".kaizen"), git: true });
    expect(existsSync(join(homeDir, "d", ".git")) && existsSync(join(homeDir, "d", ".kaizen"))).toBe(true);
    expect((await sheet("/new-project", { name: "d", to: join(homeDir, "d") })).status).toBe(409);
    const plain = await (await sheet("/new-project", { name: "e", to: join(homeDir, "e"), git: false })).json() as any;
    expect(existsSync(join(homeDir, "e", ".git"))).toBe(false);
    expect(plain.git).toBeUndefined();
    // A clone that cannot connect (nothing listens on port 1): 500, and no folder left behind.
    expect((await sheet("/clone", { url: "https://127.0.0.1:1/z.git", to: join(homeDir, "f") })).status).toBe(500);
    expect(existsSync(join(homeDir, "f"))).toBe(false);
    expect(await (await sheet("/clone", { url: "git@github.com:o/r.git", check: true })).json()).toMatchObject({ ok: true, name: "r" });
    // /state: each card's workspace; a run whose worktree is gone falls back to the main checkout.
    mkdirSync(join(st, "runs", "r2"), { recursive: true });
    writeFileSync(join(st, "runs", "r2", "state.json"), JSON.stringify({ id: "r2", stage: "plan", awaiting: "approvals.plan", worktree: join(proj, ".kaizen", "wt", "gone") }));
    const S = await (await fetch(at + "/state?all=1")).json() as any;
    expect(S.cards.find((c: any) => c.id === "r2")?.ws).toBe(proj);
    expect(S.projects.find((p: any) => p.dir === st)?.workspaces).toEqual([{ path: proj, branch: "", main: true }]);
    rmSync(join(st, "runs", "r2"), { recursive: true });
    // Projects folder set: the global queue is not in the picker, yet its waiting run still gets a rail row.
    const g = join(homeDir, ".kaizen");
    writeFileSync(join(g, "config.yml"), readFileSync(join(repo, "skills", "kaizen", "config.default.yml"), "utf8").replace('projects_dir: ""', "projects_dir: ~/Projects"));
    mkdirSync(join(g, "runs", "g1"), { recursive: true });
    writeFileSync(join(g, "runs", "g1", "state.json"), JSON.stringify({ id: "g1", stage: "plan", awaiting: "approvals.plan" }));
    const G = await (await fetch(at + "/state?all=1")).json() as any;
    expect(G.cards.find((c: any) => c.id === "g1")?.ws).toBe(g);
    expect(G.projects.some((p: any) => p.dir === g)).toBe(false);
    expect(G.rail.find((p: any) => p.dir === g)?.workspaces).toEqual([{ path: g, branch: "", main: true }]);
    rmSync(join(g, "runs"), { recursive: true });
    rmSync(join(g, "config.yml"));

    const inWs = await post({ dir: st, ws: proj }, at);
    expect(inWs.status).toBe(200);
    const made = (await inWs.json()) as any;
    expect(made.ws).toBe(proj); // the tab lists a workspace's shells by it
    await fetch(at + "/pty/exit", { method: "POST", body: JSON.stringify({ key: made.key }) });
    for (let i = 0; i < 100; i++) { if (!((await (await fetch(`${at}/shells`)).json()) as any[]).length) break; await Bun.sleep(50); }
    // A worktree made after the board cached the list (above) is let in, not refused for 10 s.
    const g0 = (...a: string[]) => Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: proj });
    g0("init", "-q", "-b", "main"); g0("commit", "-q", "--allow-empty", "-m", "x");
    const fresh = join(proj, ".kaizen", "wt", "late");
    expect(g0("worktree", "add", "-q", "-b", "late", fresh).exitCode).toBe(0);
    await Bun.sleep(1100); // the recheck waits for a cache older than 1 s
    const late = await post({ dir: st, ws: fresh }, at);
    expect(late.status).toBe(200);
    await fetch(at + "/pty/exit", { method: "POST", body: JSON.stringify({ key: ((await late.json()) as any).key }) });
    for (let i = 0; i < 100; i++) { if (!((await (await fetch(`${at}/shells`)).json()) as any[]).length) break; await Bun.sleep(50); }
    // A burst of bad workspace paths runs git at most once.
    const log = join(root, "git.log");
    rmSync(join(bin, "git")); writeFileSync(join(bin, "git"), `#!/bin/sh\necho "$*" >> ${log}\nexec ${Bun.which("git")} "$@"\n`, { mode: 0o755 });
    await Bun.sleep(1100);
    for (let i = 0; i < 10; i++) expect((await post({ dir: st, ws: join(proj, "nope" + i) }, at)).status).toBe(400);
    expect((existsSync(log) ? readFileSync(log, "utf8") : "").split("\n").filter((l) => l.startsWith("worktree list")).length).toBeLessThanOrEqual(1);
    rmSync(join(bin, "git")); symlinkSync(Bun.which("git")!, join(bin, "git"));
    rmSync(join(proj, ".git"), { recursive: true, force: true }); rmSync(join(proj, ".kaizen", "wt"), { recursive: true, force: true });

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

    // /state lists the open agents once (not plain shells); an ended one drops out.
    writeFileSync(join(bin, "gemini"), '#!/bin/sh\necho "✦ Reading the parser source"\nread x\n', { mode: 0o755 });
    const ag = (await (await post({ dir: st, agent: "gemini" }, at)).json()) as any, pl = (await (await post({ dir: st }, at)).json()) as any;
    let A: any[] = [];
    for (let i = 0; i < 60 && !A[0]?.last; i++) { await Bun.sleep(100); A = ((await (await fetch(at + "/state?all=1")).json()) as any).agents; }
    expect(A.map((x) => x.key)).toEqual([ag.key]);
    expect(A[0]).toMatchObject({ dir: st, agent: "gemini", name: "Gemini", asking: false, last: "Reading the parser source" });
    for (const k of [ag.key, pl.key]) await fetch(at + "/pty/exit", { method: "POST", body: JSON.stringify({ key: k }) });
    for (let i = 0; i < 100; i++) { if (!((await (await fetch(`${at}/shells`)).json()) as any[]).length) break; await Bun.sleep(50); }
    expect(((await (await fetch(at + "/state?all=1")).json()) as any).agents).toEqual([]);

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
