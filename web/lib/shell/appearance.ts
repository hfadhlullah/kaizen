// The page's look and the side menu's fold, kept per browser in localStorage and applied to <html> before the page draws:
// theme (light, dark, or unset for the system's), colour (blue or monochrome), motion (full, reduce, or the system's), the
// desktop app's classes, and the iPhone app's fit. The board and the Notebook call bootShell() first; Settings and
// onboarding call setTheme / setColor / setMotion. CSS keys off data-theme, data-color, data-motion, data-rail and data-hide.
import { setShell, setSetupRow, getShell } from "./shell-store.ts";

type Desktop = { platform?: string; titleBar?: (dark: boolean) => void };
const root = () => document.documentElement;
const stored = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const keep = (k: string, v: string | null) => {
  try {
    v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
  } catch {}
};
const desk = () => (window as unknown as { kaizenDesktop?: Desktop }).kaizenDesktop;
const system = () => matchMedia("(prefers-color-scheme: dark)").matches;
const dark = () => (root().dataset.theme ? root().dataset.theme === "dark" : system());
// The theme toggle shows what is on screen; the desktop app's window buttons follow it.
const paint = () => {
  setShell({ dark: dark() });
  desk()?.titleBar?.(dark());
};
const changed = () => dispatchEvent(new Event("kz-theme"));

export function setTheme(t: string) {
  if (t === "system") delete root().dataset.theme;
  else root().dataset.theme = t;
  keep("kz-theme", t === "system" ? null : t);
  paint();
  changed();
}
export function setColor(c: string) {
  if (c === "blue") root().dataset.color = c;
  else delete root().dataset.color;
  keep("kz-color", c === "blue" ? c : null);
  changed();
}
export function setMotion(m: string) {
  if (m === "system") delete root().dataset.motion;
  else root().dataset.motion = m;
  keep("kz-motion", m === "system" ? null : m);
}
export const toggleTheme = () => setTheme(getShell().dark ? "light" : "dark");

// The fold: the person's choice (kz-rail) wins; with none the width decides; a phone always gets icons.
const wide = () => matchMedia("(max-width:1100px)"),
  phone = () => matchMedia("(max-width:640px)");
let fold: string | null = null;
function applyRail() {
  const min = phone().matches || (fold ? fold === "min" : wide().matches);
  root().dataset.rail = min ? "min" : "full";
  root().dataset.hide = !phone().matches && fold === "min" ? "1" : "0";
  setShell({ min });
}
export function toggleRail() {
  fold = root().dataset.rail === "min" ? "full" : "min";
  keep("kz-rail", fold);
  applyRail();
}

let booted = false;
export function bootShell() {
  if (booted) return;
  booted = true;
  // Installed on iOS the page fits the window and does not zoom.
  if (matchMedia("(display-mode:standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone) {
    const vp = document.querySelector<HTMLMetaElement>("meta[name=viewport]");
    if (vp) vp.content += ",maximum-scale=1,user-scalable=no";
    addEventListener("gesturestart", (e) => e.preventDefault());
    if ((navigator as unknown as { standalone?: boolean }).standalone) addEventListener("resize", () => scrollTo(0, 0));
  }
  fold = stored("kz-rail");
  wide().addEventListener("change", applyRail);
  phone().addEventListener("change", applyRail);
  applyRail();
  // The desktop app: its own rules (html.desk, html.mac).
  const d = desk();
  if (d) {
    root().classList.add("desk");
    if (d.platform === "darwin") root().classList.add("mac");
  }
  if (stored("kz-color") === "blue") root().dataset.color = "blue";
  const t = stored("kz-theme");
  if (t) root().dataset.theme = t;
  const m = stored("kz-motion");
  if (m) root().dataset.motion = m;
  // Settings changed in another window or tab apply here at once, not on the next reload.
  addEventListener("storage", (e) => {
    const k = ({ "kz-theme": "theme", "kz-color": "color", "kz-motion": "motion" } as Record<string, string>)[e.key ?? ""];
    if (!k) return;
    if (e.newValue) root().dataset[k] = e.newValue;
    else delete root().dataset[k];
    changed();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paint);
  paint();
  // Setup: while first-run onboarding is skipped or unfinished, a row in the side menu continues it.
  fetch("/onboarding")
    .then((r) => (r.ok ? r.json() : null))
    .then(setSetupRow)
    .catch(() => {});
}
