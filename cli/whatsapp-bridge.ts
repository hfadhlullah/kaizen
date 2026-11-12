// Kaizen WhatsApp bridge: a small background daemon that holds one WhatsApp Web link
// (Baileys) and answers the board over a Unix socket. Started by cli/whatsapp.ts with
// its working directory set to ~/.kaizen/whatsapp, where its login (auth/), chat list
// and dependencies (node_modules, installed on first link) live. It listens on a
// random 127.0.0.1 port (the same on Linux, macOS and Windows) and writes the port and
// a one-run token to bridge.json; every request must carry that token, so a web page
// that guesses the port cannot drive it.
//
//   GET  /status      -> { connected, user, qrSvg, error }
//   POST /connect     -> start (or restart) the link; a QR appears in /status
//   POST /disconnect  -> log out and forget the login
//   GET  /chats       -> { chats: [{ id, name, type }] }
//   POST /send        -> { target, text, file } -> { ok } | { ok: false, error }
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, extname, join } from "node:path";

const DIR = process.cwd();
const INFO = join(DIR, "bridge.json");
const TOKEN = randomUUID();
const AUTH = join(DIR, "auth");
const CHATS = join(DIR, "chats.json");

// This file lives in kaizen's cli/, the libraries in the data folder: resolve from there.
const load = (name: string) => import(Bun.resolveSync(name, DIR));
const baileys: any = await load("@whiskeysockets/baileys");
const QRCode: any = (await load("qrcode")).default;
const makeWASocket = baileys.default ?? baileys.makeWASocket;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = baileys;

const quiet: any = { level: "silent", trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child() { return quiet; } };

