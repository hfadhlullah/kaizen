// Download the pinned Bun for this OS into build/bun-<arch>, checked against Bun's
// published SHA-256 sums. Arch defaults to this machine; KAIZEN_BUN_ARCHS=x64,arm64
// fetches both (one macOS runner builds both arches).
import { chmodSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const VERSION = "1.4.4";
const os = { linux: "linux", darwin: "darwin", win32: "windows" }[process.platform as string];
const base = `https://github.com/oven-sh/bun/releases/download/bun-v${VERSION}`;
const exe = os === "windows" ? "bun.exe" : "bun";
// GitHub's release downloads answer 5xx now and then; an error page must never be
// hashed as the zip (v1.76.0 failed that way), so a non-2xx answer is retried, then thrown.
async function get(url: string): Promise<Response> {
  for (let i = 1; ; i++) {
    const r = await fetch(url).catch((e) => e as Error);
    if (r instanceof Response && r.ok) return r;
    const why = r instanceof Response ? `HTTP ${r.status}` : r.message;
    if (i === 5) throw new Error(`could not download ${url}: ${why}`);
    console.log(`${url}: ${why}, retrying in ${15 * i}s`);
    await Bun.sleep(15_000 * i);
  }
}
const sums = await (await get(`${base}/SHASUMS256.txt`)).text();

for (const arch of (process.env.KAIZEN_BUN_ARCHS ?? process.arch).split(",")) {
  const name = `bun-${os}-${{ x64: "x64", arm64: "aarch64" }[arch]}`;
  const out = join(import.meta.dir, "..", "build", `bun-${arch}`);
  const target = `${os}-${arch}`;
  const want = sums.split("\n").find((l) => l.endsWith(` ${name}.zip`))?.split(" ")[0];
  if (!want) throw new Error(`no checksum for ${name}.zip in bun ${VERSION}`);
  const zip = new Uint8Array(await (await get(`${base}/${name}.zip`)).arrayBuffer());
  const got = createHash("sha256").update(zip).digest("hex");
  if (got !== want) throw new Error(`checksum mismatch for ${name}.zip: ${got} != ${want}`);
  
  const tmp = join(import.meta.dir, "..", "build", "bun-tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  await Bun.write(join(tmp, "bun.zip"), zip);
  // unzip on Linux (GNU tar cannot read zip), bsdtar on macOS, and on Windows the
  // system tar.exe by full path: Git Bash puts its GNU tar first on PATH.
  const x = process.platform === "linux" ? ["unzip", "-q", "bun.zip"]
    : process.platform === "win32" ? [join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), "-xf", "bun.zip"]
    : ["tar", "-xf", "bun.zip"];
  if (Bun.spawnSync(x, { cwd: tmp }).exitCode !== 0) throw new Error(`could not extract ${name}.zip with ${x[0]}`);
  const dir = readdirSync(tmp).find((d) => d.startsWith("bun-"))!;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  renameSync(join(tmp, dir, exe), join(out, exe));
  if (exe === "bun") chmodSync(join(out, exe), 0o755);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`bun ${VERSION} (${target}) verified into ${out}`);
  }
