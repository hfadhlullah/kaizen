#!/usr/bin/env bun
// Measured alignment audit of the web board: `bun run audit:ui`. A dev tool, not a kaizen
// command. It starts a scratch board (copied runs, its own HOME and port, so no real state is
// touched), drives headless Chromium over CDP through every screen and open state, in light and
// dark at 1400px and 400px, and measures with getBoundingClientRect instead of by eye:
//   row     controls in one centred row whose visible content sits off the row's centre
//   column  stacked siblings whose left edges differ from the majority by 1-4px
//   size    one component class (.btn, .ib, .chk, .sel …) drawn at two heights on one screen
//   bars    top bars side by side whose first rows do not share a centre
// Exceptions live in ui-audit.allow.json, each with a reason. Output: <out>/report.md and a
// screenshot per flagged screen with the flagged boxes outlined.
//
//   bun run audit:ui [--out DIR] [--only NAME[,NAME]] [--from PROJECT] [--port N] [--shots] [--keep]
// --shots saves a screenshot of every state, flagged or not; --keep leaves the scratch folder.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { findBrowser, Page } from "./browser.ts";

const repo = resolve(import.meta.dir, "..");
const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- what is measured, in the page. Kept as one function so the fixture test runs the same code.
export type Flag = { rule: "row" | "column" | "size" | "bars"; path: string; px: number; box: [number, number, number, number]; note: string };

