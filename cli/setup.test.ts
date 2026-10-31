import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qrMatrix, qr } from "./qr.ts";
import { tailnetName } from "./setup.ts";

test("qr: right size per version, finder squares in three corners, deterministic", () => {
  const a = qrMatrix("https://pc.tail1234.ts.net");        // 26 bytes: version 2, 25 modules
  expect(a.length).toBe(25);
  for (const [x, y] of [[0, 0], [18, 0], [0, 18]] as const) {
    expect(a[y]![x]).toBe(true); expect(a[y + 3]![x + 3]).toBe(true); expect(a[y + 1]![x + 1]).toBe(false);
  }
  expect(qr("https://pc.tail1234.ts.net")).toBe(qr("https://pc.tail1234.ts.net"));
  expect(qrMatrix("https://a.b").length).toBe(21);          // version 1
  expect(qrMatrix("x".repeat(130)).length).toBe(41);        // version 6
  expect(() => qrMatrix("x".repeat(200))).toThrow();
  const lines = qr("https://a.b").split("\n");
  expect(lines.length).toBe(13);                            // (21 + 4 quiet) / 2 rows, rounded up
  expect(new Set(lines.map((l) => l.length))).toEqual(new Set([25]));
});

test("tailnetName: the machine's DNS name only when Tailscale is running", () => {
  const up = JSON.stringify({ BackendState: "Running", Self: { DNSName: "PC.tail1234.ts.net." } });
  expect(tailnetName(up)).toBe("pc.tail1234.ts.net");
  expect(tailnetName(JSON.stringify({ BackendState: "NeedsLogin", Self: { DNSName: "pc.x.ts.net." } }))).toBeNull();
  expect(tailnetName(JSON.stringify({ BackendState: "Running" }))).toBeNull();
  expect(tailnetName("not json")).toBeNull();
});

// Scratch HOME only: setup must never touch the real ~/.kaizen.
test("kaizen setup without a terminal prints the manual steps and writes nothing", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "kaizen-setup-"));
  try {
    const p = Bun.spawn([process.execPath, join(import.meta.dir, "install.ts"), "setup"], {
      cwd: homeDir, env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir }, stdin: "ignore", stdout: "pipe", stderr: "pipe",
    });
    const out = await new Response(p.stdout).text();
    expect(await p.exited).toBe(0);
    expect(out).toContain("tailscale serve --bg 127.0.0.1:7420");
    // Bun's cache (~/.bun) and macOS's ~/Library land in HOME; only what kaizen writes counts.
    expect(readdirSync(homeDir).filter((n) => n !== ".bun" && !(process.platform === "darwin" && n === "Library"))).toEqual([]);
    expect(existsSync(join(homeDir, ".kaizen"))).toBe(false);
  } finally { rmSync(homeDir, { recursive: true, force: true }); }
});

test("web-hosts: names are normalized, deduped and merged with the env var", async () => {
  const homeDir = mkdtempSync(join(tmpdir(), "kaizen-hosts2-"));
  try {
    const p = Bun.spawn([process.execPath, "-e", `
      const s = await import(${JSON.stringify(join(import.meta.dir, "state.ts"))});
      s.addWebHost("PC.Tail1.ts.net"); s.addWebHost("pc.tail1.ts.net");
      console.log(JSON.stringify([...s.webHosts()].sort()));`], {
      env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir, KAIZEN_WEB_HOSTS: "Env.ts.net:443" }, stdout: "pipe",
    });
    expect(JSON.parse(await new Response(p.stdout).text())).toEqual(["env.ts.net", "pc.tail1.ts.net"]);
  } finally { rmSync(homeDir, { recursive: true, force: true }); }
});
