import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { desktopEntry } from "./appimage.ts";

test("desktopEntry writes a menu entry that runs this AppImage, and its icon", () => {
  const home = join(tmpdir(), `kz-appimage-${Math.random().toString(36).slice(2)}`);
  mkdirSync(home, { recursive: true });
  const icon = join(home, "icon.png");
  writeFileSync(icon, "png");
  const saved = process.env.XDG_DATA_HOME;
  delete process.env.XDG_DATA_HOME;
  const file = desktopEntry('/home/a b/Apps/kaizen-desktop-1.66.0-linux-x86_64.AppImage', icon, home);
  if (saved !== undefined) process.env.XDG_DATA_HOME = saved;
  const text = readFileSync(file, "utf8");
  expect(file).toBe(join(home, ".local/share/applications/kaizen-desktop.desktop"));
  expect(text).toContain('Exec="/home/a b/Apps/kaizen-desktop-1.66.0-linux-x86_64.AppImage" %U');
  expect(text).toContain("Icon=kaizen-desktop");
  expect(readFileSync(join(home, ".local/share/icons/hicolor/512x512/apps/kaizen-desktop.png"), "utf8")).toBe("png");
});