// Runs in the page; returns the flags. No closure over anything outside it.
export function measure(bars: string[][], variants: string[] = []): Flag[] {
  const out: Flag[] = [];
  const vw = innerWidth, vh = innerHeight;
  const cs = (e: Element) => getComputedStyle(e);
  const shown = (e: Element) => {
    const r = e.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1 || r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) return false;
    // Also false inside a closed <details>, whose content keeps its boxes but is not drawn.
    return e.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
  };
  const inFlow = (e: Element) => { const p = cs(e).position; return p !== "absolute" && p !== "fixed"; };
  const path = (e: Element) => {
    const bits: string[] = [];
    for (let n: Element | null = e; n && n !== document.body && bits.length < 4; n = n.parentElement) {
      const cls = [...n.classList].filter((c) => !/^(on|open|sel|active|cur|hot|ro|split)$/.test(c)).slice(0, 2);
      bits.unshift(n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + (cls.length ? "." + cls.join(".") : ""));
      if (n.id) break;
    }
    return bits.join(">");
  };
  const box = (r: DOMRect): [number, number, number, number] => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  // What the eye sees of an element: the union of its glyphs, icons, images and form controls.
  // An icon counts by its box, as icons are drawn centred in their viewBox and laid out by it.
  const ink = (e: Element): DOMRect | null => {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    const add = (q: DOMRect) => { if (q.width < 1 || q.height < 1) return; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); };
    const walk = (n: Node) => {
      if (n.nodeType === 3) {
        if (!n.textContent!.trim()) return;
        const g = document.createRange(); g.selectNodeContents(n);
        for (const q of g.getClientRects()) add(q);
        return;
      }
      if (n.nodeType !== 1) return;
      const el = n as Element;
      if (!shown(el)) return;
      // Not part of the row as drawn: a closed <details> beyond its summary, or a popup laid over it.
      if (el.parentElement?.tagName === "DETAILS" && !(el.parentElement as HTMLDetailsElement).open && el.tagName !== "SUMMARY") return;
      if (el !== e && !inFlow(el)) return;
      const tag = el.tagName;
      const s = cs(el);
      // A drawn thing with its own box: an icon, an image, a control, or a box with a visible border, ring or fill.
      const filled = s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent";
      const bordered = (parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderBottomWidth) > 0 && s.borderTopStyle !== "none") || s.boxShadow !== "none";
      if (tag === "svg" || tag === "IMG" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "CANVAS" || tag === "VIDEO" || filled || bordered) {
        return add(el.getBoundingClientRect());
      }
      for (const c of el.childNodes) walk(c);
    };
    walk(e);
    return l === Infinity ? null : new DOMRect(l, t, r - l, b - t);
  };

  const all = [...document.body.querySelectorAll("*")].filter((e) => !e.closest("svg") || e.tagName === "svg");
  for (const el of all) {
    if (!shown(el)) continue;
    const s = cs(el);
    const kids = [...el.children].filter((c) => shown(c) && inFlow(c) && c.tagName !== "BR");
    if (kids.length < 2) continue;
    const flexRow = (s.display.includes("flex") && !s.flexDirection.startsWith("column")) || (s.display.includes("grid") && s.gridAutoFlow.startsWith("column"));
    // ---- row: the row's line is the median of its children's box centres; each child's ink must sit on it.
    if (flexRow && s.alignItems === "center") {
      const lines: Element[][] = [];
      for (const k of kids) {
        const r = k.getBoundingClientRect();
        const line = lines.find((ln) => { const q = ln[0]!.getBoundingClientRect(); return r.top < q.bottom && r.bottom > q.top; });
        line ? line.push(k) : lines.push([k]);
      }
      for (const ln of lines) {
        if (ln.length < 2) continue;
        const mids = ln.map((k) => { const r = k.getBoundingClientRect(); return r.top + r.height / 2; }).sort((a, b) => a - b);
        const line = mids[Math.floor(mids.length / 2)]!;
        for (const k of ln) {
          const i = ink(k);
          // A block over 48px tall (lines of text, a card) is judged by its box, which the row centres.
          if (!i || i.height > 48) continue;
          const d = i.top + i.height / 2 - line;
          if (Math.abs(d) >= 1) out.push({ rule: "row", path: path(k), px: Math.round(d * 10) / 10, box: box(i), note: "centre off the row by" });
        }
      }
    }
    // ---- column: stacked siblings, the ink's left edge against the majority.
    const stacked = kids.every((k, j) => j === 0 || k.getBoundingClientRect().top >= kids[j - 1]!.getBoundingClientRect().bottom - 1);
    if (stacked && kids.length >= 3) {
      const lefts = kids.map((k) => ink(k)?.left ?? null);
      const count = new Map<number, number>();
      for (const v of lefts) if (v !== null) count.set(Math.round(v), (count.get(Math.round(v)) ?? 0) + 1);
      const [mode, n] = [...count].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
      if (n >= 2) kids.forEach((k, j) => {
        const v = lefts[j];
        if (v === null || v === undefined) return;
        const d = v - mode;
        if (Math.abs(d) >= 1 && Math.abs(d) <= 4) out.push({ rule: "column", path: path(k), px: Math.round(d * 10) / 10, box: box(ink(k)!), note: "left edge off the column by" });
      });
    }
  }

  // ---- size: one component, one height on a screen.
  const kinds: [string, (e: Element) => string | null][] = [
    ["btn", (e) => e.classList.contains("btn") ? "btn" + [...e.classList].filter((c) => c !== "btn" && /^(sm|xs|lg|ghost|pri|primary|danger|icon|wide)$/.test(c)).sort().map((c) => "." + c).join("") : null],
    ["ib", (e) => e.classList.contains("ib") ? "ib" + [...e.classList].filter((c) => /^(xs|sm|lg)$/.test(c)).sort().map((c) => "." + c).join("") : null],
    ["chk", (e) => e.classList.contains("chk") ? (e.classList.contains("sm") ? "chk.sm" : "chk") : null],
    ["sel", (e) => e.classList.contains("sel") && e.tagName !== "TEXTAREA" ? "sel" : null],
  ];
  const sizes = new Map<string, Map<number, Element[]>>();
  for (const el of document.querySelectorAll(".btn,.ib,.chk,.sel")) {
    if (!shown(el)) continue;
    for (const [, sig] of kinds) {
      const s0 = sig(el);
      if (!s0) continue;
      // A deliberate compact or large group (ui-audit.allow.json "variant") is sized against itself only.
      const v = variants.find((q) => el.matches(q));
      const k = v ? `${s0} in ${v}` : s0;
      const h = Math.round(el.getBoundingClientRect().height);
      const m = sizes.get(k) ?? new Map();
      sizes.set(k, m);
      m.set(h, [...(m.get(h) ?? []), el]);
    }
  }
  for (const [k, m] of sizes) {
    if (m.size < 2) continue;
    const major = [...m].sort((a, b) => b[1].length - a[1].length)[0]![0];
    for (const [h, els] of m) if (h !== major) for (const el of els) out.push({ rule: "size", path: path(el), px: h - major, box: box(el.getBoundingClientRect()), note: `.${k} height ${h}px, most are ${major}px; off by` });
  }

  // ---- bars: groups of top bars that sit side by side; their first rows share a centre.
  const firstRow = (bar: Element) => {
    const leaves = [...bar.querySelectorAll("button,a,summary,select,input,h1,h2,h3,svg,span,b,small,label,pre")]
      .filter((e) => shown(e) && !e.closest("svg:not(:scope)") && !(e.tagName !== "svg" && e.querySelector("button,a,summary,select,input,svg,span,b,small,label")));
    const rects = leaves.map((e) => ink(e)).filter((r): r is DOMRect => !!r);
    if (!rects.length) return null;
    const top = Math.min(...rects.map((r) => r.top));
    const row = rects.filter((r) => r.top < top + Math.min(...rects.filter((q) => q.top === top).map((q) => q.height)));
    const mids = row.map((r) => r.top + r.height / 2).sort((a, b) => a - b);
    return mids[Math.floor(mids.length / 2)]!;
  };
  for (const group of bars) {
    const found = group.map((sel) => [sel, document.querySelector(sel)] as const).filter(([, e]) => e && shown(e)) as [string, Element][];
    if (found.length < 2) continue;
    const ref = firstRow(found[0]![1]);
    if (ref === null) continue;
    const a = found[0]![1].getBoundingClientRect();
    for (const [sel, e] of found.slice(1)) {
      // Only bars side by side: they share some height and none of their width (a phone stacks them).
      const b = e.getBoundingClientRect();
      if (b.top >= a.bottom || b.bottom <= a.top || (b.left < a.right && b.right > a.left)) continue;
      const c = firstRow(e);
      if (c === null) continue;
      const d = c - ref;
      if (Math.abs(d) >= 1) out.push({ rule: "bars", path: sel, px: Math.round(d * 10) / 10, box: box(e.getBoundingClientRect()), note: `first row centre ${Math.round(c)}px against ${found[0]![0]} at ${Math.round(ref)}px; off by` });
    }
  }
  return out;
}

