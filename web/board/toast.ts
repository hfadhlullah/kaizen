import { $ } from "./dom.ts";

// With `report`, the toast carries a link to a prefilled GitHub bug form (/issue) and
// stays long enough to click it.
let tt;
export function toast(s, report) {
  const t = $("toast");
  t.textContent = s;
  t.classList.toggle("rep", !!report);
  if (report) {
    const a = document.createElement("a");
    a.href = "/issue?" + new URLSearchParams(report);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Report";
    t.append(" ", a);
  }
  t.classList.add("on");
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove("on"), report ? 8000 : 4000);
}
export function askNotify() {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
  } catch (e) {}
}
// Per browser: whether notices go out at all, and the sound each one plays. The OS
// notification's own sound is often silent (Windows toasts, focus assist), so the page
// plays its own, synthesized: no audio files to ship.
const pref = (k, d) => {
  try {
    return localStorage.getItem(k) || d;
  } catch (e) {
    return d;
  }
};
export const notifyOn = () => pref("kz-notify", "on") === "on";
export const soundPick = () => pref("kz-sound", "chime");
export const SOUNDS = ["off", "chime", "bell", "pop"];
// [frequency Hz, start s, length s] per note.
const NOTES = { chime: [[880, 0, 0.25], [1320, 0.12, 0.35]], bell: [[660, 0, 0.9]], pop: [[520, 0, 0.08]] };
let actx;
export function playSound(name = soundPick()) {
  try {
    if (!NOTES[name]) return;
    actx = actx || new AudioContext();
    actx.resume();
    const t0 = actx.currentTime + 0.02;
    for (const [hz, at, len] of NOTES[name]) {
      const o = actx.createOscillator(),
        g = actx.createGain();
      o.type = name === "pop" ? "triangle" : "sine";
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      o.connect(g).connect(actx.destination);
      o.start(t0 + at);
      o.stop(t0 + at + len + 0.05);
    }
  } catch (e) {}
}
// A browser only lets a page make sound after a press on it; the first one unlocks it.
addEventListener("pointerdown", () => {
  try {
    actx = actx || new AudioContext();
    actx.resume();
  } catch (e) {}
}, { once: true });
// tag: one notification per thing, so several open board tabs replace each other's.
export function notifyUser(body, tag?: string) {
  if (!notifyOn()) return;
  playSound();
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted")
      new Notification("kaizen", { body, icon: "/logo.png", tag });
  } catch (e) {}
}
