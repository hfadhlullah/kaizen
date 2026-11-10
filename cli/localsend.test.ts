// LocalSend's sending half against a fake device that speaks protocol v2: what it
// receives, and what each of its refusals reads as on the page.
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, X509Certificate, createPrivateKey } from "node:crypto";
import { cli, identity, probePeer, reach, sendFile, sendFiles, type Device } from "./localsend.ts";

// prepare: what prepare-upload answers (a status, or "hang" to never answer).
function fakeDevice(prepare: number | "hang") {
  const got: { prepare?: any; upload?: { query: Record<string, string>; bytes: Buffer } } = {};
  const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/api/localsend/v2/info") {
      return Response.json({ alias: "Pixel 8", deviceModel: "Pixel", deviceType: "mobile", fingerprint: "fp-info" });
    }
    if (u.pathname === "/api/localsend/v2/prepare-upload") {
      got.prepare = await req.json();
      if (prepare === "hang") { await Bun.sleep(5000); return new Response(null, { status: 500 }); }
      if (prepare !== 200) return new Response(null, { status: prepare });
      return Response.json({ sessionId: "s-1", files: { f1: "tok-1" } });
    }
    if (u.pathname === "/api/localsend/v2/upload") {
      const q = Object.fromEntries(u.searchParams);
      if (q.sessionId !== "s-1" || q.token !== "tok-1" || q.fileId !== "f1") return new Response(null, { status: 403 });
      got.upload = { query: q, bytes: Buffer.from(await req.arrayBuffer()) };
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 404 });
  } });
  const dev: Device = { alias: "Pixel 8", deviceModel: "Pixel", deviceType: "mobile", ip: "127.0.0.1", port: srv.port, protocol: "http", fingerprint: "fp" };
  return { dev, got, stop: () => srv.stop(true) };
}

function file() {
  const f = join(mkdtempSync(join(tmpdir(), "kaizen-ls-")), "demo-9x16.mp4");
  writeFileSync(f, randomBytes(300_000));
  return f;
}

test("a send carries the file's bytes with the session and token the device gave", async () => {
  const d = fakeDevice(200), f = file(), steps: string[] = [];
  try {
    expect(await sendFile(d.dev, f, (p) => steps.push(p.phase))).toEqual({ ok: true });
    expect(d.got.prepare.files.f1).toMatchObject({ id: "f1", fileName: "demo-9x16.mp4", size: 300_000, fileType: "video/mp4" });
    expect(d.got.prepare.info.alias).toStartWith("kaizen");
    expect(d.got.upload!.query).toEqual({ sessionId: "s-1", fileId: "f1", token: "tok-1" });
    expect(d.got.upload!.bytes.equals(await Bun.file(f).bytes().then(Buffer.from))).toBe(true);
    expect(steps[0]).toBe("waiting");
    expect(steps.at(-1)).toBe("uploading");
  } finally { d.stop(); }
});

test("a refusal, a busy device and no answer each say so, never sent", async () => {
  const f = file();
  for (const [status, words] of [[403, "Pixel 8 said no"], [409, "Pixel 8 is busy with another transfer"], [401, "PIN"], [500, "Pixel 8 answered 500"]] as const) {
    const d = fakeDevice(status);
    try {
      const r = await sendFile(d.dev, f);
      expect(r.ok).toBe(false);
      expect((r as any).error).toContain(words);
      expect(d.got.upload).toBeUndefined();
    } finally { d.stop(); }
  }
  const d = fakeDevice("hang");
  try {
    const r = await sendFile(d.dev, f, () => {}, { acceptMs: 300 });
    expect(r).toEqual({ ok: false, error: "No answer from Pixel 8 in 1 minute" });
  } finally { d.stop(); }
  // Nobody there at all.
  const r = await sendFile({ ...d.dev, port: 1 }, f);
  expect(r.ok).toBe(false);
  expect((r as any).error).toStartWith("Could not reach Pixel 8");
});

