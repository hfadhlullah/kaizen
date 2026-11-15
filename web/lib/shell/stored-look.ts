// What the page looks like before it draws, from what this browser kept: theme (light, dark, or unset for the system's),
// colour, motion, the side menu's fold, the desktop app's classes and the iPhone app's fit. No imports: it is the whole of
// web/boot/boot.ts (a tiny blocking script in the page head, so the first paint is already the person's theme) and the first
// thing bootShell() does again when the bundle starts.
type Desktop = { platform?: string };
const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
// The fold: the person's choice (kz-rail) wins; with none the width decides; a phone always gets icons.
export const WIDE = "(max-width:1100px)";
export const PHONE = "(max-width:640px)";
export const folded = (fold: string | null, wide: boolean, phone: boolean) => phone || (fold ? fold === "min" : wide);
// Sets data-rail and data-hide for `fold` ("min", "full" or null: none chosen); true when the menu shows icons only.
export function applyFold(root: HTMLElement, fold: string | null) {
  const phone = matchMedia(PHONE).matches,
    min = folded(fold, matchMedia(WIDE).matches, phone);
  root.dataset.rail = min ? "min" : "full";
  root.dataset.hide = !phone && fold === "min" ? "1" : "0";
  return min;
}
export function applyStoredLook(root: HTMLElement = document.documentElement) {
  applyFold(root, get("kz-rail"));
  // The desktop app: its own rules (html.desk, html.mac).
  const d = (window as unknown as { kaizenDesktop?: Desktop }).kaizenDesktop;
  if (d) {
    root.classList.add("desk");
    if (d.platform === "darwin") root.classList.add("mac");
  }
  if (get("kz-color") === "blue") root.dataset.color = "blue";
  const t = get("kz-theme");
  if (t) root.dataset.theme = t;
  const m = get("kz-motion");
  if (m) root.dataset.motion = m;
}
// Installed on iOS the page fits the window and does not zoom.
export function fitStandalone() {
  const nav = navigator as unknown as { standalone?: boolean };
  if (!matchMedia("(display-mode:standalone)").matches && !nav.standalone) return;
  const vp = document.querySelector<HTMLMetaElement>("meta[name=viewport]");
  if (vp) vp.content += ",maximum-scale=1,user-scalable=no";
  addEventListener("gesturestart", (e) => e.preventDefault());
  if (nav.standalone) addEventListener("resize", () => scrollTo(0, 0));
}
