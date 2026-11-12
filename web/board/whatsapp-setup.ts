// The WhatsApp card: Settings → Mobile. Walks the user through linking WhatsApp Web,
// displaying a QR code that connects to the background Baileys bridge.
import { html, raw } from "./dom.ts";

type WAStatus = {
  installed: boolean;
  running: boolean;
  connected: boolean;
  user: string | null;
  qrSvg: string | null;
  error: string | null;
};

async function callWA(body?: object) {
  try {
    const r = await fetch(
      "/whatsapp",
      body
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined
    );
    return await r.json();
  } catch {
    return { error: "The board did not answer." };
  }
}

export async function mountWhatsApp(el: HTMLElement) {
  let s: WAStatus | null = null,
    err = "",
    busy = false,
    timer: any = null;

  const draw = () => {
    if (!s) return;
    const e = err ? html`<p class="ph-err" role="alert">${err}</p>` : "";
    if (s.connected) {
      el.innerHTML = String(html`
        <div class="ph-on">
          <div>
            <p class="ph-h">WhatsApp Bridge</p>
            <p class="ph-st"><i class="ph-dot on"></i> Connected as <b>${s.user || "WhatsApp"}</b></p>
            <p class="ph-note">Kaizen can send files and videos directly to your WhatsApp in the background.</p>
            <div class="ph-row" style="margin-top:12px">
              <button type="button" class="btn" data-wa="disconnect">${busy ? "Disconnecting…" : "Unlink WhatsApp"}</button>
            </div>
            ${e}
          </div>
        </div>
      `);
      return;
    }

    if (s.qrSvg) {
      el.innerHTML = String(html`
        <div class="ph-on">
          <div class="ph-qr" aria-label="WhatsApp QR code">${raw(s.qrSvg)}</div>
          <div>
            <p class="ph-h">Link WhatsApp</p>
            <ol class="ph-steps">
              <li>Open WhatsApp on your phone</li>
              <li>Tap <b>Settings</b> or <b>⋮</b> &gt; <b>Linked Devices</b></li>
              <li>Tap <b>Link a Device</b> and scan this QR code</li>
            </ol>
            <div class="ph-row" style="margin-top:12px">
              <button type="button" class="btn" data-wa="check">Refresh</button>
              <button type="button" class="btn" data-wa="disconnect">Cancel</button>
            </div>
            ${e}
          </div>
        </div>
      `);
      return;
    }

    // Bridge up, no QR and not linked: mid-scan or reconnecting. Keep polling, say so.
    if (s.running) {
      el.innerHTML = String(html`<div><p class="ph-h">WhatsApp Bridge</p><p class="ph-wait">Connecting…</p>${e}</div>`);
      return;
    }

    el.innerHTML = String(html`
      <div>
        <p class="ph-h">WhatsApp Bridge</p>
        <p>Send finished videos and files straight to your phone's WhatsApp without opening any app.</p>
        <div class="ph-row" style="margin-top:12px">
          <button type="button" class="btn pri" data-wa="connect">${busy ? "Starting…" : "Link WhatsApp"}</button>
        </div>
        ${e}
      </div>
    `);
  };

  const load = async () => {
    const r = await callWA();
    if (r.error && !r.installed) err = r.error;
    else s = r;
    draw();
  };

  el.innerHTML = `<p class="ph-wait">Checking WhatsApp…</p>`;
  await load();

  // Poll while waiting for connection or QR scan
  const poll = async () => {
    if (!el.isConnected) {
      clearInterval(timer);
      return;
    }
    if (s && !s.connected && (s.qrSvg || busy || s.running)) {
      const r = await callWA();
      if (!r.error) {
        s = r;
        draw();
      }
    }
  };
  timer = setInterval(poll, 2500);

  el.onclick = async (ev) => {
    const a = (ev.target as HTMLElement).closest<HTMLElement>("[data-wa]")?.dataset.wa;
    if (!a || busy) return;
    err = "";
    if (a === "check") return load();
    busy = true;
    draw();
    if (a === "connect") {
      const r = await callWA({ op: "connect" });
      busy = false;
      if (r.error) err = r.error;
      else s = r;
      draw();
    } else if (a === "disconnect") {
      await callWA({ op: "disconnect" });
      busy = false;
      await load();
    }
  };
}
