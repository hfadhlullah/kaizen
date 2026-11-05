// Smoke test: load a page (or each ?screen=) at phone and desktop size, fail on errors and horizontal overflow.
// Usage: node smoke.mjs <url> [--screens hub,result,view=spectator] [--param screen] [--out shots] [--wait 2500] [--gpu]
// An entry with "=" is added to the query as is; others become ?<param>=<entry>. Exit 1 on any failure.
import fs from 'node:fs';
import { chromium, SOFT, GPU, arg, flag } from './pw.mjs';

const base = process.argv[2];
if (!base || base.startsWith('--')) { console.error('usage: node smoke.mjs <url> [--screens a,b] [--out shots] [--gpu]'); process.exit(2); }
const screens = String(arg('screens', '')).split(',').filter(Boolean), param = arg('param', 'screen');
const out = arg('out', 'shots'), wait = +arg('wait', 2500);
fs.mkdirSync(out, { recursive: true });
const SIZES = [['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]];
const url = s => { if (!s) return base; const u = new URL(base); const [k, v] = s.includes('=') ? s.split('=') : [param, s]; u.searchParams.set(k, v); return u.href; };

const b = await chromium.launch({ args: flag('gpu') ? GPU : SOFT });
let fails = 0;
for (const [size, opts] of SIZES) {
  const ctx = await b.newContext(opts);
  for (const s of screens.length ? screens : ['']) {
    const p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    p.on('response', r => { if (r.status() >= 400) errs.push(`http ${r.status()}: ${r.url()}`); });
    p.on('requestfailed', r => r.failure()?.errorText !== 'net::ERR_ABORTED' && errs.push(`failed: ${r.url()} ${r.failure()?.errorText}`));
    try { await p.goto(url(s), { waitUntil: 'networkidle', timeout: 30000 }); } catch (e) { errs.push('load: ' + e.message.split('\n')[0]); }
    await p.waitForTimeout(wait);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth).catch(() => 0);
    if (ov > 1) errs.push(`horizontal overflow ${ov}px`);
    const name = `${out}/${size}-${(s || 'page').replace(/[^\w-]+/g, '_')}.png`;
    await p.screenshot({ path: name }).catch(e => errs.push('screenshot: ' + e.message));
    console.log(`${errs.length ? 'FAIL' : 'PASS'} ${size} ${s || '(page)'}  ${name}`);
    errs.forEach(e => console.log('     ' + e)); fails += errs.length ? 1 : 0;
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log(fails ? `${fails} failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
