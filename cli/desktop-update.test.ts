// Updating the desktop app from a page on another computer: the board only asks when the app said it has a newer
// version downloaded and can install it by itself (not on macOS), and the request it leaves is what the app reads.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { desktopStatus, installable, newerVersion, requestFile, requestInstall, statusFile } from "./desktop-update.ts";

const home = () => mkdtempSync(join(tmpdir(), "kz-desk-upd-"));
const status = (h: string, s: unknown) => { mkdirSync(join(h, ".kaizen", "desktop"), { recursive: true }); writeFileSync(statusFile(h), JSON.stringify(s)); };

test("newerVersion compares release numbers", () => {
  expect(newerVersion("1.89.6", "1.89.5")).toBe(true);
  expect(newerVersion("1.90.0", "1.89.10")).toBe(true);
  expect(newerVersion("1.89.5", "1.89.5")).toBe(false);
  expect(newerVersion("1.89.4", "1.89.5")).toBe(false);
});

test("no status, nothing downloaded, an older download, or a Mac: no install is asked for", () => {
  const h = home();
  expect(requestInstall(h)).toMatchObject({ status: 409, error: expect.stringContaining("Restart the app") });
  status(h, { app: "1.89.5", downloaded: null, platform: "linux" });
  expect(installable(desktopStatus(h))).toBe(false);
  expect(requestInstall(h)).toMatchObject({ status: 409, error: expect.stringContaining("not downloaded") });
  status(h, { app: "1.89.5", downloaded: "1.89.5", platform: "linux" });
  expect(requestInstall(h)).toMatchObject({ status: 409 });
  status(h, { app: "1.89.5", downloaded: "1.89.6", platform: "darwin" });
  expect(installable(desktopStatus(h))).toBe(false);
  expect(requestInstall(h)).toMatchObject({ status: 409, error: expect.stringContaining("Mac") });
});

test("a newer download on Linux or Windows: the request names it and carries the time", () => {
  for (const platform of ["linux", "win32"]) {
    const h = home();
    status(h, { app: "1.89.5", downloaded: "1.89.6", platform });
    expect(installable(desktopStatus(h))).toBe(true);
    expect(requestInstall(h, 1234)).toEqual({ ok: true, version: "1.89.6" });
    expect(JSON.parse(readFileSync(requestFile(h), "utf8"))).toEqual({ version: "1.89.6", at: 1234 });
  }
});
