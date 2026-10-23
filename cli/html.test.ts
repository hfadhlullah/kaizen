import { expect, test } from "bun:test";
import { html, ico, raw } from "../web/board/dom.ts";

test("html escapes interpolations once and keeps trusted markup", () => {
  const bad = '<img src=x onerror=1> & "q"';
  const out = String(html`<b title="${bad}">${bad}</b>`);
  expect(out).not.toContain("<img");
  expect(out).toContain("&lt;img src=x onerror=1&gt; &amp; &quot;q&quot;");
  expect(String(html`${"a&b"}`)).toBe("a&amp;b");
  expect(String(html`${raw("<i>")}${ico("x")}`)).toBe('<i><svg><use href="#i-x"/></svg>');
  expect(String(html`<ul>${[1, 2].map((n) => html`<li>${n}</li>`)}</ul>`)).toBe("<ul><li>1</li><li>2</li></ul>");
  expect(String(html`${["<a>"]}`)).toBe("&lt;a&gt;");
  expect(String(html`[${null}${undefined}${false}]`)).toBe("[]");
  expect(String(html`${html`<u>${"&"}</u>`}`)).toBe("<u>&amp;</u>");
});

test("aria states render false explicitly when stringified", () => {
  expect(String(html`<b aria-pressed="${String(false)}" aria-checked="${String(true)}">`)).toBe('<b aria-pressed="false" aria-checked="true">');
});
