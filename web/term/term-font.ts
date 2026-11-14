// The board terminals' font size, one per browser. Its own module so the bounds are testable
// without xterm and Settings can share them without loading the terminal bundle.
export const FONT_MIN = 8;
export const FONT_MAX = 24;
export const FONT_BASE = 12;

export function fontRead(): number {
  try {
    const n = Number(localStorage.getItem("kz-term-font"));
    if (Number.isInteger(n) && n >= FONT_MIN && n <= FONT_MAX) return n;
  } catch {}
  return FONT_BASE;
}

// Every mounted terminal listens for the event, so the size holds across tiles and panes.
export function fontSet(n: number) {
  try {
    localStorage.setItem("kz-term-font", String(n));
  } catch {}
  dispatchEvent(new CustomEvent("kz-term-font", { detail: n }));
}

// The size a key leads to, or null when the key is not a font key.
export function fontStep(size: number, e: { code: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): number | null {
  if (e.altKey || !(e.ctrlKey || e.metaKey)) return null;
  if (e.code === "Equal") return Math.min(FONT_MAX, size + 1);
  if (e.code === "Minus") return Math.max(FONT_MIN, size - 1);
  if (e.code === "Digit0" && !e.shiftKey) return FONT_BASE;
  return null;
}
