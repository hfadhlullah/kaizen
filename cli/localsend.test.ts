// LocalSend's sending half against a fake device that speaks protocol v2: what it
// receives, and what each of its refusals reads as on the page.
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, X509Certificate, createPrivateKey } from "node:crypto";
import { identity, sendFile, type Device } from "./localsend.ts";

// prepare: what prepare-upload answers (a status, or "hang" to never answer).
function fakeDevice(prepare: number | "hang") {
  const got: { prepare?: any; upload?: { query: Record<string, string>; bytes: Buffer } } = {};
  const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
    const u = new URL(req.url);
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
