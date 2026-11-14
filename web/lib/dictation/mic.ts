// The microphone dictation uses, per browser (Settings → Keyboard & Dictation picks it). No choice means the system default.
const KEY = "kz-mic";
export const savedMic = () => {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
};
export const saveMic = (id: string) => {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* this browser keeps nothing */
  }
};
export const micAudio = (device = "") => ({
  channelCount: 1,
  noiseSuppression: true,
  echoCancellation: true,
  ...(device ? { deviceId: { exact: device } } : {}),
});

// An unplugged choice falls back to the default, and says so. Anything else is the caller's.
export async function openMic(get: (audio: object) => Promise<MediaStream>, device: string, warn: (m: string) => void) {
  try {
    return await get(micAudio(device));
  } catch (err: any) {
    if (!device || err?.name !== "OverconstrainedError") throw err;
    warn("Chosen microphone not found. Using the default");
    return get(micAudio());
  }
}

// The inputs to pick from. Device names appear only once the browser has microphone permission.
export async function listMics(): Promise<{ id: string; label: string }[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  return all
    .filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default")
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
}
