import { test, expect } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkUrls, frameCutter, runTask, sweep, type Docker, type State, type Stream } from "../src/computer";
import { openStore } from "../src/db";
import { createApp } from "../src/server";
import { runTurn, computerBot, systemPrompt } from "../src/agent";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const CSV = new TextEncoder().encode("url,tag,text\nhttp://fixture.test/,h1,Hi\n");
const enc = (s: string) => new TextEncoder().encode(s);

// A fake docker CLI: records every argv and answers like the real one would, with knobs
// for the ways a task can go wrong.
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2]);
function fakeDocker(o: { frame?: Uint8Array; task?: "ok" | "fail" | "hang"; scan?: number; files?: Record<string, Uint8Array>; stuck?: boolean; listing?: string } = {}) {
  const calls: string[][] = [];
  const files = o.files ?? { "page-1.png": PNG, "result.csv": CSV };
  let removed = false;
  const res = (code = 0, out: Uint8Array | string = "", err = "", truncated = false) =>
    ({ code, out: typeof out === "string" ? enc(out) : out, err, truncated });
  const d: Docker = async (args, opts = {}) => {
    calls.push(args);
    const [a, b] = args;
    if (a === "exec" && args[2] === "/opt/task.sh") {
      if (o.task === "fail") return res(1, "", "task: chromium crashed");
      if (o.task === "hang") return new Promise((r) => {
        const t = setTimeout(() => r(res(137)), opts.timeoutMs ?? 1e9);
        opts.signal?.addEventListener("abort", () => { clearTimeout(t); r(res(137)); });
      });
      return res(0, "page-1.png\nresult.csv\n");
    }
    if (a === "exec" && args[2] === "sh") return res(0, "157286400\nusage_usec 2100000\n");
    if (a === "exec" && args[2] === "ls") return res(0, Object.keys(files).join("\n") + "\n");
    if (a === "exec" && args[2] === "cat" && args[3] === "/tmp/live/frame.jpg") return res(0, o.frame ?? JPEG);
    if (a === "exec" && args[2] === "cat" && args[3] === "/tmp/live/step.txt") return res(0, "Opening http://fixture.test/ (1 of 1)\u0007<b>");
    if (a === "exec" && args[2] === "cat") {
      const f = files[args[3]!.replace("/work/out/", "")]!;
      const max = opts.maxBytes ?? Infinity;
      return res(0, f.subarray(0, max), "", f.length > max);
    }
    if (a === "run" && args.includes("clamscan")) {
      const code = o.scan ?? 0;
      return res(code, code === 1 ? "/scan/page-1.png: Win.Test.EICAR_HDB-1 FOUND\n" : "", code > 1 ? "Unable to find image" : "");
    }
    if (a === "logs") return res(0, '{"decision": "ALLOW"}\n{"decision": "DENY"}\n{"decision": "DENY"}\n');
    if (a === "rm" || (a === "network" && b === "rm")) { removed = true; return res(0); }
    if (a === "ps" && args[1] === "-aq") return res(0, removed && !o.stuck ? "" : "abc123\n");
    if (a === "network" && b === "ls" && args.includes("-q")) return res(0, removed && !o.stuck ? "" : "net1\n");
    if (a === "ps" || (a === "network" && b === "ls")) return res(0, o.listing ?? "");
    return res(0);
  };
  return { d, calls };
}

const dirs = () => { const root = mkdtempSync(join(tmpdir(), "kz-computer-")); return { dir: join(root, "artifacts"), logDir: join(root, "logs"), root }; };
async function go(o: Parameters<typeof fakeDocker>[0] = {}, extra: Partial<Parameters<typeof runTask>[0]> = {}) {
  const f = fakeDocker(o), p = dirs(), states: State[] = [];
  const r = await runTask({ id: 7, urls: ["http://fixture.test/"], ...p, docker: f.d, onState: (s) => states.push(s), ...extra });
  return { r, states, calls: f.calls, ...p };
}
const removedAll = (calls: string[][]) => calls.some((c) => c[0] === "rm" && c.includes("kz-7-sb") && c.includes("kz-7-px") && c.includes("kz-7-fx"))
  && calls.some((c) => c[0] === "network" && c[1] === "rm" && c[2] === "kz-7-net");

