import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BRIDGE_SCRIPT, WA_DIR } from "./whatsapp.ts";

// The bridge ships inside kaizen's cli/ (so install and upgrade carry it); only its
// libraries are fetched, into the data folder, on the first link.
test("the bridge script ships with kaizen, apart from its data folder", () => {
  expect(existsSync(BRIDGE_SCRIPT)).toBe(true);
  expect(BRIDGE_SCRIPT.startsWith(import.meta.dir)).toBe(true);
  expect(WA_DIR.startsWith(import.meta.dir)).toBe(false);
});

// The real bridge over its real port, with stand-ins for the two libraries it loads, so it
// runs on every OS in CI without a WhatsApp account or the network.
const dir = mkdtempSync(join(tmpdir(), "kaizen-wa-"));
const pkg = (name: string, body: string) => {
  const d = join(dir, "node_modules", ...name.split("/"));
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
  writeFileSync(join(d, "index.js"), body);
};
pkg("@whiskeysockets/baileys", `
export default function makeWASocket() { return { ev: { on() {} }, end() {}, logout: async () => {} }; }
export const useMultiFileAuthState = async () => ({ state: {}, saveCreds() {} });
export const fetchLatestBaileysVersion = async () => ({ version: [2, 3000, 1] });
export const DisconnectReason = { loggedOut: 401 };
export const Browsers = { macOS: () => ["Kaizen", "Chrome", "1"] };`);
pkg("qrcode", `export default { create: () => ({ modules: { size: 1, get: () => 1 } }) };`);
const proc = Bun.spawn([process.execPath, BRIDGE_SCRIPT], { cwd: dir, stdout: "ignore", stderr: "ignore", windowsHide: true });
afterAll(() => { proc.kill(); rmSync(dir, { recursive: true, force: true }); });

test("the bridge answers on a loopback port, and only with its token", async () => {
  const info = join(dir, "bridge.json");
  for (let i = 0; i < 100 && !existsSync(info); i++) await Bun.sleep(100);
  const { port, token } = JSON.parse(readFileSync(info, "utf8"));
  const url = `http://127.0.0.1:${port}`;
  expect((await fetch(`${url}/status`)).status).toBe(403);
  expect((await fetch(`${url}/status`, { headers: { authorization: "Bearer nope" } })).status).toBe(403);
  const auth = { authorization: `Bearer ${token}` };
  expect(await (await fetch(`${url}/status`, { headers: auth })).json()).toMatchObject({ connected: false, qrSvg: null });
  expect(await (await fetch(`${url}/chats`, { headers: auth })).json()).toEqual({ chats: [] });
  expect(await (await fetch(`${url}/send`, { method: "POST", headers: auth, body: JSON.stringify({ target: "x", text: "hi", file: "" }) })).json())
    .toEqual({ ok: false, error: "WhatsApp is not linked" });
});

// A saved login with no bridge running (after a restart): a status check starts the bridge once,
// and it comes back without a QR. Run in a child with a scratch HOME (WA_DIR is bound at import).
test("a saved login brings the bridge back on a status check; no login starts nothing", async () => {
  const run = async (withLogin: boolean) => {
    const home = mkdtempSync(join(tmpdir(), "kz-wa-home-"));
    const wa = join(home, ".kaizen", "whatsapp");
    const mod = (name: string, body: string) => {
      const d = join(wa, "node_modules", ...name.split("/"));
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
      writeFileSync(join(d, "index.js"), body);
    };
    mod("@whiskeysockets/baileys", readFileSync(join(dir, "node_modules", "@whiskeysockets", "baileys", "index.js"), "utf8"));
    mod("qrcode", readFileSync(join(dir, "node_modules", "qrcode", "index.js"), "utf8"));
    if (withLogin) { mkdirSync(join(wa, "auth"), { recursive: true }); writeFileSync(join(wa, "auth", "creds.json"), "{}"); }
    const script = `const w = await import(${JSON.stringify(join(import.meta.dir, "whatsapp.ts"))});
const first = await w.whatsappStatus();
let later = first;
for (let i = 0; i < 40 && !later.running; i++) { await Bun.sleep(200); later = await w.whatsappStatus(); }
console.log(JSON.stringify({ first, later }));
try { const info = JSON.parse(require("node:fs").readFileSync(w.WA_DIR + "/bridge.json", "utf8")); process.kill(info.pid ?? 0); } catch {}`;
    try {
      const p = Bun.spawnSync([process.execPath, "-e", script], { cwd: home, env: { ...process.env, HOME: home, USERPROFILE: home }, timeout: 20_000 });
      if (p.exitCode !== 0) throw new Error(p.stderr.toString());
      return JSON.parse(p.stdout.toString().trim().split("\n").pop()!);
    } finally {
      // The started bridge exits with its folder gone at the latest; kill any by its pid file.
      try { const info = JSON.parse(readFileSync(join(wa, "bridge.json"), "utf8")); if (info.pid) process.kill(info.pid); } catch {}
      rmSync(home, { recursive: true, force: true });
    }
  };
  const yes = await run(true);
  expect(yes.first).toMatchObject({ installed: true, saved: true, running: false });
  expect(yes.later).toMatchObject({ saved: true, running: true });
  const no = await run(false);
  expect(no.first).toMatchObject({ installed: true, saved: false, running: false });
  expect(no.later.running).toBe(false);
}, 60_000);
