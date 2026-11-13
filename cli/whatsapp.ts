// Kaizen WhatsApp: manages the background Baileys bridge (cli/whatsapp-bridge.ts, shipped
// with kaizen) and proxies requests to it over a loopback port. Its data --
// login, chat list and the Baileys dependencies, installed on the first link -- lives in
// ~/.kaizen/whatsapp.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";

export const WA_DIR = join(homedir(), ".kaizen", "whatsapp");
export const BRIDGE_SCRIPT = join(import.meta.dir, "whatsapp-bridge.ts");
// Exact versions: an unofficial client, so upgrades are deliberate.
const DEPS = ["@whiskeysockets/baileys@7.0.0-rc14", "qrcode@1.5.4"];
const depsReady = () => existsSync(join(WA_DIR, "node_modules", "@whiskeysockets", "baileys")) && existsSync(join(WA_DIR, "node_modules", "qrcode"));
// Port and token the running bridge wrote; see cli/whatsapp-bridge.ts.
const INFO = join(WA_DIR, "bridge.json");
// The bun that runs kaizen also runs the bridge; no PATH lookup of a bare "bun".
const bunBin = () => Bun.which("bun") ?? process.execPath;

export type WAStatus = {
  installed: boolean;
  // A login is saved on disk (auth/creds.json): the bridge reconnects with it, no QR needed.
  saved: boolean;
  running: boolean;
  connected: boolean;
  user: string | null;
  qrSvg: string | null;
  error: string | null;
};

export type WAChat = { id: string; name: string; type: string };

async function callBridge(path: string, options: RequestInit = {}, timeoutMs = 4000): Promise<any> {
  let info: { port: number; token: string };
  try { info = JSON.parse(readFileSync(INFO, "utf8")); } catch { return null; }
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}${path}`, {
      ...options,
      headers: { ...(options.headers as Record<string, string> | undefined), authorization: `Bearer ${info.token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

// First link only: fetch the Baileys dependencies next to the login data.
export async function installDeps(): Promise<string | null> {
  if (depsReady()) return null;
  const bun = bunBin();
  try {
    mkdirSync(WA_DIR, { recursive: true });
    if (!existsSync(join(WA_DIR, "package.json"))) writeFileSync(join(WA_DIR, "package.json"), '{"name":"kaizen-whatsapp","private":true}\n');
    const p = Bun.spawn([bun, "add", "--exact", ...DEPS], { cwd: WA_DIR, stdout: "ignore", stderr: "pipe", windowsHide: true, timeout: 180_000 });
    const err = await new Response(p.stderr).text();
    if ((await p.exited) !== 0 || !depsReady()) return `Could not install the WhatsApp libraries: ${err.trim().split("\n").pop() || "bun add failed"}`;
  } catch (e: any) {
    return `Could not install the WhatsApp libraries: ${String(e?.message ?? e).slice(0, 200)}`;
  }
  return null;
}

export async function ensureDaemon(ms = 3000): Promise<boolean> {
  if (!existsSync(BRIDGE_SCRIPT) || !depsReady()) return false;
  // If already answering, we are good
  const st = await callBridge("/status", {}, 1000);
  if (st) return true;

  try {
    const p = Bun.spawn([bunBin(), BRIDGE_SCRIPT], {
      cwd: WA_DIR,
      stdio: ["ignore", "ignore", "ignore"],
      env: process.env,
      windowsHide: true, // no console window on Windows
      detached: true,
    });
    p.unref();

    const start = Date.now();
    while (Date.now() - start < ms) {
      await Bun.sleep(200);
      const ready = await callBridge("/status", {}, 500);
      if (ready) return true;
    }
  } catch {}
  return false;
}

export const savedLogin = () => existsSync(join(WA_DIR, "auth", "creds.json"));
// One background start at a time: the Phone page polls every few seconds.
let reviving: Promise<boolean> | null = null;

export async function whatsappStatus(): Promise<WAStatus> {
  // "installed" = the libraries are there; the bridge script itself ships with kaizen.
  const installed = existsSync(BRIDGE_SCRIPT) && depsReady();
  const saved = savedLogin();
  if (!installed) {
    return { installed: false, saved, running: false, connected: false, user: null, qrSvg: null, error: null };
  }

  const res = await callBridge("/status", {}, 1500);
  if (!res) {
    // A saved login and no bridge (the app or the computer restarted): bring it back. The bridge
    // reconnects from the saved login by itself (whatsapp-bridge.ts), so no QR is shown.
    if (saved && !reviving) reviving = ensureDaemon(8000).finally(() => (reviving = null));
    return { installed: true, saved, running: false, connected: false, user: null, qrSvg: null, error: null };
  }

  return {
    installed: true,
    saved,
    running: true,
    connected: !!res.connected,
    user: res.user ?? null,
    qrSvg: res.qrSvg ?? null,
    error: res.error ?? null,
  };
}

export async function whatsappConnect(): Promise<WAStatus> {
  const bad = await installDeps();
  if (bad) return { ...(await whatsappStatus()), error: bad };
  if (!(await ensureDaemon(8000))) return { ...(await whatsappStatus()), error: "The WhatsApp bridge did not start" };
  await callBridge("/connect", { method: "POST" }, 8000);
  // The QR appears a moment after the daemon begins the link.
  for (let i = 0; i < 15; i++) {
    const st = await whatsappStatus();
    if (st.qrSvg || st.connected || st.error) return st;
    await Bun.sleep(400);
  }
  return whatsappStatus();
}

export async function whatsappDisconnect(): Promise<{ ok: boolean }> {
  // Unlink with the bridge down (a saved login after a restart): start it, so it logs out properly.
  if (savedLogin()) await ensureDaemon(8000);
  const res = await callBridge("/disconnect", { method: "POST" });
  return { ok: !!res?.ok };
}

export async function whatsappChats(): Promise<WAChat[] | null> {
  const res = await callBridge("/chats", {}, 2000);
  if (Array.isArray(res?.chats)) return res.chats;
  return null;
}

export async function whatsappSend(target: string, text: string, file: string): Promise<{ ok: true } | { ok: false; error: string } | null> {
  const running = await ensureDaemon();
  if (!running) return null;
  const res = await callBridge("/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target, text, file }),
  }, 120_000);
  if (!res) return null;
  return res.ok ? { ok: true } : { ok: false, error: res.error || "Send failed" };
}

