// A check for the checker: the measuring code of `bun run audit:ui`, run in a real browser on a
// fixture page, flags a row off by 2px and nothing else. Skipped where no Chrome or Chromium is found.
import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findBrowser } from "./browser.ts";
import { measure, startBrowser, view } from "./ui-audit.ts";

const FIXTURE = `<!doctype html><meta charset="utf-8"><body style="margin:0;font:13px sans-serif">
<div id="aligned" style="display:flex;align-items:center;gap:8px;height:40px"><span>Aligned</span><button>One</button><button>Two</button></div>
<div id="off" style="display:flex;align-items:center;gap:8px;height:40px"><span>Off</span><button>One</button><button style="position:relative;top:2px">Two</button></div>
<div id="list"><p style="margin:0">First</p><p style="margin:0">Second</p><p style="margin:0;padding-left:12px">Indented</p><p style="margin:0">Fourth</p></div>
</body>`;

test.skipIf(!findBrowser())("ui-audit flags the row off by 2px, not the aligned row or the 12px indent", async () => {
  const root = mkdtempSync(join(tmpdir(), "kz-ui-audit-test-"));
  const b = await startBrowser(root);
  try {
    await view(b.page, 800, false);
    await b.page.call("Page.navigate", { url: "data:text/html;charset=utf-8," + encodeURIComponent(FIXTURE) });
    for (let i = 0; i < 50 && (await b.page.js("document.readyState")) !== "complete"; i++) await Bun.sleep(100);
    const r = await b.page.call("Runtime.evaluate", { expression: `(${measure.toString()})([])`, returnByValue: true });
    const flags = r.result.value;
    expect(flags.map((f: any) => [f.rule, f.px, f.path])).toEqual([["row", 2, "div#off>button"]]);
  } finally {
    b.page.close();
    b.proc.kill();
    await b.proc.exited;
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
