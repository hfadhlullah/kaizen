// LocalSend protocol v2, the sending half: find devices on this network the way the
// LocalSend app does, and send one file to one of them. The person accepts on the
// device. https://github.com/localsend/protocol — Bun's dgram, fetch and Bun.serve only.
import { createSocket } from "node:dgram";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { basename } from "node:path";
import { homedir, hostname } from "node:os";

export const GROUP = "224.0.0.167", PORT = 53317;
export type Device = { alias: string; deviceModel: string | null; deviceType: string | null; ip: string; port: number; protocol: "http" | "https"; fingerprint: string };

// A device in HTTPS mode (the app's default) asks the sender for a TLS client
// certificate, and LocalSend's fingerprint is that certificate's SHA-256. So we carry a
// self-signed one, made once per board on first use: an RSA key and a minimal X.509 v3
// certificate in DER, signed with node:crypto, since Bun can sign but not issue one.
const der = (tag: number, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts), n = body.length;
  const len = n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]);
  return Buffer.concat([Buffer.from([tag]), len, body]);
};
const seq = (...p: Buffer[]) => der(0x30, ...p);
const oid = (hex: string) => der(0x06, Buffer.from(hex, "hex"));
const time = (d: Date) => der(0x18, Buffer.from(d.toISOString().replace(/[-:T]|\.\d+/g, "")));
const pem = (label: string, b: Buffer) => `-----BEGIN ${label}-----\n${b.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END ${label}-----\n`;
let id: { cert: string; key: string; fingerprint: string } | null = null;
export function identity() {
  if (id) return id;
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const alg = seq(oid("2a864886f70d01010b"), Buffer.from([5, 0])); // sha256WithRSAEncryption
  const name = seq(der(0x31, seq(oid("550403"), der(0x0c, Buffer.from("kaizen")))));
  const now = Date.now();
  const tbs = seq(der(0xa0, der(0x02, Buffer.from([2]))), der(0x02, Buffer.concat([Buffer.from([1]), randomBytes(8)])), alg, name,
    seq(time(new Date(now - 86_400_000)), time(new Date(now + 10 * 365 * 86_400_000))), name, publicKey.export({ type: "spki", format: "der" }));
  const cert = seq(tbs, alg, der(0x03, Buffer.from([0]), sign("sha256", tbs, privateKey)));
  return id = { cert: pem("CERTIFICATE", cert), key: privateKey.export({ type: "pkcs8", format: "pem" }) as string, fingerprint: createHash("sha256").update(cert).digest("hex").toUpperCase() };
}
// Who we say we are; the fingerprint also lets discovery drop our own announce.
const me = () => ({ alias: `kaizen (${hostname()})`, version: "2.0", deviceModel: "kaizen", deviceType: "desktop", fingerprint: identity().fingerprint, download: false });

