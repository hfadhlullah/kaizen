import { test, expect } from "bun:test";
import { openStore } from "../src/db";
import { createApp } from "../src/server";
import { pathFrom, winPaths, isInstalled } from "../src/desktop";
import { icns } from "../scripts/package";

test("desktop: login-shell PATH is read past rc-file banners", () => {
  expect(pathFrom("Welcome!\nfortune says hi\n__KB_PATH__/opt/homebrew/bin:/usr/bin")).toBe("/opt/homebrew/bin:/usr/bin");
  expect(pathFrom("")).toBeNull();
  expect(pathFrom("banner but no marker")).toBeNull();
});

test("desktop: Windows install paths, and an installed copy is recognised", () => {
  const p = winPaths({ LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local", APPDATA: "C:\\Users\\a\\AppData\\Roaming" });
  expect(p.dir).toContain("Programs");
  expect(p.exe.endsWith("Kaizen Bot.exe")).toBe(true);
  expect(p.lnk).toContain("Start Menu");
  expect(isInstalled(p.exe.toUpperCase(), p.dir)).toBe(true);
  expect(isInstalled("/home/a/Downloads/Kaizen-Bot-windows-x64.exe", p.dir)).toBe(false);
});

test("desktop: .icns is a valid header around one ic10 PNG", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const out = icns(png);
  const v = new DataView(out.buffer);
  expect(new TextDecoder().decode(out.slice(0, 4))).toBe("icns");
  expect(v.getUint32(4)).toBe(out.length);
  expect(new TextDecoder().decode(out.slice(8, 12))).toBe("ic10");
  expect(v.getUint32(12)).toBe(8 + png.length);
  expect(out.slice(16)).toEqual(png);
});

test("quit: only the app has it, and only from this machine", async () => {
  const env = { PROVIDER: "anthropic", MODEL: "m", ANTHROPIC_API_KEY: "k" };
  const req = (app: ReturnType<typeof createApp>, path: string, init: RequestInit = {}) =>
    app.handle(new Request(`http://127.0.0.1:7430${path}`, { ...init, headers: { host: "127.0.0.1:7430", ...(init.headers as object) } }));

  const source = createApp({ store: openStore(":memory:"), env, watch: false });
  expect((await req(source, "/quit", { method: "POST" })).status).toBe(404);
  expect((await (await req(source, "/settings")).json()).canQuit).toBe(false);

  let quit = 0;
  const app = createApp({ store: openStore(":memory:"), env, watch: false, quit: () => { quit++; } });
  expect((await (await req(app, "/settings")).json()).canQuit).toBe(true);
  expect((await req(app, "/quit", { method: "POST", headers: { origin: "https://evil.test" } })).status).toBe(403);
  expect((await req(app, "/quit")).status).not.toBe(200);
  expect((await req(app, "/quit", { method: "POST" })).status).toBe(200);
  await Bun.sleep(150);
  expect(quit).toBe(1);
});
