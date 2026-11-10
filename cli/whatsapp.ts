// Kaizen WhatsApp: manages the background Baileys bridge (~/.kaizen/whatsapp/bridge.ts)
// and proxies requests to it over the local Unix domain socket.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const WA_DIR = join(homedir(), ".kaizen", "whatsapp");
export const BRIDGE_SCRIPT = join(WA_DIR, "bridge.ts");
export const SOCK_PATH = join(WA_DIR, "bridge.sock");

export type WAStatus = {
  installed: boolean;
  running: boolean;
  connected: boolean;
  user: string | null;
  qrSvg: string | null;
  error: string | null;
};

export type WAChat = { id: string; name: string; type: string };

async function callBridge(path: string, options: RequestInit = {}, timeoutMs = 4000): Promise<any> {
  if (!existsSync(SOCK_PATH)) return null;
  try {
    const res = await fetch(`http://localhost${path}`, {
      // Bun unix socket option
      // @ts-ignore
      unix: SOCK_PATH,
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export async function ensureDaemon(ms = 3000): Promise<boolean> {
  if (!existsSync(BRIDGE_SCRIPT)) return false;
  // If already answering, we are good
  const st = await callBridge("/status", {}, 1000);
  if (st) return true;

  try {
    const p = Bun.spawn(["bun", BRIDGE_SCRIPT], {
      cwd: WA_DIR,
      stdio: ["ignore", "ignore", "ignore"],
      env: process.env,
      windowsHide: true,
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

export async function whatsappStatus(): Promise<WAStatus> {
  const installed = existsSync(BRIDGE_SCRIPT);
  if (!installed) {
    return { installed: false, running: false, connected: false, user: null, qrSvg: null, error: null };
  }

  const res = await callBridge("/status", {}, 1500);
  if (!res) {
    return { installed: true, running: false, connected: false, user: null, qrSvg: null, error: null };
  }

  return {
    installed: true,
    running: true,
    connected: !!res.connected,
    user: res.user ?? null,
    qrSvg: res.qrSvg ?? null,
    error: res.error ?? null,
  };
}

export async function whatsappConnect(): Promise<WAStatus> {
  await ensureDaemon();
  await callBridge("/connect", { method: "POST" });
  return whatsappStatus();
}

export async function whatsappDisconnect(): Promise<{ ok: boolean }> {
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
