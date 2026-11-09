import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { boardPort, freePort, needsUpgrade, windowButtons, newer, pickKaizen, reapStale, rememberBoard, startBoard, stopBoard, upgradeCmd, waitReady } from "./server.ts";

// A stand-in for cli/install.ts: answers on --port like the board does.
function fakeKaizen(version: string, body = `Bun.serve({ hostname: "127.0.0.1", port: Number(Bun.argv[Bun.argv.indexOf("--port") + 1]), fetch: () => new Response("board") });`) {
  const dir = join(tmpdir(), `kz-desktop-${version}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, "cli"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
  writeFileSync(join(dir, "cli", "install.ts"), body);
  return dir;
}

test("freePort returns a port that can be bound", async () => {
  const port = await freePort();
  const srv = createServer();
  await new Promise<void>((r, j) => { srv.once("error", j); srv.listen(port, "127.0.0.1", () => r()); });
  srv.close();
});

test("newer compares dotted versions", () => {
  expect(newer("1.65.0", "1.64.9")).toBe(true);
  expect(newer("1.64.3", "1.64.3")).toBe(false);
  expect(newer("", "1.0.0")).toBe(false);
});

test("pickKaizen prefers a newer installed copy, else the bundled one", () => {
  const bundled = fakeKaizen("1.64.3");
  expect(pickKaizen(bundled, fakeKaizen("1.70.0"))).toEqual({ dir: expect.not.stringContaining(bundled), bundled: false });
  expect(pickKaizen(bundled, fakeKaizen("1.0.0"))).toEqual({ dir: bundled, bundled: true });
  expect(pickKaizen(bundled, "/nowhere")).toEqual({ dir: bundled, bundled: true });
});

test("start, wait for ready, stop releases the port", async () => {
  const port = await freePort();
  const b = startBoard({ bun: process.execPath, dir: fakeKaizen("1.0.0"), port, bundled: true, cwd: tmpdir() });
  await waitReady(b, 10000);
  expect(await (await fetch(b.url)).text()).toBe("board");
  await stopBoard(b.child);
  await expect(fetch(b.url, { signal: AbortSignal.timeout(500) })).rejects.toThrow();
});

test("waitReady rejects when the board exits first", async () => {
  const b = startBoard({ bun: process.execPath, dir: fakeKaizen("1.0.0", "process.exit(3)"), port: await freePort(), bundled: true, cwd: tmpdir() });
  await expect(waitReady(b, 10000)).rejects.toThrow(/exited/);
});

test("waitReady times out on a board that never answers", async () => {
  const b = startBoard({ bun: process.execPath, dir: fakeKaizen("1.0.0", "setInterval(() => {}, 1000)"), port: await freePort(), bundled: true, cwd: tmpdir() });
  await expect(waitReady(b, 800)).rejects.toThrow(/did not answer/);
  await stopBoard(b.child);
  expect(b.child.exitCode !== null || b.child.signalCode !== null).toBe(true);
});

test("reapStale ends a board a crashed launch left, and spares a dead record", async () => {
  const file = join(tmpdir(), `kz-board-${Math.random().toString(36).slice(2)}.json`);
  const b = startBoard({ bun: process.execPath, dir: fakeKaizen("1.0.0"), port: await freePort(), bundled: true, cwd: tmpdir() });
  await waitReady(b, 10000);
  rememberBoard(file, b);
  const gone = new Promise((r) => b.child.once("exit", r));
  expect(await reapStale(file)).toBe(true);
  await gone;
  writeFileSync(file, JSON.stringify({ pid: b.child.pid, port: b.port }));
  expect(await reapStale(file)).toBe(false);
});

test("boardPort takes the preferred port when free, and another when it is taken", async () => {
  const want = await freePort();
  expect(await boardPort(want)).toBe(want);
  const srv = createServer();
  await new Promise<void>((r) => srv.listen(want, "127.0.0.1", () => r()));
  const got = await boardPort(want);
  srv.close();
  expect(got).not.toBe(want);
  expect(got).toBeGreaterThan(0);
});

test("the board does not inherit the AppImage runtime's ARGV0 (zsh would hand it to every command)", async () => {
  const body = `Bun.serve({ hostname: "127.0.0.1", port: Number(Bun.argv[Bun.argv.indexOf("--port") + 1]), fetch: () => new Response(String(process.env.ARGV0 ?? "none")) });`;
  const b = startBoard({ bun: process.execPath, dir: fakeKaizen("1.0.0", body), port: await freePort(), bundled: true, cwd: tmpdir(), env: { ARGV0: "kaizen-desktop.AppImage" } });
  await waitReady(b, 10000);
  expect(await (await fetch(b.url)).text()).toBe("none");
  await stopBoard(b.child);
});

// After the app updates, ~/kaizen (what agents' skills link into) is upgraded only when it is an
// npm install behind the app; never a git checkout, never created for a desktop-only user.
test("needsUpgrade: only an older installed copy that is not a git checkout", () => {
  const root = join(tmpdir(), `kz-up-${Date.now()}`);
  const kz = (name: string, version: string, git = false) => {
    const d = join(root, name);
    mkdirSync(join(d, "cli"), { recursive: true });
    writeFileSync(join(d, "cli", "install.ts"), "");
    writeFileSync(join(d, "package.json"), JSON.stringify({ version }));
    if (git) mkdirSync(join(d, ".git"));
    return d;
  };
  const app = kz("app", "1.78.1");
  expect(needsUpgrade(app, kz("old", "1.77.0"))).toBeNull();
  expect(needsUpgrade(app, kz("same", "1.78.1"))).toBe("up to date");
  expect(needsUpgrade(app, kz("newer", "1.79.0"))).toBe("up to date");
  expect(needsUpgrade(app, kz("dev", "1.70.0", true))).toBe("a git checkout");
  expect(needsUpgrade(app, join(root, "nothing"))).toBe("not installed");
});

test("upgradeCmd runs the installed copy's own upgrade, aimed at it, without the bundle's variables", () => {
  const { argv, env } = upgradeCmd("/app/bun", "/home/u/kaizen", { PATH: "/usr/bin", KAIZEN_HOME: "/app/resources/kaizen", KAIZEN_DESKTOP_BUNDLED: "1", ELECTRON_RUN_AS_NODE: "1", ARGV0: "x.AppImage", APPDIR: "/tmp/.mount", OWD: "/home/u" });
  expect(argv).toEqual(["/app/bun", join("/home/u/kaizen", "cli", "install.ts"), "upgrade"]);
  expect(env).toEqual({ PATH: "/usr/bin", KAIZEN_HOME: "/home/u/kaizen" });
});

test("windowButtons: Windows and other Linux desktops draw them; macOS and Hyprland do not", () => {
  expect(windowButtons("win32", {})).toBe(true);
  expect(windowButtons("linux", { XDG_CURRENT_DESKTOP: "GNOME" })).toBe(true);
  expect(windowButtons("linux", { XDG_CURRENT_DESKTOP: "KDE" })).toBe(true);
  expect(windowButtons("darwin", {})).toBe(false);
  expect(windowButtons("linux", { XDG_CURRENT_DESKTOP: "Hyprland" })).toBe(false);
  expect(windowButtons("linux", { HYPRLAND_INSTANCE_SIGNATURE: "abc" })).toBe(false);
});
