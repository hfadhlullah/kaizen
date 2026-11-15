// Settings → Phone and the onboarding phone step: the requests behind the Tailscale card (/phone/setup) and the WhatsApp
// card (/whatsapp), and the words each state shows.
export type PhoneState = {
  state: "missing" | "login" | "ready" | "connected";
  account: string;
  url: string;
  phones: { name: string; online: boolean }[];
  qr: string;
};
export type WAStatus = {
  installed: boolean;
  saved?: boolean;
  running: boolean;
  connected: boolean;
  user: string | null;
  qrSvg: string | null;
  error: string | null;
};
export const TAILSCALE_DOWNLOAD = "https://tailscale.com/download";
const GONE = "The board did not answer.";

// One JSON request to the board; a network failure answers { error } like the server's own errors.
async function send(path: string, body?: object) {
  try {
    const r = await fetch(
      path,
      body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : undefined,
    );
    return await r.json();
  } catch {
    return { error: GONE };
  }
}
export const phoneCall = (body?: object) => send("/phone/setup", body);
export const waCall = (body?: object) => send("/whatsapp", body);

// "Phone online: Pixel" / "Phone on your tailnet, offline right now" / "No phone on your tailnet yet".
export function phoneLine(phones: PhoneState["phones"]) {
  const on = phones.filter((p) => p.online);
  return {
    on: on.length > 0,
    text: on.length
      ? `Phone online: ${on.map((p) => p.name).join(", ")}`
      : phones.length
        ? "Phone on your tailnet, offline right now"
        : "No phone on your tailnet yet",
  };
}
// The server's QR is an SVG string; shown as an image so no markup is ever inserted into the page.
export const qrSrc = (svg: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
// Which WhatsApp card shows: the bridge's answer picks one.
export type WACard = "connected" | "qr" | "reconnecting" | "connecting" | "idle";
export const waCard = (s: WAStatus): WACard =>
  s.connected ? "connected" : s.qrSvg ? "qr" : s.saved ? "reconnecting" : s.running ? "connecting" : "idle";
// Poll while a link is on its way: a QR waiting for its scan, a start in progress, a saved login coming back.
export const waPolling = (s: WAStatus | null, busy: boolean) =>
  !!s && !s.connected && !!(s.qrSvg || busy || s.running || s.saved);
