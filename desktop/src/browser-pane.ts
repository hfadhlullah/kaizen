// The Browser tab's page as Orca does it: a <webview> in its own persistent session, so the
// page is a first-party page with its own cookie jar (an iframe on the board's 127.0.0.1
// origin made localhost:8000 third-party, and its Lax session cookie never came back: a
// login answered 419). Pure policy here so a test can run it without Electron.

export const PANE_PARTITION = "persist:kaizen-browser";

const loopback = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";

// The board's <webview> asks for these settings; this decides what the guest actually gets.
// Returns null to refuse the attach (a src that is not a web page).
export function paneAttach(params: Record<string, any>, prefs: Record<string, any>, preload: string): string | null {
  const src = String(params.src ?? "about:blank");
  if (src !== "about:blank" && !/^https?:\/\//i.test(src)) return null;
  params.partition = PANE_PARTITION;
  delete params.nodeintegration;
  delete params.nodeintegrationinsubframes;
  delete params.plugins;
  delete params.disablewebsecurity;
  delete params.webpreferences;
  delete params.preload;
  Object.assign(prefs, { nodeIntegration: false, nodeIntegrationInSubFrames: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, preload });
  delete prefs.preloadURL;
  return src;
}

// A guest never leaves the web: no file:, no kaizen-desktop:, no app scheme.
export const paneNavigable = (url: string) => /^(https?:\/\/|about:blank$)/i.test(url);

// What a page in the pane may ask the user's machine for. Screen capture, microphone and
// camera only for a page on this computer (a dev app being tested, say), never a site on the web.
const LOCAL_ONLY = new Set(["media", "display-capture", "clipboard-read", "notifications", "fullscreen"]);
const ANY = new Set(["clipboard-sanitized-write", "fullscreen"]);
export function paneAllows(permission: string, origin: string): boolean {
  if (ANY.has(permission)) return true;
  if (!LOCAL_ONLY.has(permission)) return false;
  try { return loopback(new URL(origin).hostname); } catch { return false; }
}