// ---- the scratch board and the browser
const arg = (name: string, dflt = "") => { const i = Bun.argv.indexOf(name); return i > 0 ? Bun.argv[i + 1] ?? dflt : dflt; };

// A project to copy runs from: --from, else the main checkout this worktree belongs to, else this one.
export function sourceProject(): string {
  const f = arg("--from");
  if (f) return resolve(f);
  const g = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: repo });
  const main = g.exitCode === 0 ? dirname(g.stdout.toString().trim()) : repo;
  return existsSync(join(main, ".kaizen", "runs")) ? main : repo;
}

// Copies the project's .kaizen without worktrees, attachments or big files, and only the newest runs.
export function scratchProject(root: string, from: string): string {
  const dst = join(root, "project");
  const src = join(from, ".kaizen");
  mkdirSync(join(dst, ".kaizen", "runs"), { recursive: true });
  // A repository with one commit: the board offers New workspace and shows a branch only in one.
  const git = (...a: string[]) => Bun.spawnSync(["git", "-c", "user.name=ui-audit", "-c", "user.email=ui-audit@localhost", ...a], { cwd: dst });
  git("init", "-q", "-b", "main");
  git("commit", "-q", "--allow-empty", "-m", "scratch");
  if (!existsSync(src)) return dst;
  const small = (p: string) => { const s = statSync(p); return s.isDirectory() ? !/[\\/](attachments|wt|sessions)$/.test(p) : s.size < 512_000; };
  for (const f of readdirSync(src)) if (!["runs", "wt", "sessions", "attachments", "automations.json"].includes(f) && small(join(src, f))) cpSync(join(src, f), join(dst, ".kaizen", f), { recursive: true, filter: small });
  const runs = existsSync(join(src, "runs")) ? readdirSync(join(src, "runs")).sort().slice(-40) : [];
  const live = /[\\/](terminals|handoff|workers)\.json$/;
  for (const r of runs) {
    const to = join(dst, ".kaizen", "runs", r);
    cpSync(join(src, "runs", r), to, { recursive: true, filter: (p) => small(p) && !live.test(p) });
    // A copied run points at nothing real: no worktree, branch or agent session of the source project.
    const sf = join(to, "state.json");
    try {
      const s = JSON.parse(readFileSync(sf, "utf8"));
      for (const k of ["worktree", "branch", "session", "base_branch", "base_sha", "workspace"]) delete s[k];
      writeFileSync(sf, JSON.stringify(s));
    } catch { /* no state: the board shows it as it is */ }
  }
  return dst;
}

