// Films a web product in use, for app-promo (references/promo.md).
//
//   node scripts/record.mjs videos/<name>            # reads videos/<name>/record.json
//
// record.json: {"url": "http://...", "clips": [{"name": "idea", "device": "phone"|"tablet"|"desktop",
//   "path": "/optional/start/path", "steps": [["wait", ms], ["tap", "css" | "text:Label"], ["type", "css", "text", msPerKey?],
//   ["key", "Enter"], ["scroll", px], ["goto", "/path"]], "prep": [same steps, run before filming starts, e.g. a sign-in]}]}
// Writes videos/<name>/rec/<clip>.mp4 (30 fps, the device's full pixels) and rec/<clip>.json
// ({device, cssW, cssH, taps: [{t, x, y}]}, x/y in CSS px of the page, t in seconds of the clip).
// Frames are full-resolution screenshots taken in a loop while the steps run (Chromium's own screencast
// is capped at CSS pixels). Point "url" at a sandbox or a demo account: everything on screen is filmed.
import { createRequire } from "module";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const DEVICES = {
  phone: { width: 430, height: 932, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true },
  tablet: { width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
};

// puppeteer-core ships with the HyperFrames CLI in the npx cache; find it rather than add a dependency.
function puppeteer() {
  const root = path.join(os.homedir(), ".npm", "_npx");
  for (const d of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const m = path.join(root, d, "node_modules", "puppeteer-core");
    if (fs.existsSync(m)) return createRequire(path.join(root, d, "node_modules", "x.js"))("puppeteer-core");
  }
  throw new Error("puppeteer-core not found: run `npx -y hyperframes@0.8.176 --version` once, then retry");
}
const chromium = () => ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => fs.existsSync(p))
  || (() => { throw new Error("no Chromium found"); })();

const vdir = process.argv[2];
if (!vdir) { console.error("usage: node record.mjs videos/<name>"); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(path.join(vdir, "record.json"), "utf8"));
const out = path.join(vdir, "rec");
fs.mkdirSync(out, { recursive: true });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer().launch({ executablePath: chromium(), args: ["--no-sandbox"] });

for (const clip of spec.clips) {
  const dev = DEVICES[clip.device];
  if (!dev) throw new Error(`clip ${clip.name}: unknown device ${clip.device}`);
  const p = await b.newPage();
  await p.setViewport(dev);
  await p.goto(new URL(clip.path || "/", spec.url).href, { waitUntil: "networkidle2" });
  await W(800);
  const taps = [];
  let t0 = Date.now();
  // A visible element by CSS or by its exact text ("text:Add").
  const find = async (q) => {
    const all = q.startsWith("text:") ? await p.$$(`xpath/.//*[self::button or self::a or self::label or @role='tab' or @role='button'][normalize-space()=${JSON.stringify(q.slice(5))}]`) : await p.$$(q);
    for (const e of all) if (await e.evaluate((n) => n.getBoundingClientRect().width > 0)) return e;
    throw new Error(`clip ${clip.name}: nothing visible matches ${q}`);
  };
  const steps = async (list, log) => {
    for (const [op, a, b2, c] of list) {
      if (op === "wait") await W(a);
      else if (op === "tap") {
        const el = await find(a);
        const r = await el.evaluate((e) => { const x = e.getBoundingClientRect(); return { x: x.x + x.width / 2, y: x.y + x.height / 2 }; });
        if (log) taps.push({ t: (Date.now() - t0) / 1000 + 0.35, x: r.x, y: r.y });
        await W(log ? 350 : 0);
        await el.evaluate((e) => e.click());
      } else if (op === "type") { await (await find(a)).focus(); await p.keyboard.type(b2, { delay: log ? (c ?? 55) : 0 }); }
      else if (op === "key") await p.keyboard.press(a);
      else if (op === "scroll") await p.mouse.wheel({ deltaY: a });
      else if (op === "goto") await p.goto(new URL(a, spec.url).href, { waitUntil: "networkidle2" });
      else throw new Error(`clip ${clip.name}: unknown step ${op}`);
    }
  };
  if (clip.prep) { await steps(clip.prep, false); await W(800); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rec-${clip.name}-`));
  const frames = [];
  t0 = Date.now();
  let on = true, n = 0;
  const loop = (async () => {
    while (on) {
      const file = path.join(dir, `${String(n++).padStart(5, "0")}.jpg`);
      const t = (Date.now() - t0) / 1000;
      await p.screenshot({ path: file, type: "jpeg", quality: 90 });
      frames.push({ file, t });
    }
  })();
  await steps(clip.steps, true);
  await W(300);
  on = false;
  await loop;
  await p.close();
  // Variable-rate frames to a 30 fps clip: each frame holds until the next was taken.
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.t ?? f.t + 0.5) - f.t).toFixed(4)}`).join("\n") + `\nfile '${frames.at(-1).file}'\n`;
  fs.writeFileSync(path.join(dir, "list.txt"), list);
  const mp4 = path.join(out, `${clip.name}.mp4`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"),
    "-vf", "fps=30,crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-g", "15", mp4]);
  fs.writeFileSync(path.join(out, `${clip.name}.json`), JSON.stringify({ device: clip.device, cssW: dev.width, cssH: dev.height, seconds: frames.at(-1).t, taps }, null, 1));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`recorded ${mp4}: ${frames.length} frames, ${(frames.length / frames.at(-1).t).toFixed(1)} fps, ${taps.length} taps`);
}
await b.close();
