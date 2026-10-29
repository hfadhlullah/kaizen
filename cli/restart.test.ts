// A board that stops or dies with agents running in their cards: the next board starts
// them again (once, after a crash) with their last screen, ends what they left behind,
// and with agent.keep_alive: tmux attaches to the same agent instead.
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPty, exitPty, ptyState, tmuxOk, tmuxName, tmuxAlive, killTmux, detachPty, attachPty, panePid } from "./pty.ts";
import { keepAlive } from "./state.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "kaizen-restart-")));
const posix = process.platform !== "win32";
const gone = async (pid: number) => { for (let i = 0; i < 100; i++) { try { process.kill(pid, 0); await Bun.sleep(30); } catch { return true; } } return false; };

test("agent.keep_alive: off unless the config chain says tmux", () => {
  const p = join(root, "keep");
  mkdirSync(join(p, ".kaizen"), { recursive: true });
  writeFileSync(join(p, ".kaizen", "config.yml"), "agent:\n  launch: card\n  # kept\n  keep_alive: tmux\n");
  expect(keepAlive(p)).toBe("tmux");
  writeFileSync(join(p, ".kaizen", "config.yml"), "agent.keep_alive: off\n");
  expect(keepAlive(p)).toBe("off");
});

// G-04: what the agent started goes with it, whether it is ended or ends by itself.
test.skipIf(!posix)("an ended card agent takes the processes it started with it", async () => {
  for (const [key, how] of [["kids-ended", "ended"], ["kids-exit", "exit"]] as const) {
    const pidFile = join(root, `${key}.child`);
    // nohup: the pty's hangup alone would not end it, as with a dev server.
    startPty(key, ["sh", "-c", `nohup sleep 300 >/dev/null 2>&1 & echo $! > ${pidFile}; read l; read l`], root);
    for (let i = 0; i < 100 && !existsSync(pidFile); i++) await Bun.sleep(20);
    const child = Number(readFileSync(pidFile, "utf8"));
    if (how === "ended") exitPty(key, 200);
    else { const { writePty } = await import("./pty.ts"); writePty(key, "a\r"); writePty(key, "b\r"); }
    for (let i = 0; i < 100 && ptyState(key)!.alive; i++) await Bun.sleep(30);
    expect(await gone(child)).toBe(true);
  }
});

// G-06: a kept agent outlives its client, a new client sees it, closing ends it; the
// user's own tmux server is never asked anything.
test.skipIf(!posix || !tmuxOk())("tmux keep-alive: detach keeps the agent, attach shows it, exit ends it", async () => {
  const name = tmuxName(`t${Date.now()}`), mark = join(root, "tmux.count");
  const pidFile = join(root, "kept.pid"), argsOf = (pid: number) => Bun.spawnSync(["ps", "-o", "args=", "-p", String(pid)]).stdout.toString();
  // The board's PATH reaches the agent even though the tmux server may be older than it.
  process.env.PATH = `/kz-path-mark:${process.env.PATH}`;
  startPty("kept", ["sh", "-c", `echo $PATH > ${mark}.path; i=0; while true; do i=$((i+1)); echo $i > ${mark}; echo tick$i; sleep 0.1; done`], root, pidFile, undefined, { tmux: name });
  process.env.PATH = process.env.PATH.replace("/kz-path-mark:", "");
  try {
    for (let i = 0; i < 100 && !existsSync(mark); i++) await Bun.sleep(30);
    expect(readFileSync(`${mark}.path`, "utf8")).toContain("/kz-path-mark");
    // The pid file holds the agent in the pane, so closeSessions knows it (isSession reads its args).
    for (let i = 0; i < 50 && Number(readFileSync(pidFile, "utf8")) !== panePid(name); i++) await Bun.sleep(30);
    expect(Number(readFileSync(pidFile, "utf8"))).toBe(panePid(name)!);
    expect(argsOf(panePid(name)!)).toContain("tick$i");
    expect(detachPty("kept")).toBe(true);
    for (let i = 0; i < 100 && ptyState("kept")!.alive; i++) await Bun.sleep(30);
    expect(ptyState("kept")!.alive).toBe(false);
    expect(tmuxAlive(name)).toBe(true);
    const before = Number(readFileSync(mark, "utf8"));
    await Bun.sleep(400);
    expect(Number(readFileSync(mark, "utf8"))).toBeGreaterThan(before);   // kept working with no client
    startPty("kept2", [], root, pidFile, undefined, { tmux: name, attach: true });
    let seen = "";
    attachPty("kept2", (d) => { if (d) seen += d; });
    for (let i = 0; i < 100 && !/tick\d+/.test(seen); i++) await Bun.sleep(30);
    expect(seen).toMatch(/tick\d+/);
    // Reattached: still the agent's PID, never the new client's.
    for (let i = 0; i < 50 && !argsOf(Number(readFileSync(pidFile, "utf8"))).includes("tick$i"); i++) await Bun.sleep(30);
    expect(argsOf(Number(readFileSync(pidFile, "utf8")))).toContain("tick$i");
    exitPty("kept2", 200);
    for (let i = 0; i < 100 && tmuxAlive(name); i++) await Bun.sleep(30);
    expect(tmuxAlive(name)).toBe(false);
    // Only kaizen's own server: the default socket never got this session.
    expect(Bun.spawnSync(["tmux", "has-session", "-t", `=${name}`], { stderr: "ignore" }).exitCode).not.toBe(0);
  } finally { killTmux(name); }
});