export async function startBoard(root: string, project: string, port: number) {
  const home = join(root, "home");
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  writeFileSync(join(home, ".kaizen", "projects"), project + "\n");
  writeFileSync(join(home, ".kaizen", "onboarding.json"), JSON.stringify({ step: 0, outcome: "done" }) + "\n");
  const env = { ...process.env, HOME: home, USERPROFILE: home } as Record<string, string>;
  delete env.KAIZEN_HOME;
  const log = Bun.file(join(root, "board.log"));
  const proc = Bun.spawn([process.execPath, join(repo, "cli", "install.ts"), "web", "--port", String(port), "--no-open", "--foreground"], { cwd: project, env, stdout: log, stderr: log });
  for (let i = 0; i < 150; i++) {
    await nap(200);
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return proc; } catch { /* not yet */ }
    if (proc.exitCode !== null) break;
  }
  proc.kill();
  throw new Error(`The scratch board did not start on port ${port}; see ${join(root, "board.log")}`);
}

export async function startBrowser(root: string) {
  const exe = findBrowser();
  if (!exe) throw new Error("No Chrome or Chromium found.");
  const prof = join(root, "chrome");
  mkdirSync(prof, { recursive: true });
  // --no-sandbox only on CI, whose runners can refuse Chrome the namespaces its sandbox needs.
  const proc = Bun.spawn([exe, "--headless=new", `--user-data-dir=${prof}`, "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", ...(process.env.CI ? ["--no-sandbox"] : []), "--font-render-hinting=none", "--force-device-scale-factor=1", "--window-size=1400,900", "about:blank"],
    { env: process.env, stdout: "ignore", stderr: "ignore" });
  let port = "";
  for (let i = 0; i < 300 && !port; i++) {
    await nap(100);
    try { port = readFileSync(join(prof, "DevToolsActivePort"), "utf8").split("\n")[0]!.trim(); } catch { /* not yet */ }
  }
  if (!port) { proc.kill(); throw new Error("The browser did not start."); }
  const tab = ((await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as any[]).find((t) => t.type === "page");
  const page = await Page.open(tab.webSocketDebuggerUrl);
  await page.call("Page.enable");
  await page.call("Runtime.enable");
  return { proc, page };
}

export async function view(page: Page, width: number, dark: boolean) {
  await page.call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width <= 640 });
  await page.call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }, { name: "prefers-reduced-motion", value: "reduce" }] });
}

// Waits for the page to stop moving: no running animations and no layout change for 300ms.
export async function settle(page: Page, ms = 6000) {
  const end = Date.now() + ms;
  let last = "";
  while (Date.now() < end) {
    await nap(300);
    const now = await page.js<string>(`document.readyState + document.getAnimations().filter(a => a.playState === "running" && isFinite(a.effect?.getTiming?.().iterations ?? 1)).length + ":" + document.body.getBoundingClientRect().height + ":" + document.querySelectorAll("*").length`);
    if (now === last && now.startsWith("complete0")) return;
    last = now;
  }
}

