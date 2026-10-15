// Reads social sources through a real browser on this computer, in a profile the user
// signed in to once (`kaizen browser login <platform>`). Kaizen talks to it over
// Chromium's DevTools protocol with Bun's own WebSocket, so it needs no dependency,
// only an installed Chrome, Chromium or Edge. What a page says is data: it is copied
// out, never followed, and the browser opens nothing but the source link and post
// links on the same platform.
import { existsSync, mkdirSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { home } from "./state.ts";
import { socialOf, PLATFORMS } from "./sources.ts";

export type Post = { text: string; author: string; link: string; date: string };
export type Read = { ok: true; posts: Post[] } | { ok: false; note: string };

export const profileDir = () => join(home, ".kaizen", "browser");
export const NO_BROWSER = "Install Chrome or Chromium to gather social sources.";
export const IN_USE = "The kaizen browser is already open. Close its window first.";
export const signInNote = (platform: string) => `Sign in once: kaizen browser login ${platform}`;

// Where each platform's own sign-in page is, and what a link to one post looks like.
const SIGN_IN: Record<string, string> = {
  x: "https://x.com/i/flow/login", threads: "https://www.threads.com/login",
  instagram: "https://www.instagram.com/accounts/login/", tiktok: "https://www.tiktok.com/login",
};
export const POST: Record<string, RegExp> = {
  x: /^\/[A-Za-z0-9_]{1,15}\/status\/\d+$/,
  threads: /^\/@[\w.]+\/post\/[\w-]+$/,
  instagram: /^\/(?:[\w.]+\/)?(?:p|reel)\/[\w-]+\/?$/,
  tiktok: /^\/@[\w.]+\/(?:video|photo)\/\d+$/,
};
// Grids show thumbnails, not text: each post page is opened for its caption.
const GRID = new Set(["instagram"]);

// KAIZEN_BROWSER, else the usual names on PATH, else the usual install paths.
export function findBrowser(): string | null {
  const env = process.env.KAIZEN_BROWSER;
  if (env !== undefined) return env && existsSync(env) ? env : null;
  for (const b of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "microsoft-edge-stable"]) {
    const p = Bun.which(b, { PATH: process.env.PATH ?? "" });
    if (p) return p;
  }
  const fixed = process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
    : process.platform === "win32"
      ? [process.env["ProgramFiles"], process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA].filter(Boolean).flatMap((d) => [
        join(d!, "Google", "Chrome", "Application", "chrome.exe"), join(d!, "Microsoft", "Edge", "Application", "msedge.exe")])
      : [];
  return fixed.find((p) => existsSync(p)) ?? null;
}

function profile(): string {
  const dir = profileDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") chmodSync(dir, 0o700);   // holds live sign-in cookies
  return dir;
}

// The visible window the user signs in with: one platform's sign-in page, or all
// four as tabs. No debugging port, so the sign-in pages meet an ordinary browser.
// Resolves when the window is closed.
export async function login(platform = ""): Promise<string | null> {
  const pages = platform ? [SIGN_IN[platform]] : Object.values(SIGN_IN);
  if (!pages[0]) return `Pick one of: ${Object.keys(SIGN_IN).join(", ")}`;
  const exe = findBrowser();
  if (!exe) return NO_BROWSER;
  const dir = profile();
  const p = Bun.spawn([exe, `--user-data-dir=${dir}`, "--no-first-run", "--no-default-browser-check", ...(pages as string[])], { stdout: "ignore", stderr: "ignore" });
  // A browser already on this profile takes the pages and this one exits at once.
  const quick = await Promise.race([p.exited.then(() => true), Bun.sleep(3000).then(() => false)]);
  if (quick) return IN_USE;
  await p.exited;
  return null;
}