const device = (m: any, ip: string): Device | null => {
  if (!m || typeof m.fingerprint !== "string" || !m.fingerprint || m.fingerprint === me().fingerprint || typeof m.alias !== "string") return null;
  const port = Number(m.port ?? PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { alias: m.alias.slice(0, 80), deviceModel: typeof m.deviceModel === "string" ? m.deviceModel : null, deviceType: typeof m.deviceType === "string" ? m.deviceType : null,
    ip: ip.replace(/^::ffff:/, ""), port, protocol: m.protocol === "https" ? "https" : "http", fingerprint: m.fingerprint };
};

// Announce on the multicast group and collect who answers for `ms`: devices reply by
// POSTing /register to the port we announced, or by multicast. The LocalSend app on this
// computer may hold UDP 53317 already; reuseAddr shares it on Linux and macOS, and where
// binding still fails we announce from any port and rely on the HTTP replies.
export async function discover(ms = 3000): Promise<{ devices: Device[]; note: string | null }> {
  const found = new Map<string, Device>();
  const add = (d: Device | null) => { if (d) found.set(d.fingerprint, d); };
  const http = Bun.serve({ port: 0, hostname: "0.0.0.0", async fetch(req, srv) {
    if (req.method === "POST" && new URL(req.url).pathname === "/api/localsend/v2/register") {
      add(device(await req.json().catch(() => null), srv.requestIP(req)?.address ?? ""));
      return Response.json({ ...me(), port: http.port, protocol: "http" });
    }
    return new Response("not found", { status: 404 });
  } });
  const sock = createSocket({ type: "udp4", reuseAddr: true });
  let note: string | null = null;
  try {
    sock.on("message", (buf, r) => { try { add(device(JSON.parse(String(buf)), r.address)); } catch { /* not LocalSend */ } });
    await new Promise<void>((ok) => {
      sock.once("error", () => { note = "could not listen on UDP 53317; only devices that answer over HTTP are listed"; sock.bind(0, ok); });
      sock.bind(PORT, () => { try { sock.addMembership(GROUP); } catch { /* no multicast route; replies still come over HTTP */ } ok(); });
    });
    const hello = Buffer.from(JSON.stringify({ ...me(), port: http.port, protocol: "http", announce: true }));
    // Twice, as the app does: one datagram on a busy Wi-Fi is easy to lose.
    for (const wait of [0, 600]) { await Bun.sleep(wait); sock.send(hello, PORT, GROUP); }
    await Bun.sleep(Math.max(0, ms - 600));
  } catch (e) { note = `discovery failed: ${e instanceof Error ? e.message : e}`; }
  finally { try { sock.close(); } catch { /* closed */ } http.stop(true); }
  return { devices: [...found.values()].sort((a, b) => a.alias.localeCompare(b.alias)), note };
}

export type Progress = { phase: "waiting" | "uploading"; pct: number };
export type Result = { ok: true; skipped?: string[] } | { ok: false; error: string };

// Files to one device, in one session: the device shows one accept prompt for all of
// them during prepare-upload; "sent" is only every upload's 200. Self-signed certificates
// are accepted: LocalSend devices all use one, the same trust LocalSend itself gives a
// device on the LAN; ours goes back as the client certificate.
export async function sendFiles(dev: Device, files: string[], onProgress: (p: Progress) => void = () => {},
  { acceptMs = 120_000, uploadMs = 30 * 60_000 } = {}): Promise<Result> {
  const base = `${dev.protocol}://${dev.ip.includes(":") ? `[${dev.ip}]` : dev.ip}:${dev.port}/api/localsend/v2`;
  const list = files.map((path, i) => {
    const f = Bun.file(path), name = basename(path);
    const type = name.endsWith(".srt") ? "text/plain" : f.type.split(";")[0] || "application/octet-stream";
    return { id: `f${i + 1}`, path, f, name, size: f.size, type };
  });
  const total = list.reduce((n, x) => n + x.size, 0);
  const { cert, key } = identity();
  const tls = { rejectUnauthorized: false, cert, key };
  onProgress({ phase: "waiting", pct: 0 });
  let r: Response;
  try {
    r = await fetch(`${base}/prepare-upload`, { method: "POST", tls, signal: AbortSignal.timeout(acceptMs), headers: { "content-type": "application/json" },
      body: JSON.stringify({ info: { ...me(), port: PORT, protocol: "http" },
        files: Object.fromEntries(list.map((x) => [x.id, { id: x.id, fileName: x.name, size: x.size, fileType: x.type }])) }) } as RequestInit);
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "TimeoutError" ? `No answer from ${dev.alias} in ${Math.round(acceptMs / 60_000) || 1} minute${acceptMs > 60_000 ? "s" : ""}` : `Could not reach ${dev.alias}: ${e instanceof Error ? e.message : e}` };
  }
  if (r.status === 204) return { ok: false, error: `${dev.alias} needed nothing (it already has the file)` };
  if (r.status === 403) return { ok: false, error: `${dev.alias} said no` };
  if (r.status === 401) return { ok: false, error: `${dev.alias} asks for a PIN; turn the PIN off in its LocalSend settings` };
  if (r.status === 409) return { ok: false, error: `${dev.alias} is busy with another transfer` };
  if (r.status === 429) return { ok: false, error: `${dev.alias} says too many requests; try again in a minute` };
  if (r.status !== 200) return { ok: false, error: `${dev.alias} answered ${r.status}` };
  const s = await r.json().catch(() => null) as { sessionId?: string; files?: Record<string, string> } | null;
  if (!s?.sessionId || !list.some((x) => s.files?.[x.id])) return { ok: false, error: `${dev.alias} did not accept the file` };
  // The device may take only some of them (the person unticks a few).
  const taken = list.filter((x) => s.files?.[x.id]);

  // The bytes, streamed one file after another, counting across all of them.
  let sent = 0, last = -1;
  for (const x of taken) {
    const reader = x.f.stream().getReader();
    const body = new ReadableStream<Uint8Array>({ async pull(c) {
      const { done, value } = await reader.read();
      if (done) return c.close();
      sent += value.byteLength;
      const pct = total ? Math.floor((sent / total) * 100) : 100;
      if (pct !== last) { last = pct; onProgress({ phase: "uploading", pct }); }
      c.enqueue(value);
    } });
    const q = new URLSearchParams({ sessionId: s.sessionId, fileId: x.id, token: s.files![x.id]! });
    try {
      const u = await fetch(`${base}/upload?${q}`, { method: "POST", tls, body, signal: AbortSignal.timeout(uploadMs),
        headers: { "content-type": x.type, "content-length": String(x.size) } } as RequestInit);
      if (u.status !== 200) return { ok: false, error: u.status === 403 ? `${dev.alias} cancelled the transfer` : `${dev.alias} stopped the upload (${u.status})` };
    } catch (e) {
      return { ok: false, error: e instanceof Error && e.name === "TimeoutError" ? `The upload to ${dev.alias} took over ${Math.round(uploadMs / 60_000)} minutes` : `The upload to ${dev.alias} broke off: ${e instanceof Error ? e.message : e}` };
    }
  }
  const skipped = list.filter((x) => !s.files?.[x.id]).map((x) => x.name);
  return skipped.length ? { ok: true, skipped } : { ok: true };
}

