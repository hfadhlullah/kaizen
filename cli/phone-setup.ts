// Settings → Phone and the onboarding phone step: what `kaizen setup` does for the phone,
// as board routes. GET says where this computer stands, POST connects or logs in.
import { qrMatrix } from "./qr.ts";
import { addWebHost, webHosts } from "./state.ts";

export type PhoneState = {
  state: "missing" | "login" | "ready" | "connected";
  account: string; // the Tailscale login the phone must use too
  url: string; // the phone address, once connected
  phones: { name: string; online: boolean }[];
  qr: string; // svg, once connected
};

// From `tailscale status --json` (null when the command is not there) and the saved board names.
export function phoneState(json: string | null, hosts: Set<string>): PhoneState {
  const out: PhoneState = { state: "missing", account: "", url: "", phones: [], qr: "" };
  if (json === null) return out;
  let s: any;
  try { s = JSON.parse(json); } catch { return { ...out, state: "login" }; }
  const name = String(s?.Self?.DNSName ?? "").replace(/\.$/, "").toLowerCase();
  out.account = String(s?.User?.[s?.Self?.UserID]?.LoginName ?? "");
  out.phones = Object.values<any>(s?.Peer ?? {})
    .filter((p) => /^(ios|android)$/i.test(p?.OS ?? ""))
    // Android reports "localhost" as its host name: the tailnet's name for it says more.
    .map((p) => ({ name: String(p.HostName && p.HostName !== "localhost" ? p.HostName : String(p.DNSName ?? "").split(".")[0] || "phone"), online: !!p.Online }));
  if (s?.BackendState !== "Running" || !name) return { ...out, state: "login" };
  if (!hosts.has(name)) return { ...out, state: "ready" };
  const url = `https://${name}`;
  let qr = "";
  try { qr = qrSvg(url); } catch { /* a name too long for the code: the address still shows */ }
  return { ...out, state: "connected", url, qr };
}

// Dark modules on white with a four-module quiet zone, so it scans in a dark theme too.
export function qrSvg(text: string): string {
  const g = qrMatrix(text), q = 4, n = g.length + 2 * q;
  let d = "";
  g.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + q} ${y + q}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

const OPERATOR = /operator|root|access denied|permission/i;
const PERMISSION = "Tailscale needs permission once. Run  sudo tailscale set --operator=$USER  in a terminal, then try again.";

type Run = (argv: string[]) => Promise<{ ok: boolean; out: string; err: string }>;

const run: Run = async (argv) => {
  try {
    const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", timeout: 10_000, windowsHide: true });
    const [out, err] = [await new Response(p.stdout).text(), await new Response(p.stderr).text()];
    return { ok: (await p.exited) === 0, out, err };
  } catch { return { ok: false, out: "", err: "tailscale is not installed" }; }
};

export async function readPhone(r: Run = run): Promise<PhoneState> {
  const s = await r(["tailscale", "status", "--json"]);
  // Logged out, `status` exits non-zero but still prints JSON; not installed, it prints nothing.
  return phoneState(s.out.trim() ? s.out : s.err === "tailscale is not installed" ? null : "", webHosts());
}

// Shares the board on the tailnet (never funnel) and saves its name, as `kaizen setup` does.
export async function connectPhone(port: number, r: Run = run): Promise<PhoneState | { error: string }> {
  const now = await readPhone(r);
  if (now.state === "missing" || now.state === "login") return now;
  const s = await r(["tailscale", "serve", "--bg", `127.0.0.1:${port}`]);
  if (!s.ok) {
    const msg = s.err + s.out;
    return { error: OPERATOR.test(msg) ? PERMISSION : msg.trim().split("\n")[0] || "tailscale serve failed" };
  }
  const name = (await r(["tailscale", "status", "--json"])).out;
  try { addWebHost(String(JSON.parse(name).Self.DNSName).replace(/\.$/, "")); } catch { return { error: "Tailscale stopped while connecting" }; }
  return readPhone(r);
}

// `tailscale login` prints the sign-in page and waits for it; the page is all the board needs.
export async function loginUrl(): Promise<{ url: string } | { error: string }> {
  let p: ReturnType<typeof Bun.spawn>;
  try { p = Bun.spawn(["tailscale", "login"], { stdout: "pipe", stderr: "pipe", windowsHide: true }); }
  catch { return { error: "tailscale is not installed" }; }
  let text = "";
  const page = (s: ReadableStream<Uint8Array>) => (async () => {
    const dec = new TextDecoder();
    for await (const chunk of s) {
      text += dec.decode(chunk);
      const m = /https:\/\/login\.tailscale\.com\/\S+/.exec(text);
      if (m) return m[0];
    }
    return new Promise<string>(() => {}); // this stream ended without one: the other or the timer decides
  })();
  const found = await Promise.race([page(p.stdout as ReadableStream<Uint8Array>), page(p.stderr as ReadableStream<Uint8Array>), new Promise<string>((ok) => setTimeout(() => ok(""), 8000))]);
  // Left running when it printed a page: it finishes the login once the user signs in.
  if (found) return { url: found };
  p.kill();
  if ((await readPhone()).state !== "login") return { url: "" }; // it logged in without a page
  return { error: OPERATOR.test(text) ? PERMISSION : "Open the Tailscale app on this computer and log in there." };
}