// One DevTools session on one page.
export class Page {
  private n = 0;
  private wait = new Map<number, (m: any) => void>();
  private constructor(private ws: WebSocket) {
    ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); this.wait.get(m.id)?.(m); this.wait.delete(m.id); };
  }
  static open(url: string): Promise<Page> {
    return new Promise((ok, no) => { const ws = new WebSocket(url); ws.onopen = () => ok(new Page(ws)); ws.onerror = () => no(new Error("The browser did not answer.")); });
  }
  call(method: string, params: object = {}): Promise<any> {
    const id = ++this.n;
    return new Promise((ok, no) => {
      const t = setTimeout(() => { this.wait.delete(id); no(new Error(`The browser did not answer ${method}.`)); }, 30_000);
      this.wait.set(id, (m) => { clearTimeout(t); m.error ? no(new Error(m.error.message)) : ok(m.result); });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async js<T = any>(expr: string): Promise<T> {
    const r = await this.call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.value as T;
  }
  async go(url: string) {
    await this.call("Page.navigate", { url });
    const end = Date.now() + 20_000;
    await Bun.sleep(1500);
    while (Date.now() < end && (await this.js("document.readyState")) !== "complete") await Bun.sleep(250);
    await Bun.sleep(2000);   // the posts arrive after the page itself
  }
  close() { try { this.ws.close(); } catch { /* already gone */ } }
}

// Runs in the page: every post link on it, with the text of the smallest element
// around it that holds no other post, less the author's name, counts, times and
// buttons. X marks a post's own text; elsewhere those lines are dropped by shape.
// Kept as a string so nothing outside it is used.
const COLLECT = (re: RegExp) => `(() => {
  const re = new RegExp(${JSON.stringify(re.source)});
  const mine = (b) => b.origin === location.origin;
  const key = (a) => a.pathname.replace(/\\/$/, "");
  const when = /^(?:\\d+\\s*[smhdwy]|\\d+\\s*(?:sec|min|hour|day|week|month|year)s? ago|\\d+[smhdw] ago|\\d{1,2}-\\d{1,2}|\\d{4}-\\d{1,2}-\\d{1,2})$/i;
  const junk = /^(?:[\\d.,]+\\s*[KMBkmb]?|·|Translate|See translation|Like|Reply|Repost|Quote|Share|Follow|Following|Verified|More|Top liked|Pinned|Author|Edited)$/i;
  const posts = new Map();
  for (const a of document.querySelectorAll("a[href]")) {
    if (!mine(a) || !re.test(a.pathname)) continue;
    const k = key(a);
    if (posts.has(k)) continue;
    let box = a;
    while (box.parentElement && box.parentElement !== document.body) {
      if ([...box.parentElement.querySelectorAll("a[href]")].some((b) => mine(b) && re.test(b.pathname) && key(b) !== k)) break;
      box = box.parentElement;
    }
    const time = box.querySelector("time");
    const own = box.querySelector('[data-testid="tweetText"]');
    const names = new Set([...box.querySelectorAll("a[href]")].filter((b) => mine(b) && /^\\/@?[\\w.]+\\/?$/.test(b.pathname))
      .flatMap((b) => b.innerText.split("\\n")).map((l) => l.trim()));
    if (time) names.add(time.innerText.trim());
    const lines = (box.innerText || "").split("\\n").map((l) => l.trim()).filter(Boolean);
    const text = own ? own.innerText : lines.filter((l) => !names.has(l) && !junk.test(l) && !when.test(l)).join("\\n");
    posts.set(k, { link: location.origin + k, text, date: time ? (time.getAttribute("datetime") || time.innerText) : (lines.find((l) => when.test(l)) || "") });
  }
  return [...posts.values()];
})()`;

// A post page's own caption, for the grids.
const CAPTION = `(() => {
  const m = (p) => document.querySelector('meta[property="' + p + '"]')?.getAttribute("content") || "";
  const time = document.querySelector("time");
  return { text: m("og:description") || m("og:title"), date: time ? (time.getAttribute("datetime") || time.innerText) : "" };
})()`;

// A sign-in page. OFFERS also counts a page that offers to sign in, which tells only
// when it shows no posts: signed out, Instagram and TikTok show both.
const WALL = `(() => /\\/(login|accounts\\/login|i\\/flow\\/login|signup)/.test(location.pathname) || !!document.querySelector('input[type="password"]'))()`;
const OFFERS = `(() => ${WALL} || [...document.querySelectorAll("a[href],button,[role=button]")].some((e) => /\\/login|\\/signup/.test(e.getAttribute("href") || "") || /^(log ?in|sign ?in|continue with instagram)/i.test((e.innerText || "").trim())))()`;
// A "prove you are human" check, which only a person can pass.
const CHECK = `(() => !!document.querySelector('[id*="captcha" i],[class*="captcha" i],iframe[src*="captcha" i]') || /drag the slider|verify you are human|unusual traffic/i.test(document.body.innerText))()`;
export const checkNote = (platform: string) => `${PLATFORMS[platform]} asked for a human check. Pass it in: kaizen browser login ${platform}`;

// Instagram's caption reads `12K likes, 30 comments - user on June 1, 2026: "text".`
export function caption(raw: string): { text: string; author: string; date: string } {
  const m = /^[\d.,]+[KMB]? likes?, [\d.,]+[KMB]? comments? - ([\w.]+) on ([^:]+): "([\s\S]*)"\.?$/.exec(raw.trim());
  return m ? { author: "@" + m[1], date: m[2]!, text: m[3]! } : { text: raw, author: "", date: "" };
}

// A post's notes, as the icebox shows them: `@author · link · date`.
export const noteOf = (p: Post) => [p.author, p.link, p.date].filter(Boolean).join(" · ");

export const authorOf = (link: string) => { try { const p = new URL(link).pathname.split("/").filter(Boolean); return p[0]!.startsWith("@") ? p[0]! : p.length > 2 ? "@" + p[0] : ""; } catch { return ""; } };

// Runs `use` on one page of a headless browser in the kaizen profile, and always
// closes the browser after, whatever happens.
export async function browse<T>(use: (page: Page) => Promise<T>): Promise<T | { ok: false; note: string }> {
  const exe = findBrowser();
  if (!exe) return { ok: false, note: NO_BROWSER };
  const dir = profile();
  rmSync(join(dir, "DevToolsActivePort"), { force: true });
  // env passed explicitly: without it Bun hands the child its startup env, not process.env as it is now.
  const proc = Bun.spawn([exe, "--headless=new", `--user-data-dir=${dir}`, "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
    "--no-first-run", "--no-default-browser-check", "--window-size=1280,2000", "about:blank"], { env: process.env, stdout: "ignore", stderr: "ignore" });
  let page: Page | null = null;
  try {
    let port = "";
    // A first start on a fresh profile took over 10 s on Windows.
    for (let i = 0; i < 300 && !port; i++) {
      await Bun.sleep(100);
      try { port = readFileSync(join(dir, "DevToolsActivePort"), "utf8").split("\n")[0]!.trim(); } catch { /* not yet */ }
      if (proc.exitCode !== null) break;
    }
    if (!port) return { ok: false, note: proc.exitCode !== null ? IN_USE : "The browser did not start." };
    const tabs: any[] = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const tab = tabs.find((t) => t.type === "page");
    if (!tab) return { ok: false, note: "The browser did not start." };
    page = await Page.open(tab.webSocketDebuggerUrl);
    await page.call("Page.enable");
    // Headless Chrome names itself in its user agent; platforms answer that with a wall.
    const ua: string = (await page.call("Browser.getVersion")).userAgent;
    await page.call("Network.setUserAgentOverride", { userAgent: ua.replace("HeadlessChrome", "Chrome") });
    return await use(page);
  } catch (e) {
    return { ok: false, note: ((e as Error).message || String(e)).slice(0, 200) };
  } finally {
    page?.close();
    proc.kill();
    await Promise.race([proc.exited, Bun.sleep(5000)]);
    if (proc.exitCode === null) proc.kill(9);
  }
}

// Up to `max` posts from a social source. Never throws; the browser is always closed.
export async function readPosts(url: string, max = 40): Promise<Read> {
  const platform = socialOf(url);
  if (!platform) return { ok: false, note: "Not a social source." };
  return browse<Read>((page) => readPage(page, url, platform, max));
}

// The reading itself, on an open page. Only the source link and post links on the
// same platform (or the source's own host) are ever opened.
export async function readPage(page: Page, url: string, platform: string, max = 40): Promise<Read> {
  const host = new URL(url).host;
  const onPlatform = (l: string) => { try { return socialOf(l) === platform || new URL(l).host === host; } catch { return false; } };
  const re = POST[platform]!;
  await page.go(url);
  if (!onPlatform(await page.js<string>("location.href")) || (await page.js<boolean>(WALL))) return { ok: false, note: signInNote(platform) };
  if (await page.js<boolean>(CHECK)) return { ok: false, note: checkNote(platform) };
  const seen = new Map<string, { link: string; text: string; date: string; author?: string }>();
  for (let i = 0, still = 0; i < 12 && seen.size < max && still < 3; i++) {
    const before = seen.size;
    for (const p of await page.js<any[]>(COLLECT(re)) ?? []) if (!seen.has(p.link) && onPlatform(p.link)) seen.set(p.link, p);
    // A page that renders its posts late is not empty: stop early only once some arrived.
    still = seen.size && seen.size === before ? still + 1 : 0;
    await page.js("window.scrollBy(0, window.innerHeight * 1.5)");
    await Bun.sleep(1500);
  }
  let found = [...seen.values()].slice(0, max);
  if (GRID.has(platform)) {
    const read: typeof found = [];
    for (const p of found) {
      if (!onPlatform(p.link)) continue;
      await page.go(p.link);
      if (!onPlatform(await page.js<string>("location.href"))) continue;
      const c = await page.js<{ text: string; date: string }>(CAPTION);
      const cap = caption(c?.text ?? "");
      read.push({ link: p.link, text: cap.text || p.text, date: c?.date || cap.date || p.date, author: cap.author });
    }
    found = read;
  }
  const posts = found.map((p) => ({ link: p.link, author: p.author || authorOf(p.link), date: p.date, text: p.text.trim() })).filter((p) => p.text);
  if (!posts.length && (await page.js<boolean>(CHECK))) return { ok: false, note: checkNote(platform) };
  if (!posts.length && (await page.js<boolean>(OFFERS))) return { ok: false, note: signInNote(platform) };
  return { ok: true, posts };
}

// The one post a gathered item came from: the link in its notes (`@author · link · date`)
// that is a post on a social platform. A search or account link is not one.
export function postLink(notes = ""): string | null {
  for (const l of notes.match(/https?:\/\/\S+/g) ?? []) {
    try { const p = socialOf(l); if (p && POST[p]!.test(new URL(l).pathname.replace(/\/$/, ""))) return l; } catch { /* not a URL */ }
  }
  return null;
}

// Where each platform takes a reply on a post's own page: the box, and the button that
// sends it. Each is a selector, and for buttons known only by their words, a pattern
// for those words.
type Step = [css: string, words?: string];
const REPLY: Record<string, { box: Step; send: Step }> = {
  x: { box: ['[data-testid="tweetTextarea_0"]'], send: ['[data-testid="tweetButtonInline"],[data-testid="tweetButton"]'] },
  threads: { box: ['[contenteditable="true"]'], send: ['[role="button"]:has(svg[aria-label="Reply"])'] },
  instagram: { box: ['textarea[aria-label*="comment" i],textarea[placeholder*="comment" i]'], send: ['[role="button"],button', "^Post$"] },
  tiktok: { box: ['[data-e2e="comment-input"] [contenteditable="true"],[data-e2e="comment-input"] textarea'], send: ['[data-e2e="comment-post"]'] },
};

// Runs in the page: the first shown element a step names, looked for nearest the
// marked box first (its own composer), then in the last open dialog, then the whole
// page. Clicks it, or focuses it and marks it as the box. False when there is none.
const FIND = (s: Step, act: "click" | "focus") => `(() => {
  const words = ${JSON.stringify(s[1] ?? "")};
  const fits = (e) => e.getClientRects().length && e.getAttribute("aria-disabled") !== "true" && !e.disabled
    && (!words || new RegExp(words, "i").test((e.innerText || e.getAttribute("aria-label") || "").trim()));
  const pick = (r) => [...r.querySelectorAll(${JSON.stringify(s[0])})].find(fits);
  let near = document.querySelector("[data-kaizen-box]");
  while (near && !pick(near)) near = near.parentElement;
  const dialog = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getClientRects().length).at(-1);
  const el = [near, dialog, document].filter(Boolean).map(pick).find(Boolean);
  if (!el) return false;
  ${act === "click" ? "(el.closest('[role=\"button\"],button') || el).click();" : "el.focus(); document.querySelectorAll('[data-kaizen-box]').forEach((e) => e.removeAttribute('data-kaizen-box')); el.setAttribute('data-kaizen-box', '');"}
  return true;
})()`;
const BOX = `(() => { const b = document.querySelector("[data-kaizen-box]"); return b && b.isConnected && b.getClientRects().length ? (b.value ?? b.innerText ?? "") : null; })()`;

export type Sent = { ok: true } | { ok: false; note: string; sent?: boolean };

// Posts `text` as a reply on one post, in the kaizen profile. `sent` says the send
// button was pressed, whether or not the page then showed the reply went out.
export async function sendReply(link: string, text: string): Promise<Sent> {
  const platform = socialOf(link);
  if (!platform || !REPLY[platform]) return { ok: false, note: "Not a social post." };
  return browse<Sent>((page) => replyOn(page, link, platform, text));
}

// The reply itself, on an open page. Only the post's own link is opened, and nothing
// is typed anywhere once the page has left the post's host.
export async function replyOn(page: Page, link: string, platform: string, text: string): Promise<Sent> {
  const how = REPLY[platform]!, host = new URL(link).host, name = PLATFORMS[platform] ?? platform;
  const here = async () => { try { return new URL(await page.js<string>("location.href")).host === host; } catch { return false; } };
  await page.go(link);
  if (!(await here()) || (await page.js<boolean>(WALL))) return { ok: false, note: signInNote(platform) };
  if (await page.js<boolean>(CHECK)) return { ok: false, note: checkNote(platform) };
  if (!(await page.js<boolean>(FIND(how.box, "focus"))))
    return { ok: false, note: (await page.js<boolean>(OFFERS)) ? signInNote(platform) : `Could not find the reply box on ${name}. Nothing was posted.` };
  await page.call("Input.insertText", { text });
  await Bun.sleep(800);
  if (!(await here())) return { ok: false, note: `The page left ${name}. Nothing was posted.` };
  if (!(await page.js<boolean>(FIND(how.send, "click")))) return { ok: false, note: `Could not find ${name}'s send button. Nothing was posted.` };
  // Sent once the box is gone or emptied; still holding the text means it did not go.
  for (let i = 0; i < 20; i++) {
    await Bun.sleep(500);
    const left = await page.js<string | null>(BOX);
    if (left === null || !left.trim()) return { ok: true };
  }
  return { ok: false, sent: true, note: `${name} did not confirm the reply. Check the post before replying again.` };
}
