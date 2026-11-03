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
const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text();

for (const arch of (process.env.KAIZEN_BUN_ARCHS ?? process.arch).split(",")) {
  const name = `bun-${os}-${{ x64: "x64", arm64: "aarch64" }[arch]}`;
  const out = join(import.meta.dir, "..", "build", `bun-${arch}`);
  const target = `${os}-${arch}`;
  const want = sums.split("\n").find((l) => l.endsWith(` ${name}.zip`))?.split(" ")[0];
  if (!want) throw new Error(`no checksum for ${name}.zip in bun ${VERSION}`);
  const zip = new Uint8Array(await (await fetch(`${base}/${name}.zip`)).arrayBuffer());
  const got = createHash("sha256").update(zip).digest("hex");
  if (got !== want) throw new Error(`checksum mismatch for ${name}.zip: ${got} != ${want}`);
  
  const tmp = join(import.meta.dir, "..", "build", "bun-tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  await Bun.write(join(tmp, "bun.zip"), zip);
  // unzip on Linux (GNU tar cannot read zip); bsdtar on macOS and Windows reads it.
  const x = process.platform === "linux" ? ["unzip", "-q", "bun.zip"] : ["tar", "-xf", "bun.zip"];
  if (Bun.spawnSync(x, { cwd: tmp }).exitCode !== 0) throw new Error(`could not extract ${name}.zip with ${x[0]}`);
  const dir = readdirSync(tmp).find((d) => d.startsWith("bun-"))!;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  renameSync(join(tmp, dir, exe), join(out, exe));
  if (exe === "bun") chmodSync(join(out, exe), 0o755);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`bun ${VERSION} (${target}) verified into ${out}`);
  }
