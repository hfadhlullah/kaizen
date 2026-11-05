// Frame timing around one interaction. Usage:
//   node frames.mjs <url> [--click x,y | --tap x,y | --selector css] [--ms 2500] [--size 2000x1100] [--settle 5000] [--gpu]
// Wraps requestAnimationFrame before the page loads, so it works on any page. Prints the WebGL renderer
// (SwiftShader = CPU, timings meaningless), frame gaps p50/p95/max, frames over 33 ms, and long tasks.
import { chromium, SOFT, GPU, arg, flag } from './pw.mjs';

const url = process.argv[2];
if (!url || url.startsWith('--')) { console.error('usage: node frames.mjs <url> [--click x,y] [--gpu]'); process.exit(2); }
const [w, h] = String(arg('size', '1440x900')).split('x').map(Number), ms = +arg('ms', 2500);
const tap = arg('tap'), b = await chromium.launch({ headless: true, args: flag('gpu') ? GPU : SOFT });
const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: !!tap, isMobile: !!tap });
await p.addInitScript(() => {
  window.__fr = []; window.__lt = [];
  const raf = window.requestAnimationFrame.bind(window);
  // count each animation frame once, whatever number of callbacks the page queues in it
  let lastT = -1; window.requestAnimationFrame = cb => raf(t => { if (t !== lastT) { lastT = t; window.__fr.push(t); } cb(t); });
  try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch {}
});
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(+arg('settle', 5000));
console.log('renderer:', await p.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'); const d = g && g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'no WebGL'; }));
const t0 = await p.evaluate(() => { window.__fr = []; window.__lt = []; return performance.now(); });
const xy = s => String(s).split(',').map(Number);
if (arg('click')) await p.mouse.click(...xy(arg('click')));
else if (tap) await p.touchscreen.tap(...xy(tap));
else if (arg('selector')) await p.click(arg('selector'));
await p.waitForTimeout(ms);
const { fr, lt } = await p.evaluate(() => ({ fr: window.__fr, lt: window.__lt }));
await b.close();
const gaps = fr.slice(1).map((t, i) => t - fr[i]).sort((a, z) => a - z), q = k => gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(k * gaps.length))].toFixed(1) : '-';
console.log(`frames ${fr.length} in ${ms} ms (${(fr.length / ms * 1000).toFixed(0)} fps)  gap p50 ${q(.5)}  p95 ${q(.95)}  max ${q(1)} ms  over 33 ms: ${gaps.filter(g => g > 33).length}`);
const late = lt.filter(([s]) => s >= t0);
console.log(late.length ? 'long tasks: ' + late.map(([s, d]) => `+${Math.round(s - t0)}ms ${d}ms`).join(', ') : 'long tasks: none');
if (errs.length) { console.log('page errors:', errs.join(' | ')); process.exit(1); }
