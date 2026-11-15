// The page's look and the side menu's fold, kept per browser in localStorage and applied to <html> before the page draws (the
// stored values by /boot.js, stored-look.ts; the rest here):
// theme (light, dark, or unset for the system's), colour (blue or monochrome), motion (full, reduce, or the system's), the
// desktop app's classes, and the iPhone app's fit. The board and the Notebook call bootShell() first; Settings and
// onboarding call setTheme / setColor / setMotion. CSS keys off data-theme, data-color, data-motion, data-rail and data-hide.
import { termNow } from "@lib/core";
import { setShell, setSetupRow, getShell } from "./shell-store.ts";
import { applyFold, applyStoredLook, fitStandalone, PHONE, WIDE } from "./stored-look.ts";

type Desktop = { titleBar?: (dark: boolean) => void };
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
// A look changed: Settings redraws its Theme row (`look`) and every terminal repaints (term.js).
const changed = () => {
  setShell((s) => ({ look: s.look + 1 }));
  termNow()?.retheme();
};

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

// The fold: see stored-look.ts; here it follows the width and the toggle.
let fold: string | null = null;
const wide = () => matchMedia(WIDE),
  phone = () => matchMedia(PHONE);
const applyRail = () => setShell({ min: applyFold(root(), fold) });
export function toggleRail() {
  fold = root().dataset.rail === "min" ? "full" : "min";
  keep("kz-rail", fold);
  applyRail();
}

let booted = false;
export function bootShell() {
  if (booted) return;
  booted = true;
  // /boot.js (in the page head) has done these before the first paint; they are repeated for a page without it.
  applyStoredLook();
  if (!root().dataset.boot) fitStandalone();
  fold = stored("kz-rail");
  wide().addEventListener("change", applyRail);
  phone().addEventListener("change", applyRail);
  applyRail();
  // Settings changed in another window or tab apply here at once, not on the next reload.
  addEventListener("storage", (e) => {
    const k = ({ "kz-theme": "theme", "kz-color": "color", "kz-motion": "motion" } as Record<string, string>)[
      e.key ?? ""
    ];
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