// A real LocalSend in HTTPS mode refuses a sender without a client certificate
// ("tlsv13 alert certificate required"), and reads the sender's fingerprint as its SHA-256.
test("we carry a self-signed certificate whose SHA-256 is our fingerprint", () => {
  const me = identity(), x = new X509Certificate(me.cert);
  expect(x.subject).toBe("CN=kaizen");
  expect(x.verify(x.publicKey)).toBe(true);
  expect(x.checkPrivateKey(createPrivateKey(me.key))).toBe(true);
  expect(x.fingerprint256.replace(/:/g, "")).toBe(me.fingerprint);
  expect(new Date(x.validTo).getTime()).toBeGreaterThan(Date.now() + 365 * 86_400_000);
  expect(identity()).toBe(me);
});

// A fake device that takes every file it is offered (or only `take`) and answers /info.
function fakePhone(take?: string[]) {
  const got: { offered?: string[]; uploads: Record<string, number> } = { uploads: {} };
  const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/api/localsend/v2/info") return Response.json({ alias: "Phone", fingerprint: "ph", deviceType: "mobile" });
    if (u.pathname === "/api/localsend/v2/prepare-upload") {
      const files = (await req.json()).files as Record<string, { fileName: string }>;
      got.offered = Object.values(files).map((f) => f.fileName);
      const ids = Object.keys(files).filter((id) => !take || take.includes(files[id]!.fileName));
      return Response.json({ sessionId: "s", files: Object.fromEntries(ids.map((id) => [id, `t-${id}`])) });
    }
    if (u.pathname === "/api/localsend/v2/upload") {
      const q = Object.fromEntries(u.searchParams);
      if (q.token !== `t-${q.fileId}`) return new Response(null, { status: 403 });
      got.uploads[q.fileId!] = (await req.arrayBuffer()).byteLength;
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 404 });
  } });
  return { addr: `127.0.0.1:${srv.port}`, got, stop: () => srv.stop(true) };
}

test("several files go in one session, and a file the device declines is named", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kaizen-ls-"));
  const a = join(dir, "a.pdf"), b = join(dir, "b.txt");
  writeFileSync(a, randomBytes(1000)); writeFileSync(b, "hi");
  const p = fakePhone(["a.pdf"]);
  try {
    const dev = (await reach(p.addr))!;
    expect(dev).toMatchObject({ alias: "Phone", ip: "127.0.0.1", protocol: "http" });
    expect(await sendFiles(dev, [a, b])).toEqual({ ok: true, skipped: ["b.txt"] });
    expect(p.got.offered).toEqual(["a.pdf", "b.txt"]);
    expect(p.got.uploads).toEqual({ f1: 1000 });
  } finally { p.stop(); }
  expect(await reach("127.0.0.1:1", 500)).toBeNull();
});

test("kaizen send: sends to --to, saves a default, and refuses folders and missing files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kaizen-ls-"));
  process.env.KAIZEN_LOCALSEND_FILE = join(dir, "localsend.json");
  const f = join(dir, "report.pdf");
  writeFileSync(f, randomBytes(500));
  const p = fakePhone(), out: string[] = [];
  const log = (s: string) => out.push(s);
  try {
    expect(await cli([f, "--to", p.addr], log)).toBe(0);
    expect(out.at(-1)).toContain("sent to Phone: report.pdf");
    expect(await cli(["--default", p.addr], log)).toBe(0);
    p.got.uploads = {};
    expect(await cli([f], log)).toBe(0);
    expect(p.got.uploads).toEqual({ f1: 500 });
    expect(await cli([dir], log)).toBe(1);
    expect(out.at(-1)).toContain("is a folder");
    expect(await cli([join(dir, "nope.pdf")], log)).toBe(1);
    expect(await cli([f, "--to", "127.0.0.1:1"], log)).toBe(1);
    expect(out.at(-1)).toContain("no LocalSend at 127.0.0.1:1");
  } finally { p.stop(); delete process.env.KAIZEN_LOCALSEND_FILE; }
});

test("probePeer finds a device by IP answering /info directly", async () => {
  const d = fakeDevice(200);
  try {
    const dev = await probePeer("127.0.0.1", 1000, d.dev.port);
    expect(dev).toMatchObject({
      alias: "Pixel 8",
      deviceModel: "Pixel",
      deviceType: "mobile",
      fingerprint: "fp-info",
      ip: "127.0.0.1",
      port: d.dev.port,
      protocol: "http",
    });
  } finally { d.stop(); }
});
