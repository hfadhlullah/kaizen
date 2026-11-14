// The Browser tab's address and history as plain data. `load` counts the times the frame must load the address
// (go, back, forward, reload); a page that navigated on its own only changes the address (`landed`), so the frame is
// not loaded a second time.
export type Nav = { url: string; back: string[]; fwd: string[]; load: number };
export const DEFAULT_URL = "http://localhost:3000";
export const browseKey = (k: string) => "kz-browse:" + k;
// The address kept for a workspace, else localhost:3000.
export function startUrl(k: string): string {
  try {
    return localStorage.getItem(browseKey(k)) || DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}
export function keepUrl(k: string, u: string) {
  try {
    localStorage.setItem(browseKey(k), u);
  } catch {}
}
// A typed address without a scheme is http.
export const withScheme = (v: string) => (/^https?:\/\//.test(v.trim()) ? v.trim() : "http://" + v.trim());
export const isLoopback = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(u);
export const start = (url: string): Nav => ({ url, back: [], fwd: [], load: 0 });
export const navTo = (n: Nav, u: string, push = true): Nav =>
  push && n.url !== u
    ? { url: u, back: [...n.back, n.url], fwd: [], load: n.load + 1 }
    : { ...n, url: u, load: n.load + 1 };
export const navReload = (n: Nav): Nav => navTo(n, n.url, false);
export const navBack = (n: Nav): Nav =>
  n.back.length ? { url: n.back.at(-1)!, back: n.back.slice(0, -1), fwd: [...n.fwd, n.url], load: n.load + 1 } : n;
export const navFwd = (n: Nav): Nav =>
  n.fwd.length ? { url: n.fwd.at(-1)!, back: [...n.back, n.url], fwd: n.fwd.slice(0, -1), load: n.load + 1 } : n;
export const landed = (n: Nav, u: string): Nav =>
  u === n.url ? n : { url: u, back: [...n.back, n.url], fwd: [], load: n.load };

export const FAR =
  "This page is on the computer running kaizen; from this device localhost is the device itself. Use Open in browser on that computer.";
// What /expose answered for a loopback page on a device that is not the board's computer.
export type Exposed = { ok: boolean; url?: string; hint?: string; error?: string };
const json = { "content-type": "application/json" };
export const expose = (url: string): Promise<Exposed> =>
  fetch("/expose", { method: "POST", headers: json, body: JSON.stringify({ url }) }).then((r) => r.json());
// Whether a site can be framed (X-Frame-Options / frame-ancestors): the browser only shows its own error page otherwise.
export const frameable = (url: string): Promise<{ frameable?: boolean }> =>
  fetch("/frameable?url=" + encodeURIComponent(url)).then((r) => r.json());
// A Chromium app window on the board's computer (POST /open-url); the error to say when it did not open, or null.
export async function openAppWindow(url: string): Promise<string | null> {
  const r = await fetch("/open-url", { method: "POST", headers: json, body: JSON.stringify({ url }) }).catch(
    () => null,
  );
  if (r?.ok) return null;
  return "Could not open a browser window" + (r ? ": " + ((await r.json().catch(() => ({}))) as any).error : "");
}
