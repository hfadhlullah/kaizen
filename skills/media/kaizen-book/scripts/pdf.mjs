#!/usr/bin/env node
// Print book.html to PDFs with headless Chromium.
// Usage: node pdf.mjs <output/book.html> [--only color,mono,volumes,og]
// Writes next to book.html: book.pdf (A5 colour), book-mono.pdf (black and white),
// book-vol-N.pdf (one per volumes[] entry in book.json; black and white, or colour with "volume_print": "color") and og.jpg (1200×630 link preview).
// Needs poppler's pdfinfo to put page numbers in the contents.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = process.env.KAIZEN_BOOK_HOME || path.join(os.homedir(), ".kaizen", "kaizen-book");
let chromium;
try { ({ chromium } = createRequire(path.join(home, "package.json"))("playwright")); }
catch { try { ({ chromium } = await import("playwright")); } catch { console.error("playwright missing: run scripts/setup.sh"); process.exit(1); } }

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error("usage: node pdf.mjs <output/book.html> [--only color,mono,volumes,og]"); process.exit(1); }
const only = rest.includes("--only") ? rest[rest.indexOf("--only") + 1].split(",") : ["color", "mono", "volumes", "og"];
const abs = path.resolve(file), dir = path.dirname(abs), url = "file://" + abs;
const errors = [];
const browser = await chromium.launch();

async function open(hash, viewport = { width: 600, height: 850 }) {
  const p = await browser.newPage({ viewport });
  p.on("pageerror", e => errors.push(e.message));
  await p.goto(url + "#" + hash);
  await p.evaluate(() => window.__ready);
  await p.emulateMedia({ media: "print" });
  return p;
}
// Page of each #ch-N / #part-N, read from the PDF's named destinations (Chromium writes one per link target).
function dests(pdf) {
  const map = {};
  for (const line of execFileSync("pdfinfo", ["-dests", pdf], { encoding: "utf8" }).split("\n")) {
    const m = line.match(/^\s*(\d+)\s.*"((?:ch|part)-\d+)"\s*$/);
    if (m) map[m[2]] = +m[1];
  }
  return map;
}
const pages = pdf => +execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)[1];

// Two passes: lay out, read where each chapter landed, write the numbers into the contents, print again.
async function printBook(hash, out, ranges = "") {
  const p = await open(hash);
  const tmp = out + ".tmp.pdf";
  await p.pdf({ path: tmp, preferCSSPageSize: true, printBackground: true });
  const map = dests(tmp);
  await p.evaluate(m => window.__fillToc(m), map);
  await p.pdf({ path: tmp, preferCSSPageSize: true, printBackground: true });
  const check = dests(tmp);
  if (JSON.stringify(check) !== JSON.stringify(map)) console.warn("warning: contents numbers shifted the layout in", path.basename(out));
  if (ranges) await p.pdf({ path: out, preferCSSPageSize: true, printBackground: true, pageRanges: ranges });
  else fs.renameSync(tmp, out);
  fs.rmSync(tmp, { force: true });
  await p.close();
  return { map: check, total: pages(out) };
}

let colorRun, full;
if (only.includes("color")) { colorRun = await printBook("print", path.join(dir, "book.pdf")); console.log("book.pdf", colorRun.total, "pages"); }
if (only.includes("mono")) { full = await printBook("print&mono", path.join(dir, "book-mono.pdf")); console.log("book-mono.pdf", full.total, "pages"); }

if (only.includes("volumes")) {
  const p = await open("print");
  const vols = await p.evaluate(() => B.volumes || []), color = await p.evaluate(() => B.volume_print === "color");
  const titled = await p.evaluate(() => B.parts.map((x, i) => x.title ? i : -1).filter(i => i >= 0));
  await p.close();
  if (vols.length) {
    // page numbers come from the full book in the same colour mode the volumes are printed in
    const base = color ? "print" : "print&mono";
    const whole = color ? (colorRun ||= await printBook(base, path.join(dir, "book.pdf"))) : (full ||= await printBook(base, path.join(dir, "book-mono.pdf")));
    // from_part is 1-based over parts with a title; a volume runs to the page before the next one starts.
    const starts = vols.map((v, k) => {
      if (k === 0) return 1;
      const id = "part-" + titled[v.from_part - 1];
      if (!whole.map[id]) throw new Error(`volume "${v.label}": part ${v.from_part} not found`);
      return whole.map[id];
    });
    for (let k = 0; k < vols.length; k++) {
      const end = k + 1 < vols.length ? starts[k + 1] - 1 : whole.total;
      const ranges = k === 0 ? `1-${end}` : `1,${starts[k]}-${end}`; // later volumes reuse page 1 as their cover
      const out = path.join(dir, `book-vol-${k + 1}.pdf`);
      await printBook(base + "&vol=" + encodeURIComponent(vols[k].label), out, ranges);
      console.log(path.basename(out), `${vols[k].label}: pages ${ranges}`, `(${pages(out)} pages)`);
    }
  }
}

if (only.includes("og")) {
  const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  p.on("pageerror", e => errors.push(e.message));
  await p.goto(url + "#og"); await p.evaluate(() => window.__ready);
  await p.screenshot({ path: path.join(dir, "og.jpg"), type: "jpeg", quality: 85 });
  console.log("og.jpg");
}
await browser.close();
if (errors.length) { console.error("page errors:", errors); process.exit(1); }
