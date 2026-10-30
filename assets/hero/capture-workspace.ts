// Records the real workspace view for the landing page: bun assets/hero/capture-workspace.ts
//
// Scratch project, scratch HOME, fake-agent first on the board's PATH and a dummy app on
// :5199. Chromium is screencast over CDP into out/ws/ and ffmpeg builds
// site/media/workspace.mp4 and .gif. Nothing touches a real project.
import { mkdirSync, rmSync, writeFileSync, copyFileSync, chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PORT = 7494, CDP = 9334, W = 1440, H = 860;
const here = import.meta.dir, repo = join(here, "..", "..");
const root = join(tmpdir(), "kaizen-ws-hero");
const proj = join(root, "northstar"), home = join(root, "home"), bin = join(root, "bin"), out = join(here, "out", "ws");
rmSync(root, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true });
for (const d of [join(proj, ".kaizen", "runs"), join(home, ".kaizen"), bin, out]) mkdirSync(d, { recursive: true });
Bun.spawnSync(["git", "init", "-q"], { cwd: proj });
copyFileSync(join(here, "fake-agent"), join(bin, "claude")); chmodSync(join(bin, "claude"), 0o755);
writeFileSync(join(home, ".kaizen", "projects"), proj + "\n");
writeFileSync(join(home, ".zshrc"), "PS1='$ '\n");
writeFileSync(join(home, ".kaizen", "config.yml"), "agent:\n  default: claude\n  launch: card\n");
const bars = [38, 44, 41, 52, 58, 55, 67, 72, 70, 81, 88, 96];
const kpi = (l: string, v: string, d: string, c: string) => `<div class="k"><small>${l}</small><b>${v}</b><i style="color:${c}">${d}</i></div>`;
const alert = (w: string, a: string, t: string) => `<li><span>${w}</span><b>${a}</b><small>${t}</small></li>`;
const app = `<!doctype html><title>Northstar</title><style>*{box-sizing:border-box}body{margin:0;font:14px system-ui;background:#0b1020;color:#e8ecf6}main{padding:22px 26px;display:grid;gap:14px}header{display:flex;justify-content:space-between;align-items:center}h1{font-size:21px;margin:0}header span{color:#8d99b5}.ks{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.k,.c{background:#141b31;border-radius:14px;padding:15px}.k small,.c h2{color:#8d99b5;font-size:12px;font-weight:500;margin:0}.k b{display:block;font-size:25px;margin:6px 0 2px}.k i{font-style:normal;font-size:12px}.r{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.bars{display:flex;align-items:flex-end;gap:7px;height:170px;margin-top:14px}.bars u{flex:1;border-radius:5px 5px 0 0;background:linear-gradient(#6d8bff,#3b4fd0)}ul{list-style:none;margin:10px 0 0;padding:0}li{display:grid;grid-template-columns:1fr auto;padding:9px 0;border-top:1px solid #232c47}li small{color:#8d99b5}li b{color:#ff7b72}</style><main><header><h1>Northstar Revenue</h1><span>Oct 2026</span></header><section class="ks">${kpi("MRR", "$284,120", "+12.4%", "#5fd28a")}${kpi("Net churn", "1.8%", "-0.3 pts", "#5fd28a")}${kpi("Active accounts", "1,942", "+86", "#5fd28a")}${kpi("Failed payments", "$6,430", "7 open", "#ff7b72")}</section><section class="r"><div class="c"><h2>Revenue, last 12 months</h2><div class="bars">${bars.map((b) => `<u style="height:${b}%"></u>`).join("")}</div></div><div class="c"><h2>Failed payment alerts</h2><ul>${alert("Globex Corp", "$2,115", "Card expired · 4 min ago")}${alert("Initech", "$1,240", "Bank declined · 31 min ago")}${alert("Umbrella Ltd", "$860", "Bank timeout · 2 h ago")}</ul></div></section></main>`;
const site = Bun.serve({ port: 5199, fetch: () => new Response(app, { headers: { "content-type": "text/html; charset=utf-8" } }) });
const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` };
const srv = Bun.spawn(["bun", join(repo, "cli", "install.ts"), "web", "--port", String(PORT), "--no-open"], { cwd: proj, env, stdout: "ignore", stderr: Bun.file(join(root, "web.log")) });
const chrome = Bun.spawn(["chromium", "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${CDP}`, `--window-size=${W},${H}`, `--user-data-dir=${join(root, "chrome")}`, "about:blank"], { stdout: "ignore", stderr: "ignore" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ws!: WebSocket, seq = 0;
const waiting = new Map<number, (v: any) => void>();
const cdp = (method: string, params = {}) => new Promise<any>((r) => { waiting.set(++seq, r); ws.send(JSON.stringify({ id: seq, method, params })); });
const js = async (expr: string) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true })).result?.result?.value;
const find = (t: string, sel: string) => `[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.offsetParent && e.textContent.trim().includes(${JSON.stringify(t)})).pop()`;
// Drawn in the page so the screencast carries it; it moves first, then the click lands.
let phone = false; // the phone take is taps only: no cursor, no zoom
const moveTo = async (expr: string, zoom = 1, nearTop = false) => {
  if (phone) return;
  await js(`(() => { const e = ${expr}; if (!e) return; const r = e.getBoundingClientRect(), z = window.__z || 1, o = window.__o || [0, 0];
    const x = (r.left + Math.min(r.width / 2, 70) - o[0]) / z + o[0], y = (r.top + (${nearTop} ? 60 / z : r.height / 2) - o[1]) / z + o[1];
    window.__z = ${zoom}; window.__o = [x, y];
    document.getElementById("kz-cur").style.transform = "translate(" + x + "px," + y + "px)";
    document.body.style.transformOrigin = x + "px " + y + "px"; document.body.style.transform = "scale(${zoom})"; })()`);
  await sleep(850);
};
const cursor = () => js(`(() => { if (document.getElementById("kz-cur")) return; const c = document.createElement("div"); c.id = "kz-cur"; c.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transition:transform .6s cubic-bezier(.2,.8,.2,1);transform:translate(720px,430px);filter:drop-shadow(0 2px 4px #0009)"; c.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 2l15 12h-8l-3 8z" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>'; document.body.appendChild(c); document.documentElement.style.background = "#000"; document.documentElement.style.overflow = "hidden"; document.body.style.transition = "transform .75s cubic-bezier(.3,.7,.2,1), transform-origin .75s cubic-bezier(.3,.7,.2,1)"; })()`);
const click = async (t: string, sel = "button,a,summary,[role=tab]") => {
  await moveTo(find(t, sel));
  const ok = await js(`(() => { const e = ${find(t, sel)}; if (!e) return false; e.click(); return true; })()`);
  if (!ok) { await shot("fail"); throw new Error("no element: " + t); }
  await sleep(700);
};
const plus = `[...document.querySelectorAll('summary[title="New tab"]')].filter(e => e.offsetParent)[0]`;
const newAgent = async () => { await moveTo(plus); await js(`${plus}.click()`); await sleep(500); await click("New agent here", 'button[data-n^="agent:"]'); };
const type = async (text: string) => {
  await moveTo(`[...document.querySelectorAll(".xterm-screen")].filter(e => e.offsetParent).pop()`, 1, true);
  await js(`[...document.querySelectorAll(".xterm-helper-textarea")].filter(e => e.closest("[class]").offsetParent).pop()?.focus()`);
  for (const ch of text) { await cdp("Input.insertText", { text: ch }); await sleep(35); }
  await sleep(400);
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
};
async function shot(name: string) { const { result } = await cdp("Page.captureScreenshot", { format: "png" }); await Bun.write(join(root, name + ".png"), Buffer.from(result.data, "base64")); }
const run = join(proj, ".kaizen", "runs", "2026-10-30-revenue-dashboard");
const frames: { f: string; t: number }[] = [];
let t0 = 0, dir = out;
const flush = () => writeFileSync(join(dir, "list.txt"), frames.map((f, i) => `file '${f.f}'\nduration ${Math.max(0, ((frames[i + 1]?.t ?? f.t + 2000) - f.t) / 1000).toFixed(3)}`).join("\n") + "\n");
try {
  for (let i = 0; i < 40 && !ws; i++) { await sleep(250); try { const t = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json() as any[]; const p = t.find((x) => x.type === "page"); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {} }
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.method === "Page.screencastFrame") {
      const f = `${String(frames.length).padStart(5, "0")}.jpg`; frames.push({ f, t: Date.now() - t0 });
      Bun.write(join(dir, f), Buffer.from(m.params.data, "base64")); cdp("Page.screencastFrameAck", { sessionId: m.params.sessionId }); return;
    }
    waiting.get(m.id)?.(m); waiting.delete(m.id);
  };
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/state`); break; } catch { await sleep(250); } }
  await cdp("Page.navigate", { url: `http://localhost:${PORT}/` }); await sleep(2500);
  await js(`localStorage.setItem("kz-theme","dark");document.documentElement.dataset.theme="dark"`);
  await js(`[...document.querySelectorAll(".rail *")].filter(e => e.children.length === 0 && e.textContent.trim() === "main" && e.offsetParent)[0]?.click()`); await sleep(1800);
  await shot("c1");
  t0 = Date.now();
  await cdp("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: W, maxHeight: H });
  await cursor(); await sleep(800);
  await newAgent(); await sleep(1500);
  await js(`[...document.querySelectorAll(".ph")].filter(h => h.querySelector("span")?.textContent.trim() === "shell").forEach(h => h.querySelector("[data-x]")?.click())`); await sleep(500);
  await shot("c1b");
  await type("Build a revenue dashboard with failed payment alerts"); await sleep(3000);
  await type("Only above $500"); await sleep(2500); await shot("c2");
  await click("Approve", "button"); await sleep(1500); await shot("c3");
  for (let i = 0; i < 60 && !(await Bun.file(join(run, "03-impl.md")).exists()); i++) await sleep(300);
  await sleep(1800);
  await newAgent(); await sleep(1400);
  await type("Review this run from the request, the plan and the diff"); await sleep(4500); await shot("c4");
  await sleep(3500); await shot("c5");
  const browserOpen = await js(`[...document.querySelectorAll(".rtab")].some(e => e.textContent.includes("Browser"))`);
  if (!browserOpen) { await moveTo(plus); await js(`${plus}.click()`); await sleep(500); await click("Browser", ".menu-pop button").catch(() => {}); }
  await js(`(() => { const i = [...document.querySelectorAll("form input")].filter(e => e.offsetParent && /localhost/.test(e.value)).pop(); if (i) { i.value = "http://localhost:5199/"; i.form.requestSubmit(); } })()`); await sleep(3500); await shot("c6");
  await moveTo(`[...document.querySelectorAll(".rtab")].find(e => e.textContent.includes("Browser"))`, 1); await sleep(2600);
  await click("Approve", "button"); await sleep(600);
  await click("Claude Code", ".rtab"); await sleep(1200);
  for (let i = 0; i < 30; i++) { const s = await Bun.file(join(run, "state.json")).json(); if (s.stage === "done") break; await sleep(300); }
  await sleep(900); await moveTo(`[...document.querySelectorAll(".rtab")][0]`, 1); await sleep(3000); await shot("c7");
  // The same run on a phone: the Runs list, then its card.
  await cdp("Page.stopScreencast"); flush();
  frames.length = 0; dir = join(out, "phone"); mkdirSync(dir, { recursive: true });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 800, deviceScaleFactor: 2, mobile: true });
  await cdp("Page.navigate", { url: `http://localhost:${PORT}/` }); await sleep(2500); phone = true;
  t0 = Date.now();
  await cdp("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 780, maxHeight: 1600 });
  await sleep(1000); await click("Runs"); await sleep(1500); await click("Done", "button,summary,div").catch(() => {}); await sleep(1500); await shot("p1");
  await click("Build a revenue dashboard", "button,a,li,[role=button],div"); await sleep(3000); await shot("p2");
  await js(`scrollTo(0, 0)`); await sleep(1500);
} finally {
  await cdp("Page.stopScreencast").catch(() => {}); flush();
  ws?.close(); chrome.kill(); srv.kill(); site.stop(true);
}
