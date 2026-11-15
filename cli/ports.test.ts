import { expect, test } from "bun:test";
import { conflictPort, holdersFromSs } from "./ports.ts";

test("the port a dev server says is taken", () => {
  expect(conflictPort("error: Failed to start server. Is port 3000 in use?\nEADDRINUSE: address already in use 0.0.0.0:3000")).toBe(3000);
  expect(conflictPort("Error: listen EADDRINUSE: address already in use :::5173")).toBe(5173);
  expect(conflictPort("\x1b[31mPort 7431 is already in use\x1b[0m")).toBe(7431);
  expect(conflictPort("bind: address already in use 127.0.0.1:8080")).toBe(8080);
  expect(conflictPort('error: Failed to start server. Is port 8123 in use?\n syscall: "listen",\n code: "EADDRINUSE"')).toBe(8123);
  expect(conflictPort("ready in 300 ms on :3000")).toBeNull();
  expect(conflictPort("")).toBeNull();
});

test("who listens on a port, from ss", () => {
  const ss = 'LISTEN 0 512 127.0.0.1:7431 0.0.0.0:* users:(("bun",pid=4242,fd=8))\nLISTEN 0 4096 [::]:5173 [::]:* users:(("node",pid=77,fd=19))\n';
  expect(holdersFromSs(ss, 7431)).toEqual([{ pid: 4242, name: "bun" }]);
  expect(holdersFromSs(ss, 5173)).toEqual([{ pid: 77, name: "node" }]);
  expect(holdersFromSs(ss, 74)).toEqual([]);
});
