// Builds an A4 PDF from a Markdown GDD: pandoc to HTML with assets/gdd.css, then Chromium print.
// Usage: node gdd-pdf.mjs docs/GDD.md [docs/GDD.pdf]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './pw.mjs';

const md = process.argv[2]; if (!md) { console.error('usage: node gdd-pdf.mjs <GDD.md> [out.pdf]'); process.exit(2); }
const out = process.argv[3] || md.replace(/\.md$/i, '.pdf');
const css = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'gdd.css');
const title = (fs.readFileSync(md, 'utf8').match(/^#\s+(.+)$/m) || [, path.basename(md, '.md')])[1];
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-')), 'gdd.html');
execFileSync('pandoc', ['-f', 'gfm', md, '-s', '--metadata', 'title=' + title, '-c', css, '--embed-resources', '-o', tmp]);
const b = await chromium.launch(), p = await b.newPage();
await p.goto('file://' + tmp, { waitUntil: 'networkidle' });
await p.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } });
await b.close(); console.log('wrote', out);