// ---- screens and states. `open` runs in the page after load: click() waits for a shown element, then clicks it.
type Screen = { name: string; url: string; widths?: number[]; open?: string };
const BARS = [[".rail .top", ".hdr", "#rbar", "#panel>header", ".pstrip"], ["#sback", "#smain h2"]];
const SETTINGS = ["general", "appearance", "notifications", "keyboard", "terminal", "agents", "models", "accounts", "skills", "runs", "approvals", "autofix", "orchestration", "automations", "git", "integrations", "mobile"];

function screens(dir: string, run: string, emptyWs: { dir: string; ws: string }): Screen[] {
  const D = encodeURIComponent(dir);
  const RUN = `/?view=run&dir=${D}&id=${encodeURIComponent(run)}`;
  const EMPTY = `/?view=ws&dir=${encodeURIComponent(emptyWs.dir)}&ws=${encodeURIComponent(emptyWs.ws)}`;
  const D1 = [1400], P = [400];
  return [
    { name: "board", url: "/?view=board", widths: D1 }, // a phone shows Home for the board
    { name: "board-runs", url: "/?view=board", widths: D1, open: `await click("[data-m=runs]")` },
    { name: "card-menu", url: "/?view=board", widths: D1, open: `await click("[data-m=runs]"); await click("[data-a=menu]", true)` },
    { name: "card-drawer", url: "/?view=board", widths: D1, open: `await click("[data-m=runs]"); await click("main#board>section:last-of-type li .card")` },
    { name: "projects-filter", url: "/?view=board", widths: D1, open: `await click("#proj")` },
    { name: "showing", url: "/?view=board", widths: D1, open: `await click("#show")` },
    { name: "new-task", url: "/?view=board", widths: D1, open: `await click("#newtop")` },
    { name: "add-project", url: "/?view=board", widths: D1, open: `await click("#padd")` },
    { name: "new-workspace", url: "/?view=board", widths: D1, open: `await click("#padd"); await click("[data-go=ws]")` },
    { name: "tasks", url: "/?view=tasks" },
    { name: "run-form", url: "/?view=tasks", widths: D1, open: `await click(".go[data-i]", false, "Start")` },
    { name: "icebox", url: "/?view=icebox" },
    { name: "home", url: "/" },
    { name: "chat", url: "/?view=chat", widths: P },
    { name: "terminal", url: "/?view=terminal" },
    { name: "notes", url: "/notebook" },
    { name: "video", url: "/video" },
    ...SETTINGS.map((p) => ({ name: "settings-" + p, url: "/?view=settings&page=" + p })),
    { name: "run", url: RUN },
    { name: "run-none", url: EMPTY, widths: D1 },
    { name: "run-plus", url: RUN, widths: D1, open: `await click("#rtabs details.radd:not(.rsplit) > summary")` },
    { name: "run-split", url: RUN, widths: D1, open: `await click("#rtabs details.rsplit > summary")` },
    { name: "run-picker", url: RUN, widths: D1, open: `await click("#ppick")` },
    { name: "run-history", url: RUN, widths: D1, open: `await click("#rtabs details.radd:not(.rsplit) > summary"); await click("[data-n=history]")` },
    { name: "phone-runs", url: "/?view=device", widths: P },
    { name: "phone-new", url: "/", widths: P, open: `await click("#phome .pag-new")` },
  ];
}

