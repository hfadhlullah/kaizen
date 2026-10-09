// The computer pilot: one disposable local Docker sandbox per approved card.
// Only the sandbox runs untrusted pages. Its network is internal; the one way out is
// the pilot proxy (bot/pilot/proxy/addon.py), which allows GET/HEAD to allowlisted
// test pages only. Everything a task makes is checked and copied out, then every
// container and the network are removed and that is confirmed. bot/pilot/README.md
// says how to build the images.
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import POLICY from "../pilot/proxy/allowlist.json";

export type Docker = (args: string[], opts?: { timeoutMs?: number; maxBytes?: number; signal?: AbortSignal }) =>
  Promise<{ code: number; out: Uint8Array; err: string; truncated: boolean }>;
export type State = "starting" | "running" | "stopping" | "stopped" | "error";
export type Artifact = { name: string; bytes: number; type: string };
export type Outcome = {
  ok: boolean; error?: string; artifacts: Artifact[];
  ms: { start?: number; task?: number; export?: number; total: number };
  usage?: { memPeakMb: number; cpuSec: number }; proxy?: { allowed: number; denied: number }; clean: boolean;
};

export const LIMITS = {
  cpus: "1", memory: "768m", pids: "256", tmpfs: "200m",
  taskMs: 3 * 60_000, lifeMs: 10 * 60_000,
  fileBytes: 5 * 1024 * 1024, files: 10, totalBytes: 20 * 1024 * 1024, urls: 3,
};
export const IMAGES = { sandbox: "kz-pilot-sandbox", proxy: "kz-pilot-proxy", fixture: "kz-pilot-fixture", scanner: "clamav/clamav:stable" };
export const HOSTS = new Set([...POLICY.hosts, ...POLICY.fixtures]);

// The real docker CLI, as argv: never a shell string. Output is capped while it streams.
export const docker: Docker = async (args, o = {}) => {
  let p;
  try { p = Bun.spawn(["docker", ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true }); }
  catch { return { code: 127, out: new Uint8Array(), err: "docker is not installed", truncated: false }; }
  const kill = () => p.kill();
  const timer = o.timeoutMs ? setTimeout(kill, o.timeoutMs) : null;
  o.signal?.addEventListener("abort", kill);
  const chunks: Uint8Array[] = [];
  let n = 0, truncated = false;
  for await (const c of p.stdout) {
    if (o.maxBytes && n + c.length > o.maxBytes) { truncated = true; chunks.push(c.subarray(0, o.maxBytes - n)); kill(); break; }
    chunks.push(c); n += c.length;
  }
  const err = (await new Response(p.stderr).text()).slice(0, 2000);
  const code = await p.exited;
  if (timer) clearTimeout(timer);
  o.signal?.removeEventListener("abort", kill);
  return { code, out: Buffer.concat(chunks), err, truncated };
};

