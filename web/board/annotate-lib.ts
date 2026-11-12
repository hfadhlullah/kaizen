// Pure helpers of the annotator (annotate.ts), kept apart so a test can load them without a page.

// A message from the page counts only from the frame itself, the proxy's origin and this open's token.
export const accept = (e: { source: unknown; origin: string; data: any }, frameWin: unknown, origin: string, token: string) =>
  !!origin && e.source === frameWin && e.origin === origin && !!e.data && e.data.kz === 1 && e.data.t === token;

// The desktop app's Browser tab is a <webview>: the page's messages arrive over its IPC channel, from
// that element only, so the token is all there is to check.
export const acceptHost = (d: any, token: string) => !!d && d.kz === 1 && d.t === token && !!token;

// The page reports its address on the proxy; the board shows the app's own. Anything not on the proxy's
// origin (a javascript: or data: URL, another site) is null: the page is untrusted and must not set the board's address.
export const mapUrl = (href: string, origin: string, target: string): string | null => {
  try { const u = new URL(href); return u.origin === origin ? target + u.pathname + u.search + u.hash : null; } catch { return null; }
};

// A crop from the page goes into an <img src> in the board: only a small PNG data URL passes.
export const safeCrop = (c: unknown): string | undefined => (typeof c === "string" && c.length < 1_400_000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(c) ? c : undefined);
export const MAX_BOARD_NOTES = 200;
