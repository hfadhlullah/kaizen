import { $, html } from "./dom.ts";

// The microphone dictation uses, per browser. No choice means the system default.
const KEY = "kz-mic";
export const savedMic = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
export const micAudio = (device = "") => ({ channelCount: 1, noiseSuppression: true, echoCancellation: true, ...(device ? { deviceId: { exact: device } } : {}) });

// An unplugged choice falls back to the default, and says so. Anything else is the caller's.
export async function openMic(get: (audio: object) => Promise<MediaStream>, device: string, warn: (m: string) => void) {
  try { return await get(micAudio(device)); } catch (err: any) {
    if (!device || err?.name !== "OverconstrainedError") throw err;
    warn("Chosen microphone not found. Using the default");
    return get(micAudio());
  }
}

export const micRow = () => html`<select class="sel" id="v-mic" aria-labelledby="v-mic-l"><option value="">System default</option></select>`;

// Device names appear only once the browser has microphone permission.
export async function fillMics() {
  const s = $("v-mic") as HTMLSelectElement | null;
  if (!s || !navigator.mediaDevices?.enumerateDevices) return;
  const saved = savedMic();
  const mics = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default");
  s.innerHTML = html`<option value="">System default</option>${mics.map((d, i) => html`<option value="${d.deviceId}">${d.label || `Microphone ${i + 1}`}</option>`)}`.s;
  s.value = mics.some((d) => d.deviceId === saved) ? saved : "";
  s.onchange = () => { try { localStorage.setItem(KEY, s.value); } catch { /* this browser keeps nothing */ } };
}