test("allowlist: only web URLs on the pilot list, 1 to 3 of them", () => {
  expect(checkUrls(["https://example.com/", "http://fixture.test/x"])).toBeNull();
  expect(checkUrls([])).toContain("1 to 3");
  expect(checkUrls(["https://example.com/", "https://example.com/", "https://example.com/", "https://example.com/"])).toContain("1 to 3");
  expect(checkUrls(["https://wikipedia.org/"])).toContain("not on the pilot allowlist");
  expect(checkUrls(["https://example.com.evil.test/"])).toContain("not on the pilot allowlist");
  expect(checkUrls(["file:///etc/passwd"])).toContain("not a web URL");
  expect(checkUrls(["https://u:p@example.com/"])).toContain("credentials");
  expect(checkUrls(["http://169.254.169.254/"])).toContain("not on the pilot allowlist");
});

test("success: states in order, files exported and kept, sandbox removed and confirmed", async () => {
  const { r, states, calls, dir, logDir } = await go();
  expect(states).toEqual(["starting", "running", "stopping", "stopped"]);
  expect(r.ok).toBe(true);
  expect(r.clean).toBe(true);
  expect(r.artifacts.map((a) => a.name)).toEqual(["page-1.png", "result.csv"]);
  expect(readFileSync(join(dir, "7", "result.csv"), "utf8")).toContain("h1,Hi");
  expect(readdirSync(dir)).toEqual(["7"]); // no staging folder left behind
  expect(r.proxy).toEqual({ allowed: 1, denied: 2 });
  expect(r.usage).toEqual({ memPeakMb: 150, cpuSec: 2.1 });
  expect(existsSync(join(logDir, "7.jsonl"))).toBe(true);
  expect(removedAll(calls)).toBe(true);
  // The sandbox is created locked down and on the internal network only.
  const sb = calls.find((c) => c[0] === "run" && c.includes("kz-7-sb"))!;
  for (const flag of ["--read-only", "--cap-drop", "no-new-privileges", "--pids-limit", "--memory-swap"]) expect(sb).toContain(flag);
  expect(sb[sb.indexOf("--user") + 1]).toBe("1000:1000");
  expect(sb[sb.indexOf("--network") + 1]).toBe("kz-7-net");
  expect(sb.some((a) => a === "-v" || a.startsWith("--mount") || a.includes("docker.sock"))).toBe(false);
  expect(calls.find((c) => c[0] === "network" && c[1] === "create")).toContain("--internal");
});

test("a URL with shell syntax reaches the task as one argv item, never through a shell", async () => {
  const url = "http://fixture.test/?q=$(id);rm -rf /`x`";
  const { calls } = await go({}, { urls: [url] });
  const exec = calls.find((c) => c[0] === "exec" && c[2] === "/opt/task.sh")!;
  expect(exec.slice(3)).toEqual([url]);
  expect(calls.some((c) => c.includes("sh") && c.some((a) => a.includes("$(id)")))).toBe(false);
});

test("an off-list URL is refused before docker is called", async () => {
  const { r, calls, states } = await go({}, { urls: ["https://evil.test/"] });
  expect(r.ok).toBe(false);
  expect(r.error).toContain("not on the pilot allowlist");
  expect(calls.filter((c) => c[0] === "run" || c[0] === "exec")).toEqual([]);
  expect(states).toEqual(["error"]);
});

for (const [name, o, extra, want] of [
  ["task failure", { task: "fail" }, {}, "the task failed: task: chromium crashed"],
  ["timeout", { task: "hang" }, { taskMs: 30 }, "timed out"],
  ["scanner missing", { scan: 2 }, {}, "the virus scan did not run"],
  ["infected file", { scan: 1 }, {}, "the virus scan flagged page-1.png"],
  ["file over the cap", { files: { "page-1.png": new Uint8Array(5 * 1024 * 1024 + 10).fill(0x89) } }, {}, "over the 5 MB cap"],
  ["wrong type by content", { files: { "page-1.png": enc("<script>x</script>") } }, {}, "not a PNG or CSV"],
  ["not allowed extension", { files: { "run.sh": enc("#!/bin/sh") } }, {}, "not a PNG or CSV"],
  ["bad file name", { files: { "..": PNG } }, {}, "bad file name"],
  ["too many files", { files: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`p${i}.png`, PNG])) }, {}, "over the 10-file cap"],
] as const) {
  test(`${name}: error state with a reason, nothing exported, sandbox removed`, async () => {
    const { r, states, calls, dir } = await go(o as any, extra as any);
    expect(r.ok).toBe(false);
    expect(r.error).toContain(want);
    expect(states[states.length - 1]).toBe("error");
    expect(states).toContain("stopping");
    expect(r.artifacts).toEqual([]);
    expect(existsSync(join(dir, "7"))).toBe(false);
    expect(removedAll(calls)).toBe(true);
    expect(r.clean).toBe(true);
  });
}