// Filled squares, not the library's strokes: the board's .ph-qr rule clears every stroke.
function qrToSvg(text: string): string {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "L" });
  const n: number = modules.size, m = 2;
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (modules.get(x, y)) d += `M${x + m} ${y + m}h1v1h-1z`;
  const t = n + 2 * m;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="#fff"/><path fill="#000" d="${d}"/></svg>`;
}

let sock: any = null;
let connected = false;
let user: string | null = null;
let qrSvg: string | null = null;
let error: string | null = null;
let starting = false;
let wantLink = false;

type Chat = { id: string; name: string; type: string };
const chats = new Map<string, Chat>();
try {
  for (const c of JSON.parse(readFileSync(CHATS, "utf8"))) chats.set(c.id, c);
} catch {}
const saveChats = () => { try { writeFileSync(CHATS, JSON.stringify([...chats.values()])); } catch {} };

// "6281…:12@s.whatsapp.net" -> "6281…@s.whatsapp.net": the device part is not an address.
const bare = (jid: string) => jid.replace(/:\d+@/, "@");

function note(id: string, name: string | undefined, type: string) {
  if (!id || id.endsWith("@broadcast") || id.endsWith("@newsletter")) return;
  const old = chats.get(id);
  if (old && !name) return;
  chats.set(id, { id, name: name || old?.name || id.split("@")[0], type });
}

async function start() {
  if (starting) return;
  starting = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH);
    let version: any;
    try { version = (await fetchLatestBaileysVersion()).version; } catch {}
    const s = makeWASocket({ auth: state, version, logger: quiet, browser: Browsers.macOS("Kaizen"), syncFullHistory: false, markOnlineOnConnect: false });
    sock = s;
    s.ev.on("creds.update", saveCreds);
    s.ev.on("contacts.upsert", (l: any[]) => { for (const c of l) note(c.id, c.name || c.notify, "dm"); saveChats(); });
    s.ev.on("contacts.update", (l: any[]) => { for (const c of l) if (c.id && (c.name || c.notify)) note(c.id, c.name || c.notify, "dm"); saveChats(); });
    s.ev.on("messaging-history.set", ({ chats: cs, contacts }: any) => {
      for (const c of contacts ?? []) note(c.id, c.name || c.notify, "dm");
      for (const c of cs ?? []) note(c.id, c.name, c.id.endsWith("@g.us") ? "group" : "dm");
      saveChats();
    });
    s.ev.on("chats.upsert", (l: any[]) => { for (const c of l) note(c.id, c.name, c.id.endsWith("@g.us") ? "group" : "dm"); saveChats(); });
    s.ev.on("connection.update", async (u: any) => {
      if (s !== sock) return;
      if (u.qr) { qrSvg = qrToSvg(u.qr); error = null; }
      if (u.connection === "open") {
        connected = true; qrSvg = null; error = null; wantLink = false;
        user = s.user?.name || (s.user?.id ? bare(s.user.id).split("@")[0] : "WhatsApp");
        if (s.user?.id) note(bare(s.user.id), "You (message yourself)", "self");
        try {
          for (const g of Object.values(await s.groupFetchAllParticipating()) as any[]) note(g.id, g.subject, "group");
        } catch {}
        saveChats();
      }
      if (u.connection === "close") {
        connected = false; user = null; qrSvg = null;
        const code = u.lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          rmSync(AUTH, { recursive: true, force: true });
          chats.clear(); saveChats();
          wantLink = false; sock = null;
          return;
        }
        // Any other close (network, restart-required after the QR scan): reconnect.
        starting = false;
        if (wantLink || existsSync(join(AUTH, "creds.json"))) setTimeout(() => void start(), 1500);
        else { error = "WhatsApp closed the link; try again"; sock = null; }
      }
    });
  } catch (e: any) {
    error = String(e?.message ?? e).slice(0, 300);
    sock = null;
  } finally {
    starting = false;
  }
}

const MIME: Record<string, string> = {
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".pdf": "application/pdf", ".zip": "application/zip", ".txt": "text/plain", ".md": "text/markdown",
  ".srt": "application/x-subrip", ".json": "application/json",
};

async function send(target: string, text: string, file: string) {
  if (!sock || !connected) return { ok: false, error: "WhatsApp is not linked" };
  let jid = target.replace(/^whatsapp:/, "");
  if (!jid.includes("@")) jid = `${jid.replace(/\D/g, "")}@s.whatsapp.net`;
  try {
    if (!file) {
      await sock.sendMessage(jid, { text });
      return { ok: true };
    }
    const size = statSync(file).size;
    if (size > 2_000_000_000) return { ok: false, error: "WhatsApp documents must be 2 GB or smaller" };
    const ext = extname(file).toLowerCase();
    const mimetype = MIME[ext] ?? "application/octet-stream";
    const src = { url: file }; // streamed from disk, not read into memory
    // Small MP4s show as playable video; everything else goes as a document, quality intact.
    const content: any = ext === ".mp4" && size <= 64 * 1024 * 1024
      ? { video: src, mimetype, caption: text || undefined }
      : { document: src, mimetype, fileName: basename(file), caption: text || undefined };
    await sock.sendMessage(jid, content);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 400) };
  }
}

const json = (o: unknown, status = 200) => Response.json(o, { status });

rmSync(INFO, { force: true });
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 255,
  async fetch(req) {
    if (req.headers.get("authorization") !== `Bearer ${TOKEN}`) return json({ error: "forbidden" }, 403);
    const path = new URL(req.url).pathname;
    if (path === "/status") return json({ connected, user, qrSvg, error });
    // Only chats a person can pick: yourself, groups and contacts with a real name. WhatsApp
    // also reports thousands of nameless @lid entries.
    if (path === "/chats") return json({ chats: [...chats.values()].filter((c) => c.type === "self" || (/[\p{L}\p{N}]/u.test(c.name) && c.name !== c.id.split("@")[0])).sort((a, b) => (a.type === "self" ? -1 : b.type === "self" ? 1 : a.name.localeCompare(b.name))) });
    if (req.method !== "POST") return json({ error: "not found" }, 404);
    if (path === "/connect") {
      wantLink = true;
      error = null;
      if (!sock && !connected) await start();
      return json({ ok: true });
    }
    if (path === "/disconnect") {
      wantLink = false;
      try { await sock?.logout(); } catch {}
      try { sock?.end(undefined); } catch {}
      sock = null; connected = false; user = null; qrSvg = null;
      rmSync(AUTH, { recursive: true, force: true });
      chats.clear(); saveChats();
      return json({ ok: true });
    }
    if (path === "/send") {
      const b: any = await req.json().catch(() => null);
      if (!b || typeof b.target !== "string") return json({ ok: false, error: "target expected" });
      return json(await send(b.target, String(b.text ?? ""), String(b.file ?? "")));
    }
    return json({ error: "not found" }, 404);
  },
});

writeFileSync(INFO, JSON.stringify({ port: server.port, token: TOKEN, pid: process.pid }), { mode: 0o600 });
const bye = () => { rmSync(INFO, { force: true }); process.exit(0); };
process.on("SIGINT", bye);
process.on("SIGTERM", bye);

// A saved login comes back on its own when the daemon (re)starts.
if (existsSync(join(AUTH, "creds.json"))) void start();