export const sendFile = (dev: Device, file: string, onProgress?: (p: Progress) => void, opts?: { acceptMs?: number; uploadMs?: number }) =>
  sendFiles(dev, [file], onProgress, opts);

// A device at a known address, for networks multicast cannot cross (Tailscale, another
// subnet): ask it who it is, over HTTPS first (the app's default), then plain HTTP.
// "host", "host:port" or "[v6]:port".
export async function reach(addr: string, ms = 4000): Promise<Device | null> {
  const m = addr.match(/^\[(.+)\](?::(\d+))?$/) ?? addr.match(/^([^:]+)(?::(\d+))?$/);
  const ip = m ? m[1]! : addr, port = m?.[2] ? Number(m[2]) : PORT;
  const { cert, key } = identity();
  for (const protocol of ["https", "http"] as const) {
    try {
      const r = await fetch(`${protocol}://${ip.includes(":") ? `[${ip}]` : ip}:${port}/api/localsend/v2/info?fingerprint=${me().fingerprint}`,
        { tls: { rejectUnauthorized: false, cert, key }, signal: AbortSignal.timeout(ms) } as RequestInit);
      if (!r.ok) continue;
      const j = await r.json().catch(() => ({})) as any;
      return { alias: typeof j.alias === "string" ? j.alias.slice(0, 80) : ip, deviceModel: typeof j.deviceModel === "string" ? j.deviceModel : null,
        deviceType: typeof j.deviceType === "string" ? j.deviceType : null, ip, port, protocol, fingerprint: typeof j.fingerprint === "string" ? j.fingerprint : ip };
    } catch { /* not this protocol, or nobody there */ }
  }
  return null;
}

// The phone `kaizen send` uses when no --to is given: ~/.kaizen/localsend.json, per user.
export const savedFile = () => process.env.KAIZEN_LOCALSEND_FILE ?? join(homedir(), ".kaizen", "localsend.json");
const savedTo = () => { try { const t = JSON.parse(readFileSync(savedFile(), "utf8"))?.to; return typeof t === "string" ? t : ""; } catch { return ""; } };
const looksLikeAddress = (t: string) => /^[\d.]+(:\d+)?$|^\[.*\]|:.*:|\./.test(t);