test("cancel: the running task is stopped and the sandbox removed", async () => {
  const ctl = new AbortController();
  const f = fakeDocker({ task: "hang" }), p = dirs(), states: State[] = [];
  const run = runTask({ id: 7, urls: ["http://fixture.test/"], ...p, docker: f.d, signal: ctl.signal, onState: (s) => { states.push(s); if (s === "running") setTimeout(() => ctl.abort(), 5); } });
  const r = await run;
  expect(r.error).toBe("cancelled by you; the sandbox was removed");
  expect(states).toEqual(["starting", "running", "stopping", "error"]);
  expect(removedAll(f.calls)).toBe(true);
});

test("a delete that cannot be confirmed is an error, not a success", async () => {
  const { r } = await go({ stuck: true });
  expect(r.ok).toBe(false);
  expect(r.clean).toBe(false);
  expect(r.error).toContain("delete not confirmed");
});

test("sweeper removes expired and orphaned sandboxes, keeps a live one", async () => {
  const now = 2_000_000_000_000, exp = (s: number) => String(Math.floor(now / 1000) + s);
  const listing = [`kz-1-sb|1|${exp(-5)}`, `kz-2-sb|2|${exp(300)}`, `kz-3-sb|3|${exp(300)}`, `kzsbx-box||${exp(300)}`].join("\n");
  const f = fakeDocker({ listing });
  const gone = await sweep((card) => card === 3, f.d, now);
  // The fake answers the same listing for networks, so each name is removed twice: once per kind.
  expect([...new Set(gone)].sort()).toEqual(["kz-1-sb", "kz-2-sb", "kzsbx-box"]);
  expect(f.calls.some((c) => c[0] === "rm" && c.includes("kz-3-sb"))).toBe(false);
});

// ---- the bot side ----
const env = { PROVIDER: "anthropic", MODEL: "m", ANTHROPIC_API_KEY: "k" };
const req = (app: ReturnType<typeof createApp>, path: string, init: { method?: string; body?: unknown } = {}) =>
  app.handle(new Request(`http://127.0.0.1:7430${path}`, { method: init.method ?? "GET", headers: { host: "127.0.0.1:7430", "content-type": "application/json" }, body: init.body ? JSON.stringify(init.body) : undefined }));

function setup(o: Parameters<typeof fakeDocker>[0] = {}, taskMs = 50) {
  const store = openStore(":memory:");
  const tech = store.createBot("tech", "Tech Lead");
  const chief = store.createBot("chief", "Chief");
  const f = fakeDocker(o), p = dirs();
  const app = createApp({ store, env, watch: false, dataDir: p.root, computer: { docker: f.d, taskMs } });
  return { store, tech, chief, app, f, p };
}
const waitDone = async (app: ReturnType<typeof createApp>) => { for (let i = 0; i < 200 && app.computerRunning(); i++) await Bun.sleep(5); };

test("the tool is offered only to the chosen Tech Lead agent while the pilot is on", async () => {
  const { store, tech, chief, app } = setup();
  expect(computerBot(store)).toBe(0);
  expect((await req(app, "/settings", { method: "POST", body: { computerBot: chief.id } })).status).toBe(400);
  expect((await req(app, "/settings", { method: "POST", body: { computerBot: tech.id, computerEnabled: true } })).status).toBe(200);
  expect(computerBot(store)).toBe(tech.id);
  const offered = async (botId: number) => {
    let tools: string[] = [];
    const fetch = async (_: string, init: RequestInit) => { tools = JSON.parse(init.body as string).tools.map((t: any) => t.name); return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] })); };
    await runTurn({ store, cfg: { provider: "anthropic", model: "m", key: "k", baseUrl: "https://api.anthropic.com/v1" }, fetch }, botId, "hi", () => {});
    return tools.includes("propose_computer_task");
  };
  expect(await offered(tech.id)).toBe(true);
  expect(await offered(chief.id)).toBe(false);
  await req(app, "/settings", { method: "POST", body: { computerEnabled: false } });
  expect(await offered(tech.id)).toBe(false);
});

