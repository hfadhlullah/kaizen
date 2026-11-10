// An AppImage is one file with no installer, so it adds itself to the app menu:
// ~/.local/share/applications/kaizen-desktop.desktop pointing at this file, and the
// icon beside it. Rewritten on every launch and after each update, because the
// updater renames the file when its name carries the version.
//
// The entry runs the AppImage extracted (APPIMAGE_EXTRACT_AND_RUN) instead of from its
// FUSE mount. When that mount goes away (quit, poweroff) the Electron children still
// alive fault on a page not yet read and die with SIGBUS (issue #77); extracted files
// are plain files, so nothing can pull them from under a running process.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function desktopEntry(appImage: string, icon: string, home = homedir()) {
  const data = process.env.XDG_DATA_HOME || join(home, ".local", "share");
  const iconDir = join(data, "icons", "hicolor", "512x512", "apps");
  mkdirSync(iconDir, { recursive: true });
  copyFileSync(icon, join(iconDir, "kaizen-desktop.png"));
  const dir = join(data, "applications");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "kaizen-desktop.desktop");
  // Exec quotes the path: the spec's quoting, with \ " ` $ escaped.
  const exec = `"${appImage.replace(/[\\"`$]/g, (c) => `\\${c}`)}"`;
  writeFileSync(file, [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Kaizen",
    "Comment=The kaizen board in its own window",
    `Exec=env APPIMAGE_EXTRACT_AND_RUN=1 ${exec} %U`,
    "Icon=kaizen-desktop",
    "Terminal=false",
    "Categories=Development;",
    "StartupWMClass=kaizen",
    "",
  ].join("\n"));
  return file;
}