const PRELUDE = `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (s, ms = 6000) => { const end = Date.now() + ms; for (;;) { const e = [...document.querySelectorAll(s)].find((x) => x.checkVisibility() && x.getBoundingClientRect().width > 0); if (e) return e; if (Date.now() > end) throw new Error("not found: " + s); await sleep(150); } };
// force: the element may be drawn only on hover; text: the first match whose text starts with it.
const click = async (s, force = false, text = "") => {
  const e = force ? document.querySelector(s) : text ? [...document.querySelectorAll(s)].find((x) => x.textContent.trim().startsWith(text)) : await until(s);
  if (!e) throw new Error("not found: " + s + (text ? " " + text : ""));
  e.scrollIntoView({ block: "nearest" }); e.click(); await sleep(400);
};`;

type Hit = Flag & { screen: string; at: string };
// path + rule: a flag to accept. variant: a selector whose controls form their own size group.
type Allow = { screen?: string; path?: string; rule?: string; variant?: string; reason: string };

const allowed = (h: Hit, allow: Allow[]) => allow.find((a) => a.path && (!a.screen || a.screen === h.screen || (a.screen.endsWith("*") && h.screen.startsWith(a.screen.slice(0, -1)))) && a.rule === h.rule && h.path.includes(a.path));

// Draws each flagged box on the page, takes a screenshot, and removes the boxes.
async function outlined(page: Page, flags: Flag[], file: string) {
  await page.js(`(() => { for (const [x, y, w, h] of ${JSON.stringify(flags.map((f) => f.box))}) { const d = document.createElement("div"); d.className = "kz-audit-box"; d.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;outline:2px solid #f0f;left:" + (x - 2) + "px;top:" + (y - 2) + "px;width:" + (w + 4) + "px;height:" + (h + 4) + "px"; document.body.append(d); } })()`);
  const r = await page.call("Page.captureScreenshot", { format: "png" });
  await Bun.write(file, Buffer.from(r.data, "base64"));
  await page.js(`document.querySelectorAll(".kz-audit-box").forEach((d) => d.remove())`);
}