// G-01, G-02, G-09: the real board, stopped and killed, with a fake agent in a card.
test.skipIf(!posix)("a stopped or crashed board resumes its card agents, once after a crash, showing the last screen", async () => {
  const homeDir = join(root, "home"), proj = join(homeDir, "a"), st = join(proj, ".kaizen"), bin = join(root, "bin");
  for (const d of [st, join(homeDir, ".kaizen"), join(homeDir, ".claude"), bin]) mkdirSync(d, { recursive: true });
  writeFileSync(join(homeDir, ".kaizen", "projects"), proj + "\n");
  writeFileSync(join(st, "config.yml"), "agent:\n  default: claude\n  launch: card\n");
  writeFileSync(join(bin, "claude"), '#!/bin/sh\necho "args:$*"\nwhile read x; do echo "got:$x"; done\n', { mode: 0o755 });
  const repo = join(import.meta.dir, "..");
  const port = 20000 + Math.floor(Math.random() * 20000), at = `http://127.0.0.1:${port}`;
  let out = "";
  const board = () => {
    const p = Bun.spawn([process.execPath, join(repo, "cli", "install.ts"), "web", "--port", String(port), "--no-open", "--foreground"], {
      cwd: proj, stdout: "pipe", stderr: "ignore",
      env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir, KAIZEN_HOME: repo, CLAUDE_CONFIG_DIR: join(homeDir, ".claude"),
        PATH: `${bin}:/usr/bin:/bin`, SHELL: "/bin/false", DISPLAY: "", WAYLAND_DISPLAY: "", TERMINAL: "", TMUX: "" },
    });
    (async () => { for await (const c of p.stdout) out += new TextDecoder().decode(c); })();
    return p;
  };
  const up = async () => { for (let i = 0; ; i++) { try { await fetch(at + "/state"); return; } catch { if (i > 150) throw new Error("board did not start"); await Bun.sleep(50); } } };
  const screen = async (key: string, re: RegExp) => {
    let seen = "";
    const ws = new WebSocket(`${at}/pty?key=${key}`.replace("http", "ws"), { headers: { origin: at } } as any);
    ws.onmessage = (e) => { seen += String(e.data); };
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    for (let i = 0; i < 100 && !re.test(seen); i++) await Bun.sleep(30);
    ws.close();
    return seen;
  };
  const liveKey = async () => ((await (await fetch(at + "/state")).json()) as any).cards.find((c: any) => c.id === "r1")?.pty?.key as string | undefined;

  let b = board();
  try {
    await up();
    const r = await (await fetch(at + "/run", { method: "POST", body: JSON.stringify({ dir: st, text: "say hello" }) })).json() as any;
    expect(r.ok).toBe(true);
    // The run that launch became, in its build stage, with its conversation on disk.
    mkdirSync(join(st, "runs", "r1"), { recursive: true });
    writeFileSync(join(st, "runs", "r1", "00-request.md"), "say hello\n");
    writeFileSync(join(st, "runs", "r1", "state.json"), JSON.stringify({ id: "r1", stage: "build", awaiting: null }));
    const sid = JSON.parse(readFileSync(join(st, "sessions", r.pty + ".json"), "utf8")).sessionId;
    const tr = join(homeDir, ".claude", "projects", proj.replace(/[^A-Za-z0-9]/g, "-"));
    mkdirSync(tr, { recursive: true });
    writeFileSync(join(tr, sid + ".jsonl"), "{}\n");
    const ws = new WebSocket(`${at}/pty?key=${r.pty}`.replace("http", "ws"), { headers: { origin: at } } as any);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    ws.send(JSON.stringify({ t: "i", d: "first-screen\r" }));
    await screen(r.pty, /got:first-screen/);
    const agent = Number(readFileSync(join(st, "sessions", r.pty + ".pid"), "utf8"));

    // An orderly stop (systemd, Ctrl-C): the agent is ended, the list and screen kept.
    b.kill("SIGTERM");
    await b.exited;
    expect(await gone(agent)).toBe(true);
    const list = JSON.parse(readFileSync(join(homeDir, ".kaizen", "resume-after-upgrade.json"), "utf8"));
    expect(list).toMatchObject({ crash: false, list: [{ key: r.pty, run: "r1" }] });

    b = board();
    await up();
    const k2 = await liveKey();
    expect(k2).toBeTruthy();
    const seen = await screen(k2!, new RegExp(`--resume ${sid}`));
    expect(seen).toMatch(/got:first-screen[\s\S]*board restarted · agent resumed[\s\S]*--resume/);
    expect(out).toMatch(/resumed r1/);

    // A crash: no stop runs, yet the list kept current while it ran resumes it once.
    await Bun.sleep(3500);
    b.kill("SIGKILL");
    await b.exited;
    expect(JSON.parse(readFileSync(join(homeDir, ".kaizen", "resume-after-upgrade.json"), "utf8")).crash).toBe(true);
    out = "";
    b = board();
    await up();
    expect(await liveKey()).toBeTruthy();
    expect(out).toMatch(/resumed r1/);
    // Dying again right after that resume: the next board leaves it on its Resume button.
    await Bun.sleep(3500);
    expect(JSON.parse(readFileSync(join(homeDir, ".kaizen", "resume-after-upgrade.json"), "utf8")).list[0].resumed).toBeGreaterThan(0);
    b.kill("SIGKILL");
    await b.exited;
    out = "";
    b = board();
    await up();
    await Bun.sleep(300);
    expect(out).toMatch(/not resuming r1/);
    expect(await liveKey()).toBeFalsy();
  } finally {
    b.kill("SIGKILL");
    // The fake agents of the killed boards: ended so nothing outlives the test.
    Bun.spawnSync(["pkill", "-f", `${bin}/claude`]);
  }
}, 40_000);
