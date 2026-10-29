// The in-card agent (agent.launch: card): the setting, and the real board running a
// fake agent in a pseudo-terminal, reached only from its own origin.
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchMode, closeSessions, readSessions, sweepSessions } from "./state.ts";
import { loginEnv, startPty, writePty, attachPty, ptyState, exitPty, lastLine } from "./pty.ts";
import { conptyHost, innerCommand, resizeSeq } from "./conpty.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "kaizen-pty-")));

test("agent.launch: card unless the config chain says terminal, comments between keys allowed", () => {
  const p = join(root, "mode");
  mkdirSync(join(p, ".kaizen"), { recursive: true });
  // The global file is the real one, so only the project file is varied here.
  writeFileSync(join(p, ".kaizen", "config.yml"), "agent:\n  # where\n  default: auto\n  # the board\n  launch: terminal\n");
  expect(launchMode(p)).toBe("terminal");
  writeFileSync(join(p, ".kaizen", "config.yml"), "agent:\n  launch: card\n");
  expect(launchMode(p)).toBe("card");
  writeFileSync(join(p, ".kaizen", "config.yml"), "agent.launch: terminal\n");
  expect(launchMode(p)).toBe("terminal");
});

test.skipIf(process.platform === "win32")("the board runs the agent in the card: output, input, origin check, and closing", async () => {
  const homeDir = join(root, "home"), proj = join(homeDir, "a"), st = join(proj, ".kaizen"), bin = join(root, "bin");
  for (const d of [st, join(homeDir, ".kaizen"), join(homeDir, ".claude"), bin]) mkdirSync(d, { recursive: true });
  writeFileSync(join(homeDir, ".kaizen", "projects"), proj + "\n");
  writeFileSync(join(st, "config.yml"), "agent:\n  default: claude\n  launch: card\n");
  writeFileSync(join(st, "inbox.md"), "# Inbox\n\n- open: say hello\n");
  // A stand-in for Claude Code: says how it was called, then echoes each line it is sent.
  writeFileSync(join(bin, "claude"), '#!/bin/sh\necho "args:$*"; echo "⏺ reply ready"\nwhile read x; do echo "got:$x"; done\n', { mode: 0o755 });
  // Started as a launcher starts it: a bare PATH, the agent reachable only through
  // the PATH the user's login shell builds.
  const sh = join(root, "loginsh");
  writeFileSync(sh, `#!/bin/sh\nPATH=${bin}:$PATH exec /bin/sh -c "$4"\n`, { mode: 0o755 });
  const port = 20000 + Math.floor(Math.random() * 20000);
  const repo = join(import.meta.dir, "..");
  const proc = Bun.spawn([process.execPath, join(repo, "cli", "install.ts"), "web", "--port", String(port), "--no-open", "--foreground"], {
    cwd: proj, stdout: "ignore", stderr: "ignore",
    env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir, KAIZEN_HOME: repo, CLAUDE_CONFIG_DIR: join(homeDir, ".claude"),
      PATH: "/usr/bin:/bin", KAIZEN_WEB_HOSTS: "remote.ts.net", SHELL: sh, DISPLAY: "", WAYLAND_DISPLAY: "", TERMINAL: "", TMUX: "" },
  });
  try {
    const at = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { await fetch(at + "/state"); break; } catch { if (i > 100) throw new Error("board did not start"); await Bun.sleep(50); } }

    // G-02: no terminal window anywhere (none could be found), yet the launch worked.
    const r = await (await fetch(at + "/run", { method: "POST", body: JSON.stringify({ dir: st, text: "say hello" }) })).json() as any;
    expect(r.ok).toBe(true);
    expect(r.pty).toMatch(/^[\w-]+$/);
    const card = ((await (await fetch(at + "/state")).json()) as any).cards.find((c: any) => c.text === "say hello");
    expect(card.pty).toMatchObject({ key: r.pty, alive: true, asking: false, all: [r.pty] });

    // The agent's output line goes to a viewer on this machine only, never a tailnet host; nothing typed is in it.
    const agentsOf = async (h?: string) => ((await (await fetch(at + "/state", { headers: h ? { host: h } : {} })).json()) as any).agents;
    expect((await agentsOf())[0].last).toBe("reply ready");
    const far = (await agentsOf("remote.ts.net"))[0];
    expect(far.key).toBe(r.pty);
    expect(far.last).toBeUndefined();
    // Host 127.0.0.1 behind a proxy (tailscale serve adds these headers) gets no line either.
    for (const h of ["x-forwarded-for", "tailscale-user-login"]) {
      const via = ((await (await fetch(at + "/state", { headers: { [h]: "100.64.0.9" } })).json()) as any).agents[0];
      expect(via.last).toBeUndefined();
    }

    // G-01: no Origin, a foreign one, and another local port are all refused.
    const url = `${at}/pty?key=${r.pty}`, up = { upgrade: "websocket", connection: "Upgrade", "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" };
    expect((await fetch(url, { headers: up })).status).toBe(403);
    expect((await fetch(url, { headers: { ...up, origin: "https://evil.example" } })).status).toBe(403);
    expect((await fetch(url, { headers: { ...up, origin: `http://127.0.0.1:${port + 1}` } })).status).toBe(403);
    expect((await fetch(`${at}/pty?key=nope`, { headers: { ...up, origin: at } })).status).toBe(404);

    // The board's own origin: the screen so far, then typing goes through.
    let seen = "";
    const ws = new WebSocket(url.replace("http", "ws"), { headers: { origin: at } } as any);
    const closed = new Promise((ok) => { ws.onclose = ok; });
    ws.onmessage = (e) => { seen += String(e.data); };
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    const until = async (re: RegExp) => { for (let i = 0; i < 100 && !re.test(seen); i++) await Bun.sleep(30); expect(seen).toMatch(re); };
    await until(/args:.*--session-id [\w-]+ .*\/kaizen say hello/);
    ws.send(JSON.stringify({ t: "r", c: 100, r: 30 }));
    ws.send(JSON.stringify({ t: "i", d: "ping\r" }));
    await until(/got:ping/);

    // G-03: the session record is the usual one, its PID file the agent's own, so a
    // run that owns it closes it like a terminal launch.
    const [s] = readSessions(st);
    expect(s!.cmd).toBe("claude");
    const pid = Number(readFileSync(join(st, "sessions", s!.key + ".pid"), "utf8"));
    expect(process.kill(pid, 0)).toBe(true);
    mkdirSync(join(st, "runs", "r1"), { recursive: true });
    writeFileSync(join(st, "runs", "r1", "00-request.md"), "say hello\n");
    expect(closeSessions(st, "r1")).toBe(1);
    // The page tells an agent that ended from a board that went away by this reason.
    expect(((await closed) as CloseEvent).reason).toBe("ended");
    expect(existsSync(join(st, "sessions", s!.key + ".pid"))).toBe(false);
    let gone = false;
    for (let i = 0; i < 50 && !gone; i++) { try { process.kill(pid, 0); await Bun.sleep(30); } catch { gone = true; } }
    expect(gone).toBe(true);

    // Resume: refused while the run waits on a decision, then the run's own conversation
    // continues in a new in-card session, and a second press is refused while it lives.
    const resume = async () => { const x = await fetch(at + "/resume", { method: "POST", body: JSON.stringify({ dir: st, id: "r1" }) }); return { status: x.status, ...(await x.json() as any) }; };
    writeFileSync(join(st, "runs", "r1", "state.json"), JSON.stringify({ id: "r1", stage: "plan", awaiting: "approvals.plan" }));
    expect((await resume()).status).toBe(409);
    writeFileSync(join(st, "runs", "r1", "state.json"), JSON.stringify({ id: "r1", stage: "build", awaiting: null }));
    // Claude resumes by id only when the conversation's transcript is on disk.
    const tr = join(homeDir, ".claude", "projects", proj.replace(/[^A-Za-z0-9]/g, "-"));
    mkdirSync(tr, { recursive: true });
    writeFileSync(join(tr, s!.sessionId + ".jsonl"), "{}\n");
    const again = await resume();
    expect(again).toMatchObject({ status: 200, ok: true });
    seen = "";
    const ws2 = new WebSocket(`${at}/pty?key=${again.pty}`.replace("http", "ws"), { headers: { origin: at } } as any);
    ws2.onmessage = (e) => { seen += String(e.data); };
    await new Promise((ok, no) => { ws2.onopen = ok; ws2.onerror = no; });
    await until(new RegExp(`args:.*--resume ${s!.sessionId} .*/kaizen run r1: continue`));
    expect((await resume()).status).toBe(409);

    // Its agent ended while the run waits on a decision: the conversation reopens with
    // nothing sent to it. With no conversation on disk, a done run is refused, never a blank session.
    const ended2 = new Promise((ok) => { ws2.onclose = ok; });
    expect(closeSessions(st, "r1")).toBe(1);
    await ended2;
    writeFileSync(join(st, "runs", "r1", "state.json"), JSON.stringify({ id: "r1", stage: "plan", awaiting: "approvals.plan" }));
    const quiet = await resume();
    expect(quiet).toMatchObject({ status: 200, ok: true });
    seen = "";
    const ws3 = new WebSocket(`${at}/pty?key=${quiet.pty}`.replace("http", "ws"), { headers: { origin: at } } as any);
    ws3.onmessage = (e) => { seen += String(e.data); };
    await new Promise((ok, no) => { ws3.onopen = ok; ws3.onerror = no; });
    await until(new RegExp(`args:.*--resume ${s!.sessionId}`));
    expect(seen).not.toContain("/kaizen");
    const ended3 = new Promise((ok) => { ws3.onclose = ok; });
    expect(closeSessions(st, "r1")).toBe(1);
    await ended3;
    rmSync(join(tr, s!.sessionId + ".jsonl"));
    writeFileSync(join(st, "runs", "r1", "state.json"), JSON.stringify({ id: "r1", stage: "done", awaiting: null }));
    expect(await resume()).toMatchObject({ status: 409, error: "no conversation of this run to resume" });
  } finally { proc.kill(); await proc.exited; }
}, 30_000);

