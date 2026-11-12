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
