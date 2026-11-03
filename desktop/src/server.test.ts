import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { boardPort, freePort, newer, pickKaizen, reapStale, rememberBoard, startBoard, stopBoard, waitReady } from "./server.ts";

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