test("approve runs the task; files download after the sandbox is gone; only listed names are served", async () => {
  const { store, tech, app } = setup();
  await req(app, "/settings", { method: "POST", body: { computerBot: tech.id, computerEnabled: true } });
  const a = store.addAction(tech.id, { kind: "computer", body: { urls: ["http://fixture.test/"], purpose: "prices" }, summary: "Computer task" });
  expect(a.status).toBe("needed");
  const r = await req(app, `/actions/${a.id}`, { method: "POST", body: { op: "approve" } });
  expect(r.status).toBe(200);
  // One at a time: a second card waits.
  const b = store.addAction(tech.id, { kind: "computer", body: { urls: ["http://fixture.test/"], purpose: "x" }, summary: "Computer task 2" });
  expect((await req(app, `/actions/${b.id}`, { method: "POST", body: { op: "approve" } })).status).toBe(409);
  await waitDone(app);
  const done = store.action(a.id)!;
  expect(done.status).toBe("done");
  const snap = JSON.parse(done.snapshot!);
  expect(snap.state).toBe("stopped");
  expect(snap.clean).toBe(true);
  const csv = await req(app, `/actions/${a.id}/artifacts/result.csv`);
  expect(csv.status).toBe(200);
  expect(csv.headers.get("content-disposition")).toContain("attachment");
  expect(await csv.text()).toContain("h1,Hi");
  expect((await req(app, `/actions/${a.id}/artifacts/${encodeURIComponent("../../bot.db")}`)).status).toBe(404);
  expect((await req(app, `/actions/${a.id}/artifacts/other.csv`)).status).toBe(404);
});

test("approval is refused while the pilot is off", async () => {
  const { store, tech, app } = setup();
  await req(app, "/settings", { method: "POST", body: { computerBot: tech.id } });
  const a = store.addAction(tech.id, { kind: "computer", body: { urls: ["http://fixture.test/"], purpose: "x" }, summary: "Computer task" });
  expect((await req(app, `/actions/${a.id}`, { method: "POST", body: { op: "approve" } })).status).toBe(409);
  expect(store.action(a.id)!.status).toBe("needed");
});

test("cancel from the card, and turning the pilot off, stop a running task", async () => {
  for (const how of ["cancel", "switch"] as const) {
    const { store, tech, app } = setup({ task: "hang" });
    await req(app, "/settings", { method: "POST", body: { computerBot: tech.id, computerEnabled: true } });
    const a = store.addAction(tech.id, { kind: "computer", body: { urls: ["http://fixture.test/"], purpose: "x" }, summary: "Computer task" });
    await req(app, `/actions/${a.id}`, { method: "POST", body: { op: "approve" } });
    await Bun.sleep(5);
    if (how === "cancel") expect((await req(app, `/actions/${a.id}`, { method: "POST", body: { op: "cancel" } })).status).toBe(200);
    else await req(app, "/settings", { method: "POST", body: { computerEnabled: false } });
    await waitDone(app);
    const x = store.action(a.id)!;
    expect(x.status).toBe("failed");
    expect(x.result).toMatch(/cancelled by you|timed out/);
  }
});

test("a card left working by a stopped server is marked failed on start", () => {
  const store = openStore(":memory:");
  const tech = store.createBot("tech", "Tech Lead");
  const a = store.addAction(tech.id, { kind: "computer", body: { urls: [] }, summary: "Computer task" });
  store.claimAction(a.id, "needed", "working");
  createApp({ store, env, watch: false, dataDir: dirs().root });
  expect(store.action(a.id)!.status).toBe("failed");
  expect(store.action(a.id)!.result).toContain("interrupted");
});

test("the database migrates an existing v3 file and keeps its cards", () => {
  const p = join(dirs().root, "bot.db");
  const s1 = openStore(p);
  const b = s1.createBot("tech", "T");
  s1.addAction(b.id, { kind: "idea", summary: "kept" });
  // Make it look like a v3 file: user_version back to 3, old CHECK in place is fine for the rebuild.
  const { Database } = require("bun:sqlite");
  const raw = new Database(p); raw.exec("PRAGMA user_version = 3"); raw.close();
  const s2 = openStore(p);
  expect(s2.actions().map((a) => a.summary)).toContain("kept");
  expect(s2.addAction(b.id, { kind: "computer", summary: "new" }).kind).toBe("computer");
  expect(existsSync(`${p}.v3.bak`)).toBe(true);
});

test("the server's sweep leaves another process's live sandbox alone until it expires", async () => {
  const store = openStore(":memory:");
  const tech = store.createBot("tech", "Tech Lead");
  const mine = store.addAction(tech.id, { kind: "computer", body: { urls: [] }, summary: "mine" });
  store.updateAction(mine.id, { status: "failed" });
  const exp = String(Math.floor(Date.now() / 1000) + 300);
  const f = fakeDocker({ listing: [`kz-${mine.id}-sb|${mine.id}|${exp}`, `kz-900000-sb|900000|${exp}`].join("\n") });
  const app = createApp({ store, env, watch: false, dataDir: dirs().root, computer: { docker: f.d } });
  const gone = await app.sweepNow();
  expect(gone).toContain(`kz-${mine.id}-sb`);
  expect(gone).not.toContain("kz-900000-sb");
});

