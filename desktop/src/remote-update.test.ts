// The app's side of updating from another computer: what it writes for the board, and which requests it acts on.
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remoteDir, STALE_MS, takeRequest, writeStatus } from "./remote-update";

const home = () => mkdtempSync(join(tmpdir(), "kz-remote-"));
const ask = (h: string, at: number) => { mkdirSync(remoteDir(h), { recursive: true }); writeFileSync(join(remoteDir(h), "install-request"), JSON.stringify({ version: "9.9.9", at })); };

test("writeStatus leaves update.json for the board to read", () => {
  const h = home();
  writeStatus(h, { app: "1.89.5", downloaded: "1.89.6", platform: "linux" }, 42);
  expect(JSON.parse(readFileSync(join(remoteDir(h), "update.json"), "utf8"))).toEqual({ app: "1.89.5", downloaded: "1.89.6", platform: "linux", at: 42 });
});

test("a fresh request is taken once; a stale or unreadable one is dropped without acting", () => {
  const h = home(), now = 10 * STALE_MS;
  expect(takeRequest(h, now)).toBe(false);
  ask(h, now - 1000);
  expect(takeRequest(h, now)).toBe(true);
  expect(existsSync(join(remoteDir(h), "install-request"))).toBe(false);
  expect(takeRequest(h, now)).toBe(false);
  ask(h, now - STALE_MS - 1);
  expect(takeRequest(h, now)).toBe(false);
  writeFileSync(join(remoteDir(h), "install-request"), "nope");
  expect(takeRequest(h, now)).toBe(false);
  expect(existsSync(join(remoteDir(h), "install-request"))).toBe(false);
});
