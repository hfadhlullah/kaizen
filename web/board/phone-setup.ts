// The phone card: Settings → Mobile and the onboarding phone step. Walks the user from no
// Tailscale to a QR the phone scans, through /phone/setup on the board.
import { html, raw } from "./dom.ts";

type State = { state: "missing" | "login" | "ready" | "connected"; account: string; url: string; phones: { name: string; online: boolean }[]; qr: string };

const DOWNLOAD = "https://tailscale.com/download";

async function call(body?: object) {
  try {
    const r = await fetch("/phone/setup", body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
    return await r.json();
  } catch {
    return { error: "The board did not answer." };
  }
}

const btn = (a: string, text: string, pri = false) => html`<button type="button" class="btn${pri ? " pri" : ""}" data-ph="${a}">${text}</button>`;
const ol = (items: unknown[]) => html`<ol class="ph-steps">${items.map((i) => html`<li>${i}</li>`)}</ol>`;

function body(s: State, err: string, busy: boolean) {
  const e = err ? html`<p class="ph-err" role="alert">${err}</p>` : "";
  const acct = s.account ? html`<b>${s.account}</b>` : "the same account";
  if (s.state === "missing")
    return html`<p>Your phone reaches this computer through Tailscale, a free private network between your own devices.</p>${ol([
      "Install Tailscale on this computer and log in.",
      "Install it on your phone too and log in with the same account.",
    ])}<div class="ph-row"><a class="btn pri" href="${DOWNLOAD}" target="_blank" rel="noopener">Install Tailscale</a>${btn("check", "Check again")}</div>${e}`;
  if (s.state === "login")
    return html`<p>Tailscale is installed but not logged in on this computer.</p><div class="ph-row">${btn("login", busy ? "Opening…" : "Log in to Tailscale", true)}${btn("check", "Check again")}</div>${e}`;
  if (s.state === "ready")
    return html`<p>Tailscale is running${s.account ? html` as ${acct}` : ""}. Connect to show the code your phone scans.</p><div class="ph-row">${btn("connect", busy ? "Connecting…" : "Connect phone", true)}</div>${e}`;
  const on = s.phones.some((p) => p.online);
  return html`<div class="ph-on">${s.qr ? html`<div class="ph-qr" aria-label="QR code for ${s.url}">${raw(s.qr)}</div>` : ""}<div><p class="ph-h">On your phone</p>${ol([
    html`Install Tailscale from the <a href="${DOWNLOAD}" target="_blank" rel="noopener">App Store or Play Store</a>.`,
    s.account ? html`Log in with ${acct}, the account this computer uses.` : "Log in with the same account as this computer.",
    html`Scan this code with the camera, or open <a href="${s.url}" target="_blank" rel="noopener">${s.url}</a>.`,
    "Choose Add to Home screen so it opens like an app.",
  ])}<p class="ph-st"><i class="ph-dot${on ? " on" : ""}"></i>${on ? `Phone online: ${s.phones.filter((p) => p.online).map((p) => p.name).join(", ")}` : s.phones.length ? "Phone on your tailnet, offline right now" : "No phone on your tailnet yet"}</p></div></div><p class="ph-note">Anyone on your tailnet can use this board. Keep the tailnet to your own devices, or limit it with Tailscale access rules.</p>${e}`;
}

// Draws into `el` and keeps it current while it is on the page.
export async function mountPhone(el: HTMLElement) {
  let s: State | null = null, err = "", busy = false;
  const draw = () => {
    if (s) el.innerHTML = String(body(s, err, busy));
  };
  const load = async () => {
    const r = await call();
    if (r.error) err = r.error;
    else s = r;
    draw();
  };
  el.innerHTML = `<p class="ph-wait">Checking Tailscale…</p>`;
  el.onclick = async (ev) => {
    const a = (ev.target as HTMLElement).closest<HTMLElement>("[data-ph]")?.dataset.ph;
    if (!a || busy) return;
    err = "";
    if (a === "check") return load();
    busy = true;
    draw();
    const r = await call({ do: a });
    busy = false;
    if (r.error) err = r.error;
    else if (a === "login") {
      if (r.url) window.open(r.url, "_blank", "noopener");
      // The sign-in happens in the browser: look again until Tailscale is running, for two minutes.
      for (let i = 0; i < 40 && el.isConnected && s?.state === "login"; i++) {
        await new Promise((ok) => setTimeout(ok, 3000));
        const n = await call();
        if (!n.error) s = n;
      }
    } else s = r;
    draw();
  };
  await load();
  // The phone's dot follows it joining the tailnet; stops once the card leaves the page.
  const t = setInterval(() => (el.isConnected ? s?.state === "connected" && !busy && void load() : clearInterval(t)), 10_000);
}
