// The run panel's width: dragged from its left edge, kept in localStorage, and clamped to between 260 px (or 60% of the
// window when that is wider) and what was asked for.
export const GRIP_KEY = "kz-rpanel-w";
export const GRIP_MIN = 260;
export const gripWidth = (w: number, win: number) =>
  Math.round(Math.min(Math.max(GRIP_MIN, win * 0.6), Math.max(GRIP_MIN, w)));
export const setPanelWidth = (w: number) =>
  document.documentElement.style.setProperty("--rpanel-w", `${gripWidth(w, innerWidth)}px`);
