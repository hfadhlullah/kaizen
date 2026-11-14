// xterm.js ships as its own script (dist/term.js, web/term/term.ts), which sets window.kzTerm once it loads: mount a terminal
// on /pty in `el` and get back the function that unmounts it, plus two calls to every terminal mounted now (before term.js
// loads there are none, so asking is harmless). The board calls these when the look or the font size changes.
export type KzTerm = ((el: HTMLElement, key: string, onEnd?: () => void) => () => void) & {
  retheme(): void; // the board's light/dark or colour changed
  font(n: number): void; // the font size was set
};
export const termNow = () => (globalThis as { kzTerm?: KzTerm }).kzTerm;