// `kaizen send --whatsapp <file>... [--to <chat name | self>] [--text "<caption>"]`: an agent's way to
// send a file through the linked WhatsApp. Without --to the file goes to yourself.
const WA_USAGE = 'kaizen send --whatsapp <file>... [--to <chat name | self>] [--text "<caption>"]';
export async function cli(argv: string[], log: (s: string) => void = console.log): Promise<number> {
  const files: string[] = [];
  let to = "", text = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--whatsapp") continue;
    else if (a === "--to") to = argv[++i] ?? "";
    else if (a === "--text") text = argv[++i] ?? "";
    else if (a === "-h" || a === "--help") { log(`\n  ${WA_USAGE}\n`); return 0; }
    else files.push(a);
  }
  if (!files.length) { log(`\n  ${WA_USAGE}\n`); return 1; }
  for (const f of files) if (!existsSync(f) || !statSync(f).isFile()) { log(`\n  no such file: ${f}\n`); return 1; }
  // A freshly started bridge needs a few seconds to bring a saved login back.
  let linked = false;
  if (await ensureDaemon(8000)) {
    for (let i = 0; i < 40 && !(linked = (await whatsappStatus()).connected); i++) {
      if (!existsSync(join(WA_DIR, "auth", "creds.json"))) break;
      await Bun.sleep(500);
    }
  }
  if (!linked) {
    log("\n  WhatsApp is not linked. Open the board: Settings → Phone → WhatsApp Bridge → Link WhatsApp\n");
    return 1;
  }
  const chats = (await whatsappChats()) ?? [];
  const w = to.trim().toLowerCase();
  const pool = !w || w === "self" || w === "me" ? chats.filter((c) => c.type === "self")
    : chats.filter((c) => c.name.toLowerCase() === w);
  const hit = pool.length ? pool : chats.filter((c) => c.name.toLowerCase().includes(w));
  if (hit.length !== 1) {
    log(hit.length ? `\n  more than one chat matches "${to}":\n${hit.slice(0, 10).map((c) => `    ${c.name}`).join("\n")}\n` : `\n  no WhatsApp chat named "${to}"\n`);
    return 1;
  }
  for (const f of files) {
    const r = await whatsappSend(hit[0]!.id, text, resolve(f));
    if (!r || !r.ok) { log(`  ${r ? r.error : "the bridge did not answer"}`); return 1; }
    log(`  sent to ${hit[0]!.name}: ${basename(f)}`);
  }
  return 0;
}