export async function audit(base: string, list: Screen[], out: string, page: Page, allow: Allow[], shots = false) {
  const variants = allow.flatMap((a) => (a.variant ? [a.variant] : []));
  const hits: Hit[] = [];
  const broken: string[] = [];
  for (const s of list) for (const width of s.widths ?? [1400, 400]) for (const dark of [false, true]) {
    const at = `${dark ? "dark" : "light"} ${width}`;
    await view(page, width, dark);
    // Each state starts from a clean browser: no board mode, filter or theme left by the one before.
    await page.call("Storage.clearDataForOrigin", { origin: base, storageTypes: "local_storage,session_storage" });
    await page.call("Page.navigate", { url: base + s.url });
    await settle(page);
    if (s.open) {
      const r = await page.call("Runtime.evaluate", { expression: `(async () => { ${PRELUDE}\n${s.open} })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) { broken.push(`${s.name} (${at}): ${r.exceptionDetails.exception?.description?.split("\n")[0] ?? r.exceptionDetails.text}`); continue; }
      await settle(page);
    }
    const r = await page.call("Runtime.evaluate", { expression: `(${measure.toString()})(${JSON.stringify(BARS)}, ${JSON.stringify(variants)})`, returnByValue: true });
    if (r.exceptionDetails) { broken.push(`${s.name} (${at}): measure threw ${r.exceptionDetails.exception?.description?.split("\n")[0]}`); continue; }
    const flags: Flag[] = r.result.value ?? [];
    const open = flags.filter((f) => !allowed({ ...f, screen: s.name, at }, allow));
    if (open.length || shots) await outlined(page, open, join(out, `${s.name}-${dark ? "dark" : "light"}-${width}.png`));
    for (const f of flags) hits.push({ ...f, screen: s.name, at });
    console.log(`${s.name.padEnd(24)} ${at.padEnd(11)} ${open.length} flagged${flags.length - open.length ? `, ${flags.length - open.length} allowed` : ""}`);
  }
  return { hits, broken };
}

// One line per finding; the same offset in several themes or widths is one line naming them.
export function report(hits: Hit[], broken: string[], allow: Allow[], screensRun: number): { text: string; flagged: number } {
  const group = new Map<string, Hit[]>();
  // The same offset on the same element is one line, naming every screen and state it shows on.
  for (const h of hits) { const k = [allowed(h, allow)?.reason ?? "", h.rule, h.path, h.px].join("|"); group.set(k, [...(group.get(k) ?? []), h]); }
  const lines: string[] = [], ok: string[] = [];
  for (const hs of group.values()) {
    const h = hs[0]!;
    const a = allowed(h, allow);
    const where = [...new Set(hs.map((x) => x.screen))].map((sc) => `${sc} (${[...new Set(hs.filter((x) => x.screen === sc).map((x) => x.at))].join(", ")})`).join("; ");
    const line = `- ${h.rule} · \`${h.path}\` · ${h.note} ${h.px > 0 ? "+" : ""}${h.px}px · ${where}`;
    a ? ok.push(`${line} — allowed: ${a.reason}`) : lines.push(line);
  }
  const text = [`# UI alignment audit`, ``, `${screensRun} screen states measured; ${lines.length} flagged, ${ok.length} allowed${broken.length ? `, ${broken.length} could not be opened` : ""}.`, ``,
    `## Flagged`, ``, ...(lines.length ? lines : ["None."]), ``, `## Allowed`, ``, ...(ok.length ? ok : ["None."]),
    ...allow.filter((a) => a.variant).map((a) => `- size · \`${a.variant}\` is its own size group — ${a.reason}`),
    ...(broken.length ? [``, `## Could not open`, ``, ...broken.map((b) => `- ${b}`)] : []), ``].join("\n");
  return { text, flagged: lines.length };
}

if (import.meta.main) {
  const out = resolve(arg("--out", join(tmpdir(), "ui-audit")));
  const only = arg("--only").split(",").filter(Boolean);
  const port = Number(arg("--port", "7459"));
  const root = mkdtempSync(join(tmpdir(), "kz-ui-audit-"));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const allowFile = join(import.meta.dir, "ui-audit.allow.json");
  const allow: Allow[] = existsSync(allowFile) ? JSON.parse(readFileSync(allowFile, "utf8")) : [];
  let board: ReturnType<typeof Bun.spawn> | undefined, browser: Awaited<ReturnType<typeof startBrowser>> | undefined;
  let code = 1;
  try {
    const project = scratchProject(root, sourceProject());
    board = await startBoard(root, project, port);
    browser = await startBrowser(root);
    const base = `http://127.0.0.1:${port}`;
    const st: any = await (await fetch(base + "/state")).json();
    const runs = st.cards.filter((c: any) => c.kind === "run");
    const run = (runs.find((c: any) => !["done", "abandoned"].includes(c.status)) ?? runs[0])?.id ?? "";
    const empty = st.projects.flatMap((p: any) => p.workspaces.map((w: any) => ({ dir: p.dir, ws: w.path }))).find((w: any) => !runs.some((c: any) => c.state === w.dir)) ?? { dir: "", ws: "" };
    const list = screens(join(project, ".kaizen"), run, empty).filter((s) => !only.length || only.some((o) => s.name === o || (o.endsWith("*") && s.name.startsWith(o.slice(0, -1)))));
    const { hits, broken } = await audit(base, list, out, browser.page, allow, Bun.argv.includes("--shots"));
    const n = list.reduce((a, s) => a + (s.widths ?? [1400, 400]).length * 2, 0);
    const r = report(hits, broken, allow, n);
    writeFileSync(join(out, "report.md"), r.text);
    console.log(`\n${r.flagged} flagged, ${broken.length} could not be opened. Report: ${join(out, "report.md")}`);
    code = r.flagged || broken.length ? 1 : 0;
  } catch (e) {
    console.error((e as Error).message);
  } finally {
    browser?.page.close();
    browser?.proc.kill();
    board?.kill();
    await Promise.all([browser?.proc.exited, board?.exited]);
    if (!Bun.argv.includes("--keep")) rmSync(root, { recursive: true, force: true });
    else console.log(`Scratch kept: ${root}`);
  }
  process.exit(code);
}