// null when every URL is a web URL on the pilot allowlist, else why not.
export function checkUrls(urls: unknown): string | null {
  if (!Array.isArray(urls) || !urls.length || urls.length > LIMITS.urls) return `give 1 to ${LIMITS.urls} URLs`;
  for (const u of urls) {
    let url: URL;
    try { url = new URL(String(u)); } catch { return `not a URL: ${String(u).slice(0, 100)}`; }
    if (url.protocol !== "https:" && url.protocol !== "http:") return `not a web URL: ${url.href}`;
    if (url.username || url.password) return "URLs with credentials are not allowed";
    if (!HOSTS.has(url.hostname)) return `${url.hostname} is not on the pilot allowlist (${[...HOSTS].join(", ")})`;
  }
  return null;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Type by content, not by name; null when the file is not allowed out.
export function typeOf(name: string, b: Uint8Array): string | null {
  if (name.endsWith(".png")) return PNG.every((x, i) => b[i] === x) ? "image/png" : null;
  if (name.endsWith(".csv")) {
    if (b.includes(0)) return null;
    try { new TextDecoder("utf-8", { fatal: true }).decode(b); return "text/csv"; } catch { return null; }
  }
  return null;
}

const text = (b: Uint8Array) => new TextDecoder().decode(b);
const names = (id: number) => ({ net: `kz-${id}-net`, px: `kz-${id}-px`, fx: `kz-${id}-fx`, sb: `kz-${id}-sb` });

// Remove everything labelled for this card, then confirm nothing is left.
export async function destroy(d: Docker, id: number): Promise<boolean> {
  const n = names(id);
  await d(["rm", "-f", n.sb, n.px, n.fx], { timeoutMs: 30_000 });
  await d(["network", "rm", n.net], { timeoutMs: 15_000 });
  const ps = await d(["ps", "-aq", "--filter", `label=kaizen.card=${id}`], { timeoutMs: 15_000 });
  const nets = await d(["network", "ls", "-q", "--filter", `label=kaizen.card=${id}`], { timeoutMs: 15_000 });
  return ps.code === 0 && nets.code === 0 && !text(ps.out).trim() && !text(nets.out).trim();
}

export async function runTask(o: {
  id: number; urls: string[]; dir: string; logDir: string; onState: (s: State, note?: string) => void;
  onFrame?: (jpeg: Uint8Array, step: string) => void; // the sandbox's screen as video frames, with the current step, while the task runs
  stream?: Stream;
  docker?: Docker; signal?: AbortSignal; taskMs?: number; now?: () => number;
  probes?: boolean; // run bot/pilot/probes.sh in place of the task: isolation evidence, no export
}): Promise<Outcome> {
  const d = o.docker ?? docker, now = o.now ?? Date.now, t0 = now(), n = names(o.id);
  const ms: Outcome["ms"] = { total: 0 };
  const artifacts: Artifact[] = [];
  let usage: Outcome["usage"], proxy: Outcome["proxy"];
  const label = ["--label", "kaizen.sandbox=1", "--label", `kaizen.card=${o.id}`, "--label", `kaizen.expires=${Math.floor((t0 + LIMITS.lifeMs) / 1000)}`];
  const cancelled = () => o.signal?.aborted;
  // Each step throws its own user-facing message: what failed, and what to do.
  const must = async (args: string[], why: string, opts?: Parameters<Docker>[1]) => {
    if (cancelled()) throw new Error("cancelled");
    const r = await d(args, { timeoutMs: 60_000, signal: o.signal, ...opts });
    if (cancelled()) throw new Error("cancelled");
    if (r.code !== 0) throw new Error(`${why}: ${r.err.trim().split("\n").pop() || `exit ${r.code}`}`);
    return r;
  };
  let error: string | undefined, last: State | undefined;
  const state = (s: State, note?: string) => { if (s !== last) o.onState((last = s), note); };
  try {
    const bad = checkUrls(o.urls);
    if (bad) throw new Error(`refused: ${bad}`);
    state("starting");
    await must(["version", "--format", "{{.Server.Version}}"], "Docker is not running (start Docker and try again)", { timeoutMs: 10_000 });
    await must(["network", "create", "--internal", ...label, n.net], "could not create the sandbox network");
    await must(["run", "-d", "--name", n.fx, ...label, "--network", n.net, "--network-alias", "fixture.test", "--read-only",
      "--tmpfs", "/var/cache/nginx", "--tmpfs", "/run", "--memory", "64m", "--cap-drop", "ALL",
      "--cap-add", "NET_BIND_SERVICE", "--cap-add", "SETUID", "--cap-add", "SETGID", "--cap-add", "CHOWN", IMAGES.fixture],
      `could not start the test site (run bot/pilot/setup.sh to build ${IMAGES.fixture})`);
    await must(["run", "-d", "--name", n.px, ...label, "--network", "bridge", "--read-only", "--tmpfs", "/tmp", "--memory", "256m",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "-e", `TASK=${o.id}`, IMAGES.proxy],
      `could not start the egress proxy (run bot/pilot/setup.sh to build ${IMAGES.proxy})`);
    await must(["network", "connect", "--alias", "proxy", n.net, n.px], "could not attach the proxy to the sandbox network");
    await must(["run", "-d", "--name", n.sb, ...label, "--network", n.net, "--user", "1000:1000", "--read-only",
      "--tmpfs", `/work:size=${LIMITS.tmpfs},uid=1000,mode=0700`, "--tmpfs", `/tmp:size=${LIMITS.tmpfs},uid=1000,mode=0700`,
      "--cpus", LIMITS.cpus, "--memory", LIMITS.memory, "--memory-swap", LIMITS.memory, "--pids-limit", LIMITS.pids,
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
      IMAGES.sandbox, "sleep", String(LIMITS.lifeMs / 1000)], `could not start the sandbox (run bot/pilot/setup.sh to build ${IMAGES.sandbox})`);
    ms.start = now() - t0;

    state("running");
    const t1 = now(), limit = o.taskMs ?? LIMITS.taskMs;
    if (o.probes) {
      const p = await d(["exec", n.sb, "/opt/probes.sh"], { timeoutMs: 5 * 60_000, signal: o.signal, maxBytes: 64_000 });
      mkdirSync(o.logDir, { recursive: true });
      writeFileSync(join(o.logDir, `${o.id}-probes.txt`), p.out);
      ms.task = now() - t1;
      if (p.code !== 0) throw new Error(`${p.code} isolation probe(s) failed: ${text(p.out).split("\n").filter((l) => l.startsWith("FAIL")).join("; ")}`);
      throw null; // probes done: nothing to export
    }
    const live = o.onFrame ? watchScreen(d, o.stream ?? dockerStream, n.sb, o.onFrame) : null;
    const run = await d(["exec", n.sb, "/opt/task.sh", ...o.urls], { timeoutMs: limit, signal: o.signal, maxBytes: 64_000 })
      .finally(() => live?.stop());
    ms.task = now() - t1;
    if (cancelled()) throw new Error("cancelled");
    if (ms.task >= limit) throw new Error(`timed out after ${limit / 1000} s (the pages took too long; try fewer URLs)`);
    if (run.code !== 0) throw new Error(`the task failed: ${(run.err.trim() || text(run.out).trim()).split("\n").pop() || `exit ${run.code}`}`);

    state("stopping");
    const t2 = now();
    const u = await d(["exec", n.sb, "sh", "-c", "cat /sys/fs/cgroup/memory.peak; grep usage_usec /sys/fs/cgroup/cpu.stat"], { timeoutMs: 10_000 });
    const nums = text(u.out).match(/\d+/g)?.map(Number) ?? [];
    if (nums.length >= 2) usage = { memPeakMb: Math.round(nums[0]! / 1048576), cpuSec: Math.round(nums[1]! / 1e5) / 10 };
    await exportFiles(d, o, n.sb, artifacts);
    ms.export = now() - t2;
  } catch (e) {
    if (e) error = (e as Error).message;
  } finally {
    // The proxy's log is kept host-side whatever happened; then everything goes.
    try {
      const log = await d(["logs", n.px], { timeoutMs: 15_000, maxBytes: 2_000_000 });
      if (log.code === 0) {
        mkdirSync(o.logDir, { recursive: true });
        writeFileSync(join(o.logDir, `${o.id}.jsonl`), log.out);
        const lines = text(log.out).split("\n");
        proxy = { allowed: lines.filter((l) => l.includes('"decision": "ALLOW"')).length, denied: lines.filter((l) => l.includes('"decision": "DENY"')).length };
      }
    } catch { /* a missing log is not worth failing cleanup over */ }
  }
  if (error === "cancelled") error = "cancelled by you; the sandbox was removed";
  if (last) state("stopping");
  const clean = await destroy(d, o.id).catch(() => false);
  ms.total = now() - t0;
  if (!clean) error = `${error ? `${error}; ` : ""}delete not confirmed: something labelled kaizen.card=${o.id} is still there (the sweeper will retry within a minute)`;
  state(error ? "error" : "stopped", error);
  return { ok: !error, error, artifacts, ms, usage, proxy, clean };
}

// The live view: a continuous video of the sandbox's screen. ffmpeg inside the sandbox
// encodes its virtual screen as a stream of JPEGs (multipart, 8 a second) on stdout; each
// frame is cut out by its declared length, capped in size and must be a JPEG by its first
// bytes, else dropped. Frames are shown, never stored or exported, so they skip the virus
// scan the files get. The step line is read once a second beside it.
export const FRAME_BYTES = 600_000;
export const FPS = 8;
export type Stream = (args: string[], onData: (chunk: Uint8Array) => void, signal: AbortSignal) => Promise<number>;
export const dockerStream: Stream = async (args, onData, signal) => {
  let p;
  try { p = Bun.spawn(["docker", ...args], { stdin: "ignore", stdout: "pipe", stderr: "ignore", windowsHide: true }); } catch { return 127; }
  const kill = () => p.kill();
  signal.addEventListener("abort", kill);
  try { for await (const c of p.stdout) onData(c); } catch { /* killed */ }
  signal.removeEventListener("abort", kill);
  return p.exited;
};

// Cuts JPEG frames out of ffmpeg's mpjpeg stream ("Content-length: N" header, blank line, N bytes).
export function frameCutter(onJpeg: (jpeg: Uint8Array) => void) {
  let buf = new Uint8Array(0);
  const dec = new TextDecoder("latin1");
  return (chunk: Uint8Array) => {
    const next = new Uint8Array(buf.length + chunk.length);
    next.set(buf); next.set(chunk, buf.length); buf = next;
    for (;;) {
      const m = /Content-length:\s*(\d+)\r\n\r\n/i.exec(dec.decode(buf));
      if (!m) { if (buf.length > 400) buf = buf.slice(buf.length - 200); return; } // keep a split header's start
      const start = m.index + m[0].length, len = Number(m[1]);
      if (len > FRAME_BYTES) { buf = new Uint8Array(0); return; } // over the cap: drop and resync
      if (buf.length < start + len) return;
      const jpeg = buf.slice(start, start + len);
      buf = buf.subarray(start + len);
      if (jpeg[0] === 0xff && jpeg[1] === 0xd8 && jpeg[2] === 0xff) onJpeg(jpeg);
    }
  };
}

function watchScreen(d: Docker, stream: Stream, sb: string, onFrame: (jpeg: Uint8Array, step: string) => void) {
  const ctl = new AbortController();
  let step = "";
  (async () => {
    while (!ctl.signal.aborted) {
      const s = await d(["exec", sb, "cat", "/tmp/live/step.txt"], { timeoutMs: 5000, maxBytes: 300 }).catch(() => null);
      // The step is text from the sandbox: printable characters only, short, shown as text never HTML.
      if (s?.code === 0) step = text(s.out).replace(/[^\x20-\x7e]/g, "").slice(0, 200);
      await Bun.sleep(1000);
    }
  })();
  (async () => {
    const cut = frameCutter((jpeg) => { if (!ctl.signal.aborted) onFrame(jpeg, step); });
    // The screen exists only once the task has started Xvfb: retry until the stream holds.
    while (!ctl.signal.aborted) {
      await stream(["exec", sb, "ffmpeg", "-loglevel", "quiet", "-f", "x11grab", "-framerate", String(FPS), "-video_size", "1280x800",
        "-i", ":99", "-q:v", "6", "-f", "mpjpeg", "-"], cut, ctl.signal).catch(() => 0);
      if (!ctl.signal.aborted) await Bun.sleep(300);
    }
  })();
  return { stop: () => ctl.abort() };
}

// Bounded, typed and scanned: files land in a staging folder, are scanned there, and
// only then move to the card's folder. Anything refused stops the export with a reason.
async function exportFiles(d: Docker, o: { id: number; dir: string; signal?: AbortSignal }, sb: string, artifacts: Artifact[]) {
  const ls = await d(["exec", sb, "ls", "-1", "/work/out"], { timeoutMs: 10_000, maxBytes: 10_000 });
  if (ls.code !== 0) throw new Error("export failed: the task left no /work/out folder");
  const files = text(ls.out).split("\n").filter(Boolean);
  if (!files.length) throw new Error("export failed: the task produced no files");
  if (files.length > LIMITS.files) throw new Error(`export refused: ${files.length} files, over the ${LIMITS.files}-file cap`);
  const stage = join(o.dir, `.staging-${o.id}`), final = join(o.dir, String(o.id));
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  try {
    let total = 0;
    for (const f of files) {
      if (!/^[\w.-]{1,80}$/.test(f) || f.startsWith(".")) throw new Error(`export refused: bad file name ${JSON.stringify(f.slice(0, 80))}`);
      const r = await d(["exec", sb, "cat", `/work/out/${f}`], { timeoutMs: 30_000, maxBytes: LIMITS.fileBytes + 1, signal: o.signal });
      if (r.truncated || r.out.length > LIMITS.fileBytes) throw new Error(`export refused: ${f} is over the ${LIMITS.fileBytes / 1048576} MB cap`);
      if (r.code !== 0) throw new Error(`export failed: ${f} could not be read`);
      const type = typeOf(f, r.out);
      if (!type) throw new Error(`export refused: ${f} is not a PNG or CSV by its content`);
      total += r.out.length;
      if (total > LIMITS.totalBytes) throw new Error(`export refused: files total over ${LIMITS.totalBytes / 1048576} MB`);
      writeFileSync(join(stage, f), r.out);
      artifacts.push({ name: f, bytes: r.out.length, type });
    }
    // ponytail: clamscan loads its database on every task (~10-20 s); a long-lived clamd if that hurts.
    const scan = await d(["run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--tmpfs", "/tmp", "--entrypoint", "clamscan",
      "-v", `${stage}:/scan:ro`, IMAGES.scanner, "--no-summary", "-r", "/scan"], { timeoutMs: 180_000, maxBytes: 100_000 });
    if (scan.code === 1) throw new Error(`export refused: the virus scan flagged ${text(scan.out).split("\n").filter((l) => l.endsWith("FOUND")).map((l) => l.split("/").pop()).join(", ")}`);
    if (scan.code !== 0) throw new Error(`export refused: the virus scan did not run (${scan.err.trim().split("\n").pop() || `exit ${scan.code}`}; run docker pull ${IMAGES.scanner})`);
    rmSync(final, { recursive: true, force: true });
    renameSync(stage, final);
  } catch (e) {
    artifacts.length = 0;
    throw e;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

// Removes pilot sandboxes past their expiry, or whose card is no longer running,
// whoever started them. Returns what it removed.
export async function sweep(live: (card: number) => boolean, d: Docker = docker, now = Date.now()): Promise<string[]> {
  const gone: string[] = [];
  const due = (card: string, exp: string) => Number(exp || 0) * 1000 <= now || !live(Number(card) || 0);
  const ps = await d(["ps", "-a", "--filter", "label=kaizen.sandbox=1", "--format", '{{.Names}}|{{.Label "kaizen.card"}}|{{.Label "kaizen.expires"}}'], { timeoutMs: 15_000 });
  for (const l of text(ps.out).split("\n").filter(Boolean)) {
    const [name, card, exp] = l.split("|");
    if (due(card!, exp!) && (await d(["rm", "-f", name!], { timeoutMs: 30_000 })).code === 0) gone.push(name!);
  }
  const nets = await d(["network", "ls", "--filter", "label=kaizen.sandbox=1", "--format", '{{.Name}}|{{.Label "kaizen.card"}}|{{.Label "kaizen.expires"}}'], { timeoutMs: 15_000 });
  for (const l of text(nets.out).split("\n").filter(Boolean)) {
    const [name, card, exp] = l.split("|");
    if (due(card!, exp!) && (await d(["network", "rm", name!], { timeoutMs: 15_000 })).code === 0) gone.push(name!);
  }
  return gone;
}