// ffmpeg's mpjpeg framing, as the sandbox would stream it; split across chunks on purpose.
const mp = (jpeg: Uint8Array) => { const h = enc(`--ffmpeg\r\nContent-type: image/jpeg\r\nContent-length: ${jpeg.length}\r\n\r\n`); const o = new Uint8Array(h.length + jpeg.length + 2); o.set(h); o.set(jpeg, h.length); o.set([13, 10], h.length + jpeg.length); return o; };
const fakeStream = (frames: Uint8Array[]): Stream => async (_args, onData, signal) => {
  for (const f of frames) { const b = mp(f); onData(b.subarray(0, 7)); onData(b.subarray(7)); await Bun.sleep(20); }
  await new Promise((r) => signal.addEventListener("abort", r));
  return 0;
};

test("frame cutter: whole frames out of a split stream; non-JPEG and oversized frames dropped", () => {
  const got: Uint8Array[] = [];
  const cut = frameCutter((j) => got.push(j));
  const all = new Uint8Array([...mp(JPEG), ...mp(enc("<html>")), ...mp(new Uint8Array(600_001).fill(0xff)), ...mp(JPEG)]);
  for (let i = 0; i < all.length; i += 4096) cut(all.subarray(i, i + 4096));
  expect(got.length).toBe(2);
  expect(got[0]).toEqual(JPEG);
});

test("live screen: video reaches the card while the task runs, ends with it", async () => {
  const store = openStore(":memory:");
  const tech = store.createBot("tech", "Tech Lead");
  const app = createApp({ store, env, watch: false, dataDir: dirs().root, computer: { docker: fakeDocker({ task: "hang" }).d, stream: fakeStream([JPEG, JPEG]), taskMs: 10_000 } });
  await req(app, "/settings", { method: "POST", body: { computerBot: tech.id, computerEnabled: true } });
  const a = store.addAction(tech.id, { kind: "computer", body: { urls: ["http://fixture.test/"], purpose: "x" }, summary: "Computer task" });
  expect((await req(app, `/actions/${a.id}/live.mjpeg`)).status).toBe(404);
  await req(app, `/actions/${a.id}`, { method: "POST", body: { op: "approve" } });
  let r: Response | null = null;
  for (let i = 0; i < 60 && !r; i++) { await Bun.sleep(50); const x = await req(app, `/actions/${a.id}/live`); if (x.status === 200) r = x; }
  expect(r).not.toBeNull();
  const v = await req(app, `/actions/${a.id}/live.mjpeg`);
  expect(v.headers.get("content-type")).toBe("multipart/x-mixed-replace; boundary=frame");
  const reader = v.body!.getReader();
  const first = new TextDecoder("latin1").decode((await reader.read()).value);
  expect(first).toContain("Content-Type: image/jpeg");
  await req(app, `/actions/${a.id}`, { method: "POST", body: { op: "cancel" } });
  await waitDone(app);
  // The stream closes with the task, and the endpoints answer 404 after.
  for (let i = 0; i < 5; i++) if ((await reader.read()).done) break;
  expect((await req(app, `/actions/${a.id}/live.mjpeg`)).status).toBe(404);
  expect((await req(app, `/actions/${a.id}/live`)).status).toBe(404);
});

test("live screen: the step line is read beside the video, stripped to printable text", async () => {
  const got: string[] = [];
  await runTask({ id: 8, urls: ["http://fixture.test/"], ...dirs(), docker: fakeDocker({ task: "hang" }).d, stream: fakeStream([JPEG, JPEG, JPEG]),
    signal: AbortSignal.timeout(1300), onState: () => {}, onFrame: (_, step) => got.push(step) });
  expect(got.length).toBeGreaterThan(0);
  expect(got).toContain("Opening http://fixture.test/ (1 of 1)<b>");
});

test("the pilot bot's prompt says it has a computer and where its card is approved; others' does not", async () => {
  const { store, tech, chief, app } = setup();
  expect(systemPrompt(store, tech.id)).not.toContain("pilot computer");
  await req(app, "/settings", { method: "POST", body: { computerBot: tech.id, computerEnabled: true } });
  const p = systemPrompt(store, tech.id);
  expect(p).toContain("You have a pilot computer");
  expect(p).toContain("right here in this chat (not on the kaizen board)");
  expect(p).toContain("example.org");
  expect(systemPrompt(store, chief.id)).not.toContain("pilot computer");
});
