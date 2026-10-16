// Records the real board for the README hero: bun assets/hero/capture.ts
//
// A scratch project with sample ideas, a scratch HOME, and fake-claude first on the
// board's PATH, so pressing Run opens the card's terminal on a scripted session that
// writes the run's files. Headless Chromium is driven over CDP and screencast to
// assets/hero/public/frames/*.jpg plus frames.json (file, ms since start), and
// marks.json names the moments the video cuts to. Nothing touches a real project.
import { mkdirSync, rmSync, writeFileSync, copyFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PORT = 7493, CDP = 9333, W = 1440, H = 810;
const here = import.meta.dir, repo = join(here, "..", "..");
const root = join(tmpdir(), "kaizen-hero");
const proj = join(root, "acme-pay"), home = join(root, "home"), bin = join(root, "bin");
const out = join(here, "public", "frames");
const idea = "Retry the payment webhook when the bank times out";

rmSync(root, { recursive: true, force: true });
rmSync(out, { recursive: true, force: true });
for (const d of [join(proj, ".kaizen", "runs"), join(home, ".kaizen"), bin, out]) mkdirSync(d, { recursive: true });
Bun.spawnSync(["git", "init", "-q"], { cwd: proj });
copyFileSync(join(here, "fake-claude"), join(bin, "claude")); chmodSync(join(bin, "claude"), 0o755);
writeFileSync(join(home, ".kaizen", "projects"), proj + "\n");
writeFileSync(join(home, ".kaizen", "config.yml"), "agent:\n  default: claude\n  launch: card\nsources:\n  agent: agent\n");
writeFileSync(join(proj, ".kaizen", "inbox.md"), `# Inbox\n\n- open: Dark mode for the invoice PDF\n- open: CSV export for refunds\n`);
const at = new Date().toISOString(), sheet = "https://docs.google.com/spreadsheets/d/acme-support-requests";
writeFileSync(join(proj, ".kaizen", "sources.json"), JSON.stringify([{ url: sheet, label: "Support sheet", added: at, last: { at, ok: true, added: 3, note: "3 new requests" }, seen: [] }]));
writeFileSync(join(proj, ".kaizen", "icebox.json"), JSON.stringify([
  { id: "a1", text: idea, notes: "Two customers saw a failed payment that the bank had actually taken.", source: sheet, category: "Bugs", at, status: "new" },
  { id: "a2", text: "Let finance download refunds as CSV", source: sheet, category: "Feedback", at, status: "new" },
  { id: "a3", text: "Invoice PDF is unreadable in dark mode", source: sheet, category: "Feedback", at, status: "new" },
], null, 2));

const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` };
const srv = Bun.spawn(["bun", join(repo, "cli", "install.ts"), "web", "--port", String(PORT), "--no-open"],
  { cwd: proj, env, stdout: "ignore", stderr: Bun.file(join(root, "web.log")) });
const chrome = Bun.spawn(["chromium", "--headless", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${CDP}`,
  `--window-size=${W},${H}`, `--user-data-dir=${join(root, "chrome")}`, "about:blank"], { stdout: "ignore", stderr: "ignore" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ws!: WebSocket, seq = 0;
const waiting = new Map<number, (v: any) => void>();
const cdp = (method: string, params = {}) => new Promise<any>((r) => { waiting.set(++seq, r); ws.send(JSON.stringify({ id: seq, method, params })); });
const js = async (expr: string) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true })).result?.result?.value;
// Moves a visible cursor dot to the element, then clicks it. The dot is drawn by the
// page so it shows in the screencast; the video replaces it with a nicer pointer.
const click = async (t: string, sel = "button,.card,a,[role=tab],select,option") => {
  const ok = await js(`(() => {
    const e = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.offsetParent && e.textContent.trim().includes(${JSON.stringify(t)})).pop();
    if (!e) return false; e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect();
    window.__cur = { x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2 };
    return true; })()`);
  if (!ok) { await shot("fail"); throw new Error("no element: " + t); }
  const p = await js("JSON.stringify(window.__cur)"); const { x, y } = JSON.parse(p);
  pointer.push({ t: Date.now() - t0, x, y }); await sleep(700);
  // Found again at click time: the board re-renders on every change event, and the
  // element measured 700 ms ago may be gone.
  await js(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.offsetParent && e.textContent.trim().includes(${JSON.stringify(t)})).pop()?.click()`);
  await sleep(400);
};
const frames: { f: string; t: number }[] = [], marks: Record<string, number> = {}, pointer: { t: number; x: number; y: number }[] = [];
let t0 = 0;
const mark = (k: string) => (marks[k] = Date.now() - t0);
const until = async (expr: string, ms = 20000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) if (await js(expr)) return; throw new Error("timed out: " + expr); };
const runStage = () => Bun.file(join(proj, ".kaizen", "runs", "2026-10-16-retry-payment-webhook", "state.json")).json().then((s: any) => s.stage + ":" + s.awaiting).catch(() => "");
const stage = async (want: string) => { for (let i = 0; i < 100 && (await runStage()) !== want; i++) await sleep(200); };

try {
  for (let i = 0; i < 40 && !ws; i++) {
    await sleep(250);
    try { const t = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json() as any[]; const p = t.find((x) => x.type === "page"); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
  }
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.method === "Page.screencastFrame") {
      const f = `${String(frames.length).padStart(4, "0")}.jpg`;
      frames.push({ f, t: Date.now() - t0 });
      Bun.write(join(out, f), Buffer.from(m.params.data, "base64"));
      cdp("Page.screencastFrameAck", { sessionId: m.params.sessionId });
      return;
    }
    waiting.get(m.id)?.(m); waiting.delete(m.id);
  };
  await cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/state`); break; } catch { await sleep(250); } }
  await cdp("Page.navigate", { url: `http://localhost:${PORT}/?dir=${encodeURIComponent(join(proj, ".kaizen"))}` });
  await until(`document.body.innerText.includes("CSV export")`);
  await sleep(800);

  t0 = Date.now();
  await cdp("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  mark("start"); await sleep(1000);
  await click("All projects", "#proj"); await sleep(500);
  await click("acme-pay", "#projs button"); mark("project"); await sleep(1000);
  await click("Icebox", ".rail a"); mark("icebox"); await sleep(1500);
  await shot("check-icebox");
  await click(idea, ".ice-row,li,div[role=row],button"); await sleep(1000);
  await click("Promote", "#ice-ok"); mark("promote"); await sleep(1500);
  await click("Board", ".rail a"); mark("board"); await sleep(1500);
  await click(idea, ".card"); mark("idea-open"); await sleep(1200);
  await click("Run", ".foot button,button"); await sleep(1000);
  await shot("check-runbox");
  await click("Full run", "button"); mark("run");
  await until(`[...document.querySelectorAll(".card")].some(c => c.textContent.includes("retry-payment-webhook"))`, 30000);
  await sleep(800);
  await js(`document.querySelector('[aria-label="Close"]')?.click()`); await sleep(500);
  await click("retry-payment-webhook", ".card"); mark("terminal");
  await stage("plan:approvals.plan"); await sleep(3000);
  await shot("check-term");
  await click("Plan", "[role=tab],.tabs button,button"); mark("plan"); await sleep(2500);
  await shot("check-plan");
  await click("Approve", "button"); mark("approve");
  await sleep(1500); await shot("check-build");
  await stage("review:findings"); await sleep(2500);
  await shot("check-review-term");
  await click("Review", "[role=tab],.tabs button,button"); mark("findings"); await sleep(2000);
  await shot("check-findings");
  await click("2. low", ".fixes label,label"); await sleep(600);
  await click("Fix 1", "button"); mark("fix");
  await stage("done:null"); await sleep(2500);
  await shot("check-fix-term");
  await click("", '[aria-label="Close"]'); mark("done"); await sleep(3000);
  await shot("check-done");
} finally {
  await cdp("Page.stopScreencast").catch(() => {});
  writeFileSync(join(here, "public", "frames.json"), JSON.stringify({ frames, marks, pointer }, null, 1));
  ws?.close(); chrome.kill(); srv.kill();
}

async function shot(name: string) {
  const { result } = await cdp("Page.captureScreenshot", { format: "png" });
  await Bun.write(join(root, name + ".png"), Buffer.from(result.data, "base64"));
}
