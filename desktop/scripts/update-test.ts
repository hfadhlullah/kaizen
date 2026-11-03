// N to N+1 auto-update test (Orca runs one per OS in CI; this is ours).
// Builds the app twice (0.0.1 and 0.0.2) with a local generic feed, serves the
// second, starts the first in update-test mode, and checks that afterwards the
// installed app reports 0.0.2. Linux (AppImage) and Windows (NSIS); an unsigned
// macOS build cannot self-update, so it is not tested. Run `bun run stage` and
// `bun run compile` first.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rangeResponse } from "./range.ts";

const here = join(import.meta.dir, "..");
const port = 8123;
const feed = `http://127.0.0.1:${port}/`;
const win = process.platform === "win32";
if (!win && process.platform !== "linux") { console.log("update test: Linux and Windows only"); process.exit(0); }
const work = join(process.env.RUNNER_TEMP ?? tmpdir(), "kz-update-test");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const out = join(work, "out.txt");
const home = join(work, "home");
mkdirSync(home);

function build(version: string) {
  const dir = join(work, `v${version}`);
  // bun links .exe shims on Windows, npm .cmd ones; take whichever is there.
  const bin = join(here, "node_modules", ".bin", "electron-builder");
  const builder = win ? [".exe", ".cmd"].map((e) => bin + e).find((f) => existsSync(f)) ?? bin + ".exe" : bin;
  const r = Bun.spawnSync([builder, "--config", "electron-builder.config.cjs", "--publish", "never", win ? "--win" : "--linux", win ? "nsis" : "AppImage", "--x64",
    `-c.extraMetadata.version=${version}`, "-c.extraMetadata.kaizenUpdateTest=true", `-c.directories.output=${dir}`], { cwd: here, env: { ...process.env, KAIZEN_UPDATE_TEST_FEED: feed }, stdout: "inherit", stderr: "inherit" });
  if (r.exitCode !== 0) throw new Error(`build ${version} failed`);
  return dir;
}

async function run(exe: string, env: Record<string, string>, timeoutMs = 180000) {
  const p = Bun.spawn(win ? [exe] : [exe, "--no-sandbox"], { env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_CACHE_HOME: join(home, ".cache"), KAIZEN_DESKTOP_OUT: out, ...env }, stdout: "inherit", stderr: "inherit" });
  const t = setTimeout(() => p.kill(), timeoutMs);
  await p.exited;
  clearTimeout(t);
}

const lines = () => (existsSync(out) ? readFileSync(out, "utf8") : "");
const fail = (why: string) => { console.error(`update test FAILED: ${why}\n--- app said ---\n${lines()}`); process.exit(1); };

const n = build("0.0.1");
const n1 = build("0.0.2");
// Serves byte ranges, one or several (multipart/byteranges), as GitHub's CDN does,
// so the differential download (blockmap) is what gets tested, not a fallback.
let ranged = 0;
const server = Bun.serve({ port, hostname: "127.0.0.1", fetch: async (req) => {
  const f = join(n1, decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, ""));
  if (!existsSync(f)) return new Response("not found", { status: 404 });
  const r = await rangeResponse(Bun.file(f), req.headers.get("range"));
  if (r.status === 206) ranged++;
  if (process.env.KZ_DEBUG) console.log(`[feed] ${req.headers.get("range")?.split(",").length ?? 0} ranges -> ${r.status} ${r.headers.get("content-type")}`);
  return r;
} });

let exe: string;
if (win) {
  const setup = readdirSync(n).find((f) => f.endsWith(".exe"))!;
  if (Bun.spawnSync([join(n, setup), "/S"]).exitCode !== 0) fail("installing 0.0.1 failed");
  const base = join(process.env.LOCALAPPDATA!, "Programs");
  const dir = readdirSync(base).find((d) => existsSync(join(base, d, "kaizen-desktop.exe")));
  if (!dir) fail(`no kaizen-desktop.exe under ${base}`);
  exe = join(base, dir!, "kaizen-desktop.exe");
} else {
  exe = join(work, "Kaizen.AppImage");
  copyFileSync(join(n, readdirSync(n).find((f) => f.endsWith(".AppImage"))!), exe);
}

await run(exe, { KAIZEN_DESKTOP_SMOKE: "1" });
if (!/version=0\.0\.1/.test(lines())) fail("0.0.1 did not start");
await run(exe, { KAIZEN_DESKTOP_TEST_FEED: feed });
if (!/update downloaded 0\.0\.2/.test(lines())) fail("0.0.1 did not download 0.0.2");

if (/fallback to full download/.test(lines())) fail("the differential download failed and fell back to a full one");
if (!ranged) fail("the updater never asked for a byte range: the differential download was not exercised");

// The installer runs after the app quits. On Windows, starting the app while the
// silent NSIS installer still replaces files can break the install, so wait for
// every installer process (the 0.0.2 setup and its uninstaller) to end first.
if (win) {
  const setup = readdirSync(n1).find((f) => f.endsWith(".exe"))!;
  for (let i = 0; i < 60; i++) {
    // Exact image names: the setup, and the copies NSIS runs the old uninstaller as.
    const names = new Set(Bun.spawnSync(["tasklist", "/FO", "CSV", "/NH"]).stdout.toString().toLowerCase().split("\n").map((l) => l.split(",")[0]?.replace(/"/g, "").trim()));
    if (![setup.toLowerCase(), "un_a.exe", "au_.exe"].some((n) => names.has(n))) break;
    await Bun.sleep(3000);
  }
}
for (let i = 0; i < 24; i++) {
  await Bun.sleep(5000);
  rmSync(out, { force: true });
  await run(exe, { KAIZEN_DESKTOP_SMOKE: "1" }, 120000);
  if (/version=0\.0\.2/.test(lines())) { console.log("update test passed: 0.0.1 updated itself to 0.0.2"); server.stop(); process.exit(0); }
}
fail("the installed app still is not 0.0.2");
