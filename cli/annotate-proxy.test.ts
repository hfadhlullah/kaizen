import { test, expect, afterAll } from "bun:test";
import { openProxy, closeAllProxies, inject, rewriteLocation } from "./annotate-proxy.ts";

const target = Bun.serve<undefined>({
  hostname: "127.0.0.1", port: 0,
  fetch(req, srv) {
    const u = new URL(req.url);
    if (u.pathname === "/ws") return srv.upgrade(req) ? undefined : new Response("no", { status: 400 });
    if (u.pathname === "/") return new Response("<!doctype html><html><head><title>t</title></head><body>hi</body></html>", { headers: { "content-type": "text/html", "x-frame-options": "DENY", "content-security-policy": "frame-ancestors 'none'" } });
    if (u.pathname === "/echo") return req.text().then((t) => new Response(JSON.stringify({ m: req.method, q: u.search, t, host: req.headers.get("host"), origin: req.headers.get("origin") }), { headers: { "content-type": "application/json" } }));
    if (u.pathname === "/same") return new Response(null, { status: 302, headers: { location: `http://127.0.0.1:${target.port}/after?x=1` } });
    if (u.pathname === "/off") return new Response(null, { status: 302, headers: { location: "https://example.com/" } });
    return new Response("nope", { status: 404 });
  },
  websocket: { message(ws, m) { ws.send("echo:" + m); } },
});
const px = openProxy(new URL(`http://127.0.0.1:${target.port}`));
afterAll(() => { closeAllProxies(); target.stop(true); });

test("html gets the script and loses frame headers", async () => {
  const r = await fetch(px.origin + "/");
  const t = await r.text();
  expect(t).toContain(`<head><script src="/__kz/annotate.js?t=${px.token}"></script>`);
  expect(r.headers.get("x-frame-options")).toBeNull();
  expect(r.headers.get("content-security-policy")).toBeNull();
});

test("path, query, method and body go through; host and origin become the target's", async () => {
  const r = await (await fetch(px.origin + "/echo?a=1", { method: "POST", body: "payload", headers: { origin: px.origin } })).json();
  expect(r).toEqual({ m: "POST", q: "?a=1", t: "payload", host: `127.0.0.1:${target.port}`, origin: `http://127.0.0.1:${target.port}` });
});

test("a redirect on the target becomes a path; one off localhost is refused", async () => {
  const a = await fetch(px.origin + "/same", { redirect: "manual" });
  expect(a.headers.get("location")).toBe("/after?x=1");
  const b = await fetch(px.origin + "/off", { redirect: "manual" });
  expect(b.status).toBe(502);
  expect(rewriteLocation("https://example.com/", new URL("http://localhost:1"))).toBeNull();
});

test("a foreign Host is refused", async () => {
  const r = await fetch(px.origin + "/", { headers: { host: "evil.example" } });
  expect(r.status).toBe(403);
});

test("the proxy only listens on loopback and only targets loopback", () => {
  expect(px.origin.startsWith("http://127.0.0.1:")).toBe(true);
  expect(() => openProxy(new URL("https://example.com"))).toThrow();
  expect(() => openProxy(new URL("http://192.168.1.5:3000"))).toThrow();
  expect(px.port).not.toBe(target.port);
});

test("the script is served by the proxy itself and the same target reuses its proxy", async () => {
  expect((await fetch(px.origin + "/__kz/annotate.js")).headers.get("content-type")).toContain("javascript");
  expect(openProxy(new URL(`http://127.0.0.1:${target.port}/other`))).toBe(px);
});

test("websockets are relayed", async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${px.port}/ws`);
  const got = await new Promise<string>((res, rej) => { ws.onopen = () => ws.send("ping"); ws.onmessage = (e) => res(String(e.data)); ws.onerror = () => rej(new Error("ws error")); });
  expect(got).toBe("echo:ping");
  ws.close();
});

test("inject works without a head", () => {
  expect(inject("<html><body>x</body></html>", "T")).toMatch(/^<html><script src="\/__kz\/annotate.js\?t=T"><\/script><body>/);
  expect(inject("plain", "T").startsWith("<script")).toBe(true);
});