test.skipIf(process.platform === "win32")("a board started from a launcher takes the login shell's PATH and exports, not its own bare ones", () => {
  const bin = join(root, "shells");
  mkdirSync(bin, { recursive: true });
  // A profile that greets on stdout before the environment, as many do.
  writeFileSync(join(bin, "fakesh"), '#!/bin/sh\necho "welcome back"\n[ "$1 $2 $3" = "-l -i -c" ] || exit 9\nFROM_PROFILE=yes PATH=/opt/brew/bin:$PATH PWD=/elsewhere exec /bin/sh -c "$4"\n', { mode: 0o755 });
  writeFileSync(join(bin, "badsh"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const e = loginEnv(join(bin, "fakesh"))!;
  expect(e.FROM_PROFILE).toBe("yes");
  expect(e.PATH.split(":")[0]).toBe("/opt/brew/bin");
  expect(loginEnv(join(bin, "badsh"))).toBeNull();
  expect(loginEnv(join(bin, "missing"))).toBeNull();
  // Into a process started with a launcher's bare PATH and its own setting: the
  // board's PATH first, the profile's added after it, the board's own variable not overridden,
  // the shell's PWD not taken.
  const pty = JSON.stringify(join(import.meta.dir, "pty.ts"));
  const out = Bun.spawnSync([process.execPath, "-e", `import { adoptLoginEnv } from ${pty}; adoptLoginEnv(); console.log(JSON.stringify([process.env.PATH, process.env.FROM_PROFILE, process.env.KEEP, process.env.PWD]))`], {
    env: { SHELL: join(bin, "fakesh"), PATH: "/usr/bin:/bin", KEEP: "mine", FROM_PROFILE: undefined as any, HOME: root },
  }).stdout.toString();
  const [path, from, keep, pwd] = JSON.parse(out);
  expect(path.split(":").slice(0, 3)).toEqual(["/usr/bin", "/bin", "/opt/brew/bin"]);
  expect([from, keep]).toEqual(["yes", "mine"]);
  expect(pwd).not.toBe("/elsewhere");
});

test.skipIf(process.platform === "win32")("the sweep leaves a done run's agent running", async () => {
  const st = join(root, "typed", ".kaizen"), ses = join(st, "sessions"), runDir = join(st, "runs", "r1");
  mkdirSync(ses, { recursive: true });
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(st, "config.yml"), "agent:\n  close: on\n");
  writeFileSync(join(runDir, "state.json"), JSON.stringify({ id: "r1", stage: "done", awaiting: null }));
  utimesSync(join(runDir, "state.json"), new Date(0), new Date(0));
  writeFileSync(join(ses, "idle.json"), JSON.stringify({ run: "r1", text: "x", cmd: "sh", sessionId: null, started: 0 }));
  const idle = startPty("idle", ["sh", "-c", "while read l; do echo got:$l; done"], root, join(ses, "idle.pid"));
  await Bun.sleep(200);
  sweepSessions(st);
  await Bun.sleep(200);
  expect(() => process.kill(idle, 0)).not.toThrow();
  process.kill(idle, "SIGTERM");
});

test.skipIf(process.platform === "win32")("exitPty types /exit, and ends an agent that ignores it", async () => {
  const wait = async (k: string) => { for (let i = 0; i < 100 && ptyState(k)!.alive; i++) await Bun.sleep(30); return ptyState(k)!.alive; };
  startPty("polite", ["sh", "-c", "while read l; do case $l in */exit*) exit 0;; esac; done"], root);
  expect(exitPty("polite", 60_000)).toBe(true);
  expect(await wait("polite")).toBe(false);
  startPty("stubborn", ["sh", "-c", "trap '' INT; while read l; do :; done"], root);
  await Bun.sleep(100);
  exitPty("stubborn", 300);
  expect(await wait("stubborn")).toBe(false);
  expect(exitPty("stubborn")).toBe(false);
});

test("asking: Claude Code and Codex prompts count as a question, ordinary output does not", async () => {
  const { asking } = await import("./pty.ts");
  expect(asking("\x1b[1mWould you like to run the following command?\x1b[0m")).toBe(true);
  expect(asking("What behavior do you want?\r\n\x1b[36m❯ 1. Retry with backoff\x1b[0m\r\n  2. Fail\r\n  4. Type something.")).toBe(true);
  expect(asking("Do you want to make this edit to cli/pty.ts?")).toBe(true);
  expect(asking("Reading cli/pty.ts\r\n\x1b[2K✻ Thinking… 1. step one done")).toBe(false);
  // Answered: the working line drawn after the question clears it.
  expect(asking("Do you want to make this edit?\r\n\x1b[2K✻ Contemplating… (1m 4s · ↓ 4.4k tokens)")).toBe(false);
  expect(asking("Would you like to run the following command?\r\n• Working (12s • esc to interrupt)")).toBe(false);
  expect(asking("Do you want to proceed?\r\n⠋ Reading files (esc to cancel, 4s)")).toBe(false);
  expect(asking("Do you want to proceed?\r\n  esc interrupt")).toBe(false);
  expect(asking("Do you want to proceed?\r\n❯ 1. Yes\r\n  2. No\r\n\r\nEsc to cancel · Tab to amend")).toBe(true);
  expect(asking("✻ Thinking… (3s · esc to interrupt)\r\nDo you want to proceed?\r\n❯ 1. Yes")).toBe(true);
});

test("Windows ConPTY host: resize travels in-band, the agent command survives quotes and newlines", () => {
  expect(resizeSeq(100, 40)).toBe("\x1b]kzr;100;40\x07");
  const line = innerCommand("C:\\ps.exe", ["claude", "it's\nhere"]);
  const enc = line.split(" ").pop()!;
  expect(line.startsWith('"C:\\ps.exe" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ')).toBe(true);
  expect(Buffer.from(enc, "base64").toString("utf16le")).toBe("& 'claude' 'it''s\nhere'");
  // The host script decodes to PowerShell carrying the C# whole.
  expect(Buffer.from(conptyHost(), "base64").toString("utf16le")).toContain("CreatePseudoConsole");
});

test.skipIf(process.platform !== "win32")("on Windows a card agent runs in a pseudo console and takes typed input", async () => {
  const key = `win-${Date.now()}`;
  const out: string[] = [];
  startPty(key, ["cmd.exe", "/q", "/k", "echo ready"], root);
  attachPty(key, (d) => { if (d) out.push(d); });
  const until = async (re: RegExp) => { for (let i = 0; i < 300 && !re.test(out.join("")); i++) await Bun.sleep(100); return out.join(""); };
  expect(await until(/ready/)).toContain("ready");
  writePty(key, "echo typed-%OS%\r");
  expect(await until(/typed-Windows_NT/)).toContain("typed-Windows_NT");
  writePty(key, "exit\r");
  for (let i = 0; i < 100 && ptyState(key)?.alive; i++) await Bun.sleep(100);
  expect(ptyState(key)?.alive).toBe(false);
}, 60_000);

test("busy: on while the agent draws its working line, off once it goes quiet; other output is not work", async () => {
  const key = "busy-" + Date.now();
  startPty(key, ["sh", "-c", "for i in 1 2 3 4 5 6; do echo 'Thinking (3s · esc to interrupt)'; sleep 0.1; done; read l"], root);
  await Bun.sleep(250);
  expect(ptyState(key)!.busy).toBe(true);
  await Bun.sleep(1800);
  expect(ptyState(key)).toMatchObject({ alive: true, busy: false });
  exitPty(key);
  const idle = "idle-" + Date.now();
  startPty(idle, ["sh", "-c", "for i in 1 2 3 4 5 6; do echo statusline; sleep 0.1; done; read l"], root);
  await Bun.sleep(250);
  expect(ptyState(idle)!.busy).toBe(false);
  exitPty(idle);
});

test("lastLine: only the agent's own marked reply lines, never input", () => {
  expect(lastLine("\x1b[2K\x1b[1;32m⏺ Done: fixed the bug\x1b[0m\r\n╭────╮\r\n│ ✻ │\r\n⠋ \r\n? for shortcuts\r\n✻ Thinking… (12s · esc to interrupt)")).toBe("Done: fixed the bug");
  expect(lastLine("• Ran the tests, 12 pass")).toBe("Ran the tests, 12 pass");
  expect(lastLine("✦ Updated the parser")).toBe("Updated the parser");
  // Unmarked output (a plain shell, an unknown agent) gives nothing: the card shows status only.
  expect(lastLine("Build passed\r\n12 pass 0 fail")).toBe("");
  // Typed or pasted text is never shown, whatever the prompt looks like.
  const leaks = [
    "│ > hey there │",
    "⏺ Done: fixed it\r\n╭──────╮\r\n│ > pasted-token-9 │\r\n│ ⏺ fake-token-9 │\r\n╰──────╯",
    "❯ pasted-token-9",
    "rzr@host:~$ export KEY=sk-secret-9",
    "user@host ~/a b/c (main) $ export KEY=sk-secret-9",
    "user@host ~/proj> sk-secret-9",
    "PS C:\\Users\\me> sk-secret-9",
    ">>> sk-secret-9",
    "▌ sk-secret-9",
    "  ~/proj  main  sk-secret-9",
    "sk-secret-9 continued in a later chunk",
  ];
  leaks.push("──────\r\n❯ please fix\r\n  • sk-secret-9 token\r\n⏺ token-9 pasted\r\n──────\r\n");
  for (const t of leaks) expect(lastLine(t)).not.toContain("secret-9"), expect(lastLine(t)).not.toContain("token-9");
  // The newest marked line wins over older ones; a marked line with an unmarked line below it still counts.
  expect(lastLine("⏺ Fixed issue # 42 in parser\r\nrzr@host:~$ sk-secret-9")).toBe("Fixed issue # 42 in parser");
  // Output above the input rules is still read; a tool call shows its name, not its arguments.
  expect(lastLine("⏺ Fixed the parser\r\n──────\r\n❯ next\r\n──────")).toBe("Fixed the parser");
  expect(lastLine("⏺ Bash(curl -H 'Authorization: Bearer sk-secret-9')")).toBe("Bash");
  expect(lastLine("╰───╯ ⠙ ✻")).toBe("");
  expect(lastLine("⏺ " + "x".repeat(200)).length).toBe(80);
});

test("last: only the agent's output, never what was typed or echoed right after a keystroke", async () => {
  const key = "last-" + Date.now();
  startPty(key, ["sh", "-c", "echo '⏺ agent-said-this'; stty echo; read a; sleep 2; echo '⏺ later-agent-line'; sleep 5"], root);
  await Bun.sleep(1000);
  expect(ptyState(key)!.last).toBe("agent-said-this");
  writePty(key, "hunter2-secret\r"); // the tty echoes it back at once
  await Bun.sleep(1200);
  expect(JSON.stringify(ptyState(key))).not.toContain("hunter2");
  expect(ptyState(key)!.last).toBe("agent-said-this");
  await Bun.sleep(2200);
  expect(ptyState(key)!.last).toBe("later-agent-line");
  expect(JSON.stringify(ptyState(key))).not.toContain("hunter2");
  exitPty(key, 100);
});

test("last: a pasted token in the input box is never the last line, redraw or quiet read", async () => {
  const key = "box-" + Date.now();
  startPty(key, ["sh", "-c", "echo '⏺ agent-said-this'; sleep 2; printf '╭────╮\\n│ > pasted-token-9 │\\n╰────╯\\n'; sleep 3; printf '\\r│ > pasted-token-9 │\\n'; sleep 5"], root);
  await Bun.sleep(2600);
  expect(ptyState(key)!.last).toBe("agent-said-this");
  await Bun.sleep(2400);
  expect(JSON.stringify(ptyState(key))).not.toContain("pasted-token");
  exitPty(key, 100);
}, 15000);

test("last: nothing is read while the terminal is asking", async () => {
  const key = "ask-" + Date.now();
  startPty(key, ["sh", "-c", "echo 'Do you want to proceed? (y/n)'; read a; echo ok-done-now; read b; sleep 5"], root);
  for (let i = 0; i < 40 && !ptyState(key)!.asking; i++) await Bun.sleep(100);
  expect(ptyState(key)!.asking).toBe(true);
  writePty(key, "hunter2\r");
  await Bun.sleep(1200);
  expect(JSON.stringify(ptyState(key))).not.toContain("hunter2");
  exitPty(key, 100);
});