const USAGE = `kaizen send <file>... [--to <device name | address>]   send files to a phone or computer running LocalSend
  kaizen send --default <device name | address>          remember where files go when --to is left out
  kaizen send --devices                                  list LocalSend devices on this network`;

// `kaizen send`: what an agent runs when the person asks for a file on their phone. The
// person still taps Accept in LocalSend on the device, so nothing lands unasked.
export async function cli(argv: string[], log: (s: string) => void = console.log): Promise<number> {
  const files: string[] = [];
  let to = "", setDefault: string | null = null, list = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--to") to = argv[++i] ?? "";
    else if (a === "--default") setDefault = argv[++i] ?? "";
    else if (a === "--devices") list = true;
    else if (a === "-h" || a === "--help") { log(`\n  ${USAGE}\n`); return 0; }
    else files.push(a);
  }
  if (setDefault !== null) {
    if (!setDefault.trim()) { log(`\n  ${USAGE}\n`); return 1; }
    mkdirSync(dirname(savedFile()), { recursive: true });
    writeFileSync(savedFile(), JSON.stringify({ to: setDefault.trim() }) + "\n");
    log(`\n  files go to ${setDefault.trim()} when --to is left out\n`);
    if (!files.length) return 0;
  }
  if (list) {
    const { devices, note } = await discover();
    const saved = savedTo();
    log(`\n${devices.length ? devices.map((d) => `  ${d.alias}  ${d.ip}${d.deviceModel ? `  ${d.deviceModel}` : ""}`).join("\n") : "  no LocalSend device answered on this network"}`
      + `${note ? `\n  (${note})` : ""}${saved ? `\n  default: ${saved}` : "\n  no default; set one with kaizen send --default <name | address>"}\n`);
    return 0;
  }
  if (!files.length) { log(`\n  ${USAGE}\n`); return 1; }
  for (const f of files) {
    if (!existsSync(f)) { log(`\n  no such file: ${f}\n`); return 1; }
    if (!statSync(f).isFile()) { log(`\n  ${f} is a folder; send its files, or zip it first\n`); return 1; }
  }

  const want = to.trim() || savedTo();
  let dev: Device | null = null;
  if (want && looksLikeAddress(want)) dev = await reach(want);
  else {
    const { devices } = await discover();
    const w = want.toLowerCase();
    dev = !want ? (devices.length === 1 ? devices[0]! : null)
      : devices.find((d) => d.alias.toLowerCase() === w) ?? devices.find((d) => d.alias.toLowerCase().includes(w)) ?? null;
    if (!dev && want) dev = await reach(want);   // a Tailscale MagicDNS name, say
    if (!dev && !want) {
      log(devices.length ? `\n  more than one device; pick one with --to:\n${devices.map((d) => `    ${d.alias}  ${d.ip}`).join("\n")}\n`
        : "\n  no LocalSend device found on this network. Open LocalSend on the phone, or give its address:\n  kaizen send <file> --to <ip>   (over Tailscale: the phone's 100.x address)\n");
      return 1;
    }
  }
  if (!dev) { log(`\n  no LocalSend at ${want}. Is LocalSend open on that device, and the address right?\n`); return 1; }

  log(`  waiting for ${dev.alias} to accept in LocalSend…`);
  const tty = process.stdout.isTTY;
  const r = await sendFiles(dev, files, (p) => { if (tty && p.phase === "uploading") process.stdout.write(`\r  sending ${p.pct}%`); });
  if (tty) process.stdout.write("\r\x1b[K");
  if (!r.ok) { log(`  ${r.error}`); return 1; }
  log(`  sent to ${dev.alias}: ${files.map((f) => basename(f)).join(", ")}${r.skipped ? ` (declined: ${r.skipped.join(", ")})` : ""}`);
  return 0;
}
