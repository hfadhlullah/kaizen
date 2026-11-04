// The annotator's proxy: serves one loopback page (a dev app the Browser tab frames) from a port
// of its own and adds one <script> to its HTML, so the board can annotate any page with no setup
// in the app. Why a separate port: the framed page's scripts then run on another origin than the
// board and cannot reach its APIs or terminals. Loopback only, in both directions: the proxy listens
// on 127.0.0.1, and it only ever fetches from a loopback target.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

export type Proxy = { origin: string; port: number; target: string; token: string; touched: number; close(): void };

const LOOP = ["localhost", "127.0.0.1", "[::1]"];
export const isLoopbackHost = (h: string) => LOOP.includes(h.toLowerCase());
const IDLE_MS = 6 * 3600_000; // a page left open overnight keeps working; the port is freed when the board stops
const SCRIPT = join(import.meta.dir, "..", "web", "annotate.js");

const proxies = new Map<string, Proxy>(); // by target origin

// A Location on the target's own origin becomes a path; anywhere else is refused (a redirect could lead off localhost).
export function rewriteLocation(loc: string, base: URL): string | null {
  let u: URL;
  try { u = new URL(loc, base); } catch { return null; }
  return u.origin === base.origin ? u.pathname + u.search + u.hash : null;
}

export function inject(html: string, token: string): string {
  const tag = `<script src="/__kz/annotate.js?t=${token}"></script>`;
  const m = /<head[^>]*>/i.exec(html) ?? /<html[^>]*>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length) : tag + html;
}

// localhost can mean 127.0.0.1 or ::1 (Vite listens on one of them); try the others when the first refuses.
const hostsFor = (t: URL) => (t.hostname === "localhost" ? ["localhost", "127.0.0.1", "[::1]"] : [t.hostname]);

export function openProxy(target: URL): Proxy {
  if (!/^https?:$/.test(target.protocol) || !isLoopbackHost(target.hostname)) throw new Error("only a localhost address");
  const old = proxies.get(target.origin);
  if (old) return (old.touched = Date.now()), old;

  const token = randomBytes(16).toString("hex");
  let good = target.hostname;
  const upstream = (host: string, path: string) => {
    const u = new URL(target.origin);
    u.hostname = host.replace(/^\[|\]$/g, "");
    return new URL(path, u);
  };

  const server = Bun.serve<{ url: string; protocols: string[]; up?: WebSocket; q: (string | Buffer)[] }>({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req, srv) {
      // Host first: a name rebound to 127.0.0.1 by an attacker's DNS still arrives with its own Host.
      const host = (req.headers.get("host") ?? "").toLowerCase();
      if (host !== `127.0.0.1:${srv.port}` && host !== `localhost:${srv.port}`) return new Response("forbidden", { status: 403 });
      px.touched = Date.now();
      const url = new URL(req.url);
      if (url.pathname === "/__kz/annotate.js") {
        return new Response(readFileSync(SCRIPT), { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
      }
      const path = url.pathname + url.search;

      if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const protocols = (req.headers.get("sec-websocket-protocol") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        const wsUrl = upstream(good, path);
        wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
        const ok = srv.upgrade(req, { data: { url: wsUrl.href, protocols, q: [] }, headers: protocols[0] ? { "sec-websocket-protocol": protocols[0] } : undefined });
        return ok ? undefined : new Response("upgrade failed", { status: 400 });
      }

      const headers = new Headers(req.headers);
      for (const h of ["host", "connection", "accept-encoding", "content-length"]) headers.delete(h);
      headers.set("accept-encoding", "identity");
      if (headers.has("origin")) headers.set("origin", target.origin);
      const ref = headers.get("referer");
      if (ref) headers.set("referer", ref.replace(url.origin, target.origin));
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();

      let r: Response | null = null;
      let last: unknown;
      for (const h of [good, ...hostsFor(target).filter((x) => x !== good)]) {
        try {
          r = await fetch(upstream(h, path), { method: req.method, headers, body, redirect: "manual" });
          good = h;
          break;
        } catch (e) { last = e; }
      }
      if (!r) return new Response(`kaizen could not reach ${target.origin}: ${(last as Error)?.message ?? "refused"}`, { status: 502 });

      const out = new Headers(r.headers);
      // Loopback dev servers only: frame and CSP rules would stop the page showing here or running our script.
      for (const h of ["x-frame-options", "content-security-policy", "content-security-policy-report-only", "content-length", "content-encoding", "transfer-encoding"]) out.delete(h);
      const loc = r.headers.get("location");
      if (loc && r.status >= 300 && r.status < 400) {
        const to = rewriteLocation(loc, target);
        if (to === null) return new Response("kaizen refused a redirect away from localhost", { status: 502 });
        out.set("location", to);
        return new Response(null, { status: r.status, headers: out });
      }
      if ((r.headers.get("content-type") ?? "").toLowerCase().includes("text/html") && req.method !== "HEAD") {
        return new Response(inject(await r.text(), token), { status: r.status, headers: out });
      }
      return new Response(r.body, { status: r.status, headers: out });
    },
    websocket: {
      open(ws) {
        const d = ws.data;
        const up = new WebSocket(d.url, { protocols: d.protocols, headers: { origin: target.origin } } as any);
        d.up = up;
        up.binaryType = "arraybuffer";
        up.onopen = () => { for (const m of d.q) up.send(m); d.q.length = 0; };
        up.onmessage = (e) => ws.send(e.data as any);
        up.onclose = () => ws.close();
        up.onerror = () => ws.close();
      },
      message(ws, m) { const up = ws.data.up; up && up.readyState === 1 ? up.send(m) : ws.data.q.push(m); },
      close(ws) { try { ws.data.up?.close(); } catch { /* gone */ } },
    },
  });

  const timer = setInterval(() => { if (Date.now() - px.touched > IDLE_MS) px.close(); }, 5 * 60_000);
  (timer as any).unref?.();
  const px: Proxy = {
    origin: `http://127.0.0.1:${server.port}`, port: server.port ?? 0, target: target.origin, token, touched: Date.now(),
    close() { clearInterval(timer); proxies.delete(target.origin); server.stop(true); },
  };
  proxies.set(target.origin, px);
  return px;
}

export const closeAllProxies = () => { for (const p of [...proxies.values()]) p.close(); };
