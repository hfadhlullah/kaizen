#!/usr/bin/env node
// Smoke-test book.html in headless Chromium and screenshot it.
// Usage: node verify.mjs <output/book.html>   → screenshots in output/shots/, exit 1 on any failure.
// Checks, at 390×844 (phone) and 1280×800 (spread): no page errors, cover → contents → every chapter opens,
// nothing sticks out past a page, no horizontal scroll, flipping crosses chapter boundaries both ways,
// theme / font size / position survive a reload.
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = process.env.KAIZEN_BOOK_HOME || path.join(os.homedir(), ".kaizen", "kaizen-book");
let chromium;
try { ({ chromium } = createRequire(path.join(home, "package.json"))("playwright")); }
catch { ({ chromium } = await import("playwright")); }

const abs = path.resolve(process.argv[2] || "output/book.html"), url = "file://" + abs;
const shots = path.join(path.dirname(abs), "shots"); fs.mkdirSync(shots, { recursive: true });
const fails = [], ok = m => console.log("PASS", m), bad = m => { console.log("FAIL", m); fails.push(m); };
const browser = await chromium.launch();

for (const [name, vp] of [["phone", { width: 390, height: 844 }], ["spread", { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(url); await p.evaluate(() => window.__ready);
  await p.screenshot({ path: `${shots}/${name}-1-cover.png` });
  await p.click(".board"); await p.waitForSelector("#toc .row", { state: "visible" });
  await p.screenshot({ path: `${shots}/${name}-2-contents.png` });
  await p.click("#toc .row"); await p.waitForTimeout(400);
  await p.screenshot({ path: `${shots}/${name}-3-chapter.png` });

  // every chapter: render, count pages, find anything wider/taller than its page column
  const r = await p.evaluate(async () => {
    const out = { n: 0, clipped: [], empty: [] };
    for (let i = 0; i < CH.length; i++) {
      await openChapter(i, 0);
      const f = document.querySelector(".flow"), fr = f.getBoundingClientRect();
      if (!f.textContent.trim()) out.empty.push(i);
      for (const el of f.querySelectorAll("p,figure,img,blockquote,li,h2,h3,h4,ul,ol,pre,table")) {
        // one rect per column fragment: each must fit inside the page's text block
        for (const b of el.getClientRects()) {
          if (b.height > 0 && (b.bottom > fr.bottom + 2 || b.top < fr.top - 2)) out.clipped.push(`${i + 1}:${el.tagName}`);
          if (b.width > fr.width + 2) out.clipped.push(`${i + 1}:${el.tagName} too wide`);
        }
      }
      out.n += G.n;
    }
    return out;
  });
  r.clipped.length ? bad(`${name}: content past the page edge: ${r.clipped.slice(0, 8).join(", ")}`) : ok(`${name}: ${r.n} pages, nothing clipped`);
  r.empty.length ? bad(`${name}: empty chapters ${r.empty.join(",")}`) : ok(`${name}: every chapter has text`);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  sw > vp.width ? bad(`${name}: horizontal scroll (${sw}px)`) : ok(`${name}: no horizontal scroll`);

  // flip across a chapter boundary and back
  const pos = await p.evaluate(async () => {
    if (CH.length < 2) return null;
    await openChapter(0, -1); const lastPage = S.page;
    await flip(1); const a = [S.idx, S.page];
    await flip(-1); return { a, b: [S.idx, S.page], lastPage };
  });
  if (pos) (pos.a[0] === 1 && pos.a[1] === 0 && pos.b[0] === 0 && pos.b[1] === pos.lastPage)
    ? ok(`${name}: flip crosses chapters both ways`) : bad(`${name}: chapter boundary flip ${JSON.stringify(pos)}`);
  await p.evaluate(() => { flip(1); }); await p.waitForTimeout(250);
  await p.screenshot({ path: `${shots}/${name}-4-midflip.png` });
  await p.waitForTimeout(900);

  // settings survive reload
  await p.evaluate(async () => { S.theme = "night"; S.fs = 21; applyTheme(); await openChapter(Math.min(1, CH.length - 1), 1); });
  const want = await p.evaluate(() => [S.idx, S.page]);
  await p.screenshot({ path: `${shots}/${name}-5-night.png` });
  await p.reload(); await p.evaluate(() => window.__ready);
  await p.click(".cta"); await p.waitForTimeout(1400);
  const got = await p.evaluate(() => [S.idx, S.page, S.theme, S.fs, document.body.dataset.view]);
  (got[0] === want[0] && got[1] === want[1] && got[2] === "night" && got[3] === 21 && got[4] === "read")
    ? ok(`${name}: resume keeps chapter, page, theme, size`) : bad(`${name}: resume ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

  // page numbers run through the book: chapter 2 starts after chapter 1's pages
  const gp = await p.evaluate(async () => { if (CH.length < 2) return null; await openChapter(1, 0);
    return { off: G.off[1], first: G.counts[0], shown: +document.querySelector(".deco .pn").textContent }; });
  if (gp) (gp.off === gp.first && gp.shown === gp.off + 1) ? ok(`${name}: page numbers continue across chapters (ch 2 starts p${gp.shown})`) : bad(`${name}: global page numbers ${JSON.stringify(gp)}`);

  // a saved position past the end of the book (chapters were removed) still opens
  await p.evaluate(k => { const v = JSON.parse(localStorage.getItem(k)); v.idx = 999; localStorage.setItem(k, JSON.stringify(v)); }, await p.evaluate(() => KEY));
  await p.reload(); await p.evaluate(() => window.__ready); await p.click(".cta"); await p.waitForTimeout(1400);
  const last = await p.evaluate(() => [S.idx, CH.length - 1, document.body.dataset.view]);
  (last[0] === last[1] && last[2] === "read") ? ok(`${name}: stale saved chapter opens the last chapter`) : bad(`${name}: stale resume ${JSON.stringify(last)}`);

  errs.length ? bad(`${name}: page errors ${errs.join(" | ")}`) : ok(`${name}: no page errors`);
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `${fails.length} check(s) failed` : "all checks passed", "— screenshots in", shots);
process.exit(fails.length ? 1 : 0);
