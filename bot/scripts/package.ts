// `bun run build`: Kaizen Bot as an app per OS, written to dist/.
//   macOS    Kaizen-Bot-macos-<arch>.dmg   Kaizen Bot.app beside an Applications shortcut
//   Windows  Kaizen-Bot-windows-x64.exe    no console; installs itself on first open
//   Linux    kaizen-bot-linux-<arch>       the plain binary, as before
import { $ } from "bun";
import { join } from "node:path";
import { mkdirSync, rmSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");
const version = JSON.parse(readFileSync(join(root, "../package.json"), "utf8")).version as string;
const flags = ["--compile", "--minify", "--no-compile-autoload-dotenv", "--no-compile-autoload-bunfig"];
const compile = (target: string, out: string, extra: string[] = []) =>
  $`bun build ${flags} ${extra} --target=bun-${target} ${join(root, "src/server.ts")} --outfile ${out}`.cwd(root);

// An .icns is a header and typed chunks; one ic10 (1024px PNG) covers every size macOS draws.
export function icns(png: Uint8Array) {
  const out = new Uint8Array(16 + png.length);
  const v = new DataView(out.buffer);
  out.set(new TextEncoder().encode("icns"), 0); v.setUint32(4, out.length);
  out.set(new TextEncoder().encode("ic10"), 8); v.setUint32(12, 8 + png.length);
  out.set(png, 16);
  return out;
}

const plist = (v: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Kaizen Bot</string>
  <key>CFBundleDisplayName</key><string>Kaizen Bot</string>
  <key>CFBundleIdentifier</key><string>dev.kaizen.bot</string>
  <key>CFBundleExecutable</key><string>kaizen-bot</string>
  <key>CFBundleIconFile</key><string>kaizen</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${v}</string>
  <key>CFBundleVersion</key><string>${v}</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <!-- The chat opens in a browser app window; this process has no window of its own to put in the Dock. -->
  <key>LSUIElement</key><true/>
</dict>
</plist>
`;

if (import.meta.main) {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  const hasMkisofs = !!Bun.which("mkisofs");

  for (const arch of ["x64", "arm64"]) await compile(`linux-${arch}`, join(dist, `kaizen-bot-linux-${arch}`));

  // Bun sets the exe's icon, title and version only when building on Windows; the Start
  // menu shortcut carries the icon instead.
  await compile("windows-x64", join(dist, "Kaizen-Bot-windows-x64.exe"), ["--windows-hide-console"]);

  for (const arch of ["arm64", "x64"]) {
    const stage = join(dist, `mac-${arch}`);
    const app = join(stage, "Kaizen Bot.app/Contents");
    mkdirSync(join(app, "MacOS"), { recursive: true });
    mkdirSync(join(app, "Resources"), { recursive: true });
    await compile(`darwin-${arch}`, join(app, "MacOS/kaizen-bot"));
    writeFileSync(join(app, "Info.plist"), plist(version));
    writeFileSync(join(app, "Resources/kaizen.icns"), icns(readFileSync(join(root, "../assets/kaizen-logo.png"))));
    const name = `Kaizen-Bot-macos-${arch}`;
    if (hasMkisofs) {
      symlinkSync("/Applications", join(stage, "Applications"));
      // Rock Ridge keeps the exec bit and the Applications symlink; macOS mounts it like any .dmg.
      await $`mkisofs -quiet -V ${"Kaizen Bot"} -r -l -D -o ${join(dist, `${name}.dmg`)} ${stage}`;
    } else {
      await $`zip -qry ${join(dist, `${name}.zip`)} ${"Kaizen Bot.app"}`.cwd(stage);
      console.log(`mkisofs not found (package cdrtools): wrote ${name}.zip instead of a .dmg`);
    }
  }
  console.log(`Kaizen Bot ${version} apps in ${dist}`);
}
